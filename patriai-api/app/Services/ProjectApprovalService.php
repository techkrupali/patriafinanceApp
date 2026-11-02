<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\WalletMember;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * MLS-03 Approval settings: who approves each milestone on a project (any one,
 * everyone, a number of them, or named people), an override for a single
 * milestone, and a site-visit photo from an approver on big ones. MLS-02 the
 * first yes starts an approval request the others answer; the last yes pays.
 * VDM-12 the builder's materials advance on the next milestone.
 */
class ProjectApprovalService
{
    public const MODES = ['any', 'all', 'count', 'named'];

    public function __construct(private readonly NotificationService $notifications)
    {
    }

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /** The project has its own approval settings (otherwise the project wallet's rules apply). */
    public function custom(Project $project): bool
    {
        return !empty($project->meta['approvals']);
    }

    /**
     * Who could approve: the owner, co-owners and funders (CTB-01 "Approve
     * milestones · counts towards 2 of 3"). Viewers only see.
     *
     * @return Collection<int, User>
     */
    public function candidates(Project $project): Collection
    {
        $ids = collect([$project->owner_id]);
        if ($project->wallet) {
            $ids = $ids->merge($project->wallet->members()->where('status', 'active')->whereIn('role', ['co_owner', 'contributor'])->pluck('user_id'));
        }

        return User::whereIn('id', $ids->unique())->get()->sortBy(fn (User $u) => $u->id === $project->owner_id ? 0 : $u->id)->values();
    }

    /**
     * The rule for one milestone (its override if it has one).
     *
     * @return array{mode: string, approver_ids: list<int>, needed: int, override: bool}
     */
    public function rulesFor(Project $project, ?Milestone $milestone = null): array
    {
        if (!$this->custom($project)) {
            // The project wallet's rules: the owner and co-owners (and anyone allowed to approve).
            $wallet = $project->wallet;
            $ids = $wallet ? $wallet->eligibleApprovers()->map(fn ($id) => (int) $id)->values()->all() : [$project->owner_id];
            $needed = $wallet && $wallet->approval_enabled ? min(count($ids), 1 + $wallet->requiredApprovalsFor($project->owner)) : 1;

            return ['mode' => $needed <= 1 ? 'any' : ($needed >= count($ids) ? 'all' : 'count'), 'approver_ids' => $ids, 'needed' => max(1, $needed), 'override' => false];
        }

        $rules = $project->meta['approvals'];
        $valid = $this->candidates($project)->pluck('id')->all();
        $override = $milestone ? ($rules['overrides'][(string) $milestone->id] ?? null) : null;
        $ids = array_values(array_intersect(array_map('intval', $override['approver_ids'] ?? $rules['approver_ids'] ?? []), $valid));
        if (!$ids) {
            $ids = [$project->owner_id];
        }
        $mode = $override ? 'count' : ($rules['mode'] ?? 'any');
        $needed = match ($mode) {
            'any' => 1,
            'all', 'named' => count($ids),
            default => (int) ($override['needed'] ?? $rules['needed'] ?? 1),
        };

        return ['mode' => $mode, 'approver_ids' => $ids, 'needed' => max(1, min($needed, count($ids))), 'override' => (bool) $override];
    }

    /** MLS-03 "Save, and tell the builder". */
    public function save(Project $project, User $owner, array $data): Project
    {
        if ($project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['project' => 'Only the project owner can change who approves.']);
        }
        $candidates = $this->candidates($project)->pluck('id')->all();
        $pick = function (array $ids, string $field) use ($candidates): array {
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if (!$ids || array_diff($ids, $candidates)) {
                throw ValidationException::withMessages([$field => 'Approvers must be people on this project who put money in or own it.']);
            }

            return $ids;
        };
        $mode = $data['mode'];
        $ids = $pick($data['approver_ids'] ?? [], 'approver_ids');
        $needed = match ($mode) {
            'any' => 1,
            'all', 'named' => count($ids),
            default => (int) ($data['needed'] ?? 0),
        };
        if ($needed < 1 || $needed > count($ids)) {
            throw ValidationException::withMessages(['needed' => 'Choose how many of the ' . count($ids) . ' approvers must say yes.']);
        }

        $overrides = [];
        foreach ($data['overrides'] ?? [] as $i => $o) {
            $m = $project->milestones()->whereKey((int) $o['milestone_id'])->first();
            if (!$m) {
                throw ValidationException::withMessages(["overrides.{$i}" => 'That milestone is not on this project.']);
            }
            // A paid milestone's override has done its job.
            if (in_array($m->status, ['released', 'cancelled'], true)) {
                continue;
            }
            $oIds = $pick($o['approver_ids'] ?? [], "overrides.{$i}.approver_ids");
            $oNeeded = (int) ($o['needed'] ?? count($oIds));
            if ($oNeeded < 1 || $oNeeded > count($oIds)) {
                throw ValidationException::withMessages(["overrides.{$i}.needed" => 'Choose how many must say yes.']);
            }
            $overrides[(string) $m->id] = ['approver_ids' => $oIds, 'needed' => $oNeeded];
        }

        DB::transaction(function () use ($project, $mode, $ids, $needed, $overrides, $data) {
            $meta = $project->meta ?? [];
            $meta['approvals'] = [
                'mode' => $mode,
                'approver_ids' => $ids,
                'needed' => $needed,
                'overrides' => $overrides,
                'site_photo_over' => isset($data['site_photo_over']) ? (int) $data['site_photo_over'] : null,
            ];
            $project->update(['meta' => $meta]);

            // A funder who approves sees the requests in their Approvals too.
            $all = collect($ids)->merge(collect($overrides)->flatMap(fn ($o) => $o['approver_ids']))->unique();
            WalletMember::where('wallet_id', $project->wallet_id)->where('role', 'contributor')->get()
                ->each(fn (WalletMember $m) => $m->update(['can_approve' => $all->contains($m->user_id)]));
        });

        $names = User::whereIn('id', $ids)->get()->map(fn (User $u) => $u->first_name)->join(', ', ' and ');
        $line = $mode === 'any' ? "Any one of {$names} can approve each payment." : "Each payment needs {$needed} of " . count($ids) . " to say yes: {$names}.";
        AuditService::make()->log($project->wallet, $project->owner, 'project_approvals_changed', "Approval settings changed. {$line}");
        if ($project->vendor && in_array($project->vendor_status, ['accepted', null], true)) {
            $this->notifications->push($project->vendor, 'project_approvals_changed', "{$project->title}: approval settings changed", $line, ['project_id' => $project->id]);
        }

        return $project->refresh();
    }

    /**
     * MLS-02: the first yes on a submitted milestone starts a request the other
     * approvers answer; a later yes is counted on it. When enough say yes, it pays.
     *
     * @return array{status: string, milestone: Milestone, reference?: string, approval_request_id?: int}
     */
    public function approve(Milestone $milestone, User $approver, ?string $note): array
    {
        $project = $milestone->project;
        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active.']);
        }
        $rules = $this->rulesFor($project, $milestone);
        if (!in_array($approver->id, $rules['approver_ids'], true)) {
            throw ValidationException::withMessages(['milestone' => "You're not an approver on this milestone."]);
        }
        // CTB-01 "Approvers must verify to Tier 2, since their yes releases money."
        if (!$project->isFamilyApprover($approver) && (int) $approver->kyc_tier < 2) {
            throw ValidationException::withMessages(['milestone' => 'Verify your identity to Tier 2 to approve payments — your yes releases money.']);
        }

        $requestId = $milestone->meta['approval_request_id'] ?? null;
        if ($milestone->status === 'approved' && $requestId && ($pending = ApprovalRequest::find($requestId)) && $pending->status === 'pending') {
            ApprovalService::make()->respond($pending, $approver, 'approve', $note);
            $milestone->refresh();
            if ($milestone->status !== 'released') {
                ChatService::make()->projectEvent($project, $approver, 'system', "{$approver->first_name} approved {$milestone->title}" . ($note ? " · \"{$note}\"" : ''));
            }

            return $milestone->status === 'released'
                ? ['status' => 'released', 'milestone' => $milestone, 'reference' => $milestone->released_transaction_reference]
                : ['status' => 'pending_approval', 'milestone' => $milestone, 'approval_request_id' => $pending->id];
        }
        if ($milestone->status !== 'submitted') {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be approved']);
        }
        ProjectService::make()->assertPayable($milestone);
        $over = $project->meta['approvals']['site_photo_over'] ?? null;
        if ($over !== null && $milestone->amount > $over && !$milestone->evidence()->where('kind', 'site_visit')->exists()) {
            throw ValidationException::withMessages(['milestone' => 'Milestones over ' . $this->naira((int) $over) . ' need a site visit photo from an approver first.']);
        }

        $meta = $milestone->meta ?? [];
        $meta['notes'][(string) $approver->id] = $note ?: null;
        if ($rules['needed'] <= 1) {
            $milestone->update(['meta' => $meta]);
            $result = ProjectService::make()->releaseMilestone($milestone, $approver);

            return ['status' => 'released', 'milestone' => $result['milestone'], 'reference' => $result['reference']];
        }

        $request = ApprovalRequest::create([
            'wallet_id' => $project->wallet_id,
            'initiator_id' => $approver->id,
            'action' => 'milestone_release',
            'amount' => $milestone->amount - ($milestone->activeDispute()?->status === 'agreed' ? (int) ($milestone->meta['agreed_refund'] ?? 0) : 0),
            'fee' => 0,
            'description' => "Milestone payout: {$milestone->title}",
            'payload' => ['milestone_id' => $milestone->id, 'approver_ids' => $rules['approver_ids']],
            'required_approvals' => $rules['needed'] - 1,
            'approvals_count' => 0,
            'status' => 'pending',
            'expires_at' => now()->addHours($project->wallet->approvalExpiryHours()),
        ]);
        $meta['approval_request_id'] = $request->id;
        $milestone->update(['status' => 'approved', 'meta' => $meta]);
        ChatService::make()->projectEvent($project, $approver, 'system', "{$approver->first_name} approved {$milestone->title}" . ($note ? " · \"{$note}\"" : '') . " · 1 of {$rules['needed']}");

        $left = $rules['needed'] - 1;
        foreach (User::whereIn('id', array_diff($rules['approver_ids'], [$approver->id]))->get() as $u) {
            $this->notifications->push(
                $u,
                'approval_requested',
                "{$approver->first_name} approved {$milestone->title} — your yes is needed",
                "{$project->title}: {$left} more " . ($left === 1 ? 'yes releases' : 'yeses release') . ' the payment to the builder.',
                ['approval_request_id' => $request->id, 'wallet_id' => $project->wallet_id, 'project_id' => $project->id, 'milestone_id' => $milestone->id],
            );
        }

        return ['status' => 'pending_approval', 'milestone' => $milestone->refresh(), 'approval_request_id' => $request->id];
    }

    /** MLS-02 "viewed 11:15 am": an approver opened the proof. */
    public function viewed(Milestone $milestone, User $user): void
    {
        if (!in_array($milestone->status, ['submitted', 'approved'], true)) {
            return;
        }
        if (!in_array($user->id, $this->rulesFor($milestone->project, $milestone)['approver_ids'], true)) {
            return;
        }
        $meta = $milestone->meta ?? [];
        $meta['viewed'][(string) $user->id] ??= now()->toIso8601String();
        $milestone->update(['meta' => $meta]);
    }

    /**
     * VDM-12 "Ask for Painting materials money now": a part of the next
     * milestone, approved with this one.
     */
    public function askAdvance(Milestone $milestone, int $percent): void
    {
        $next = $milestone->project->milestones()->where('sequence', '>', $milestone->sequence)
            ->whereIn('status', ['planned', 'funded'])->orderBy('sequence')->first();
        if (!$next) {
            throw ValidationException::withMessages(['advance_percent' => 'There is no next phase to ask materials money for.']);
        }
        $amount = intdiv($next->amount * $percent, 100);
        $meta = $milestone->meta ?? [];
        $meta['advance'] = ['milestone_id' => $next->id, 'percent' => $percent, 'amount' => $amount];
        $milestone->update(['meta' => $meta]);
    }

    /**
     * The advance asked with a released milestone: paid once the next milestone's
     * money is set aside ("paid once the family funds Painting").
     */
    public function payAdvance(Milestone $released): void
    {
        $advance = $released->meta['advance'] ?? null;
        if (!$advance || !empty($advance['paid_at']) || $released->status !== 'released') {
            return;
        }
        $next = Milestone::find($advance['milestone_id']);
        $project = $released->project;
        $vendorWallet = $project->vendor?->mainWallet();
        if (!$next || $next->status !== 'funded' || !$vendorWallet) {
            return;
        }
        $amount = min((int) $advance['amount'], $next->amount - $next->advance_paid);
        if ($amount <= 0) {
            return;
        }

        $reference = DB::transaction(function () use ($released, $next, $project, $vendorWallet, $amount, $advance) {
            $ref = WalletService::make()->transferBetweenWallets($project->wallet, $vendorWallet, $amount, $project->owner, "Materials advance: {$next->title}")['reference'];
            $next->increment('advance_paid', $amount);
            $meta = $released->meta;
            $meta['advance'] = array_merge($advance, ['paid_at' => now()->toIso8601String(), 'reference' => $ref]);
            $released->update(['meta' => $meta]);

            return $ref;
        });

        $this->notifications->push($project->vendor, 'milestone_released', 'Materials advance paid', "{$this->naira($amount)} for {$next->title} is in your wallet. It comes off that phase's payment.", ['project_id' => $project->id, 'milestone_id' => $next->id, 'reference' => $reference]);
        VendorPayoutService::make()->autoWithdraw($project->vendor, $amount, "Advance: {$next->title}");
    }

    /** After a milestone is funded: any advance waiting on it goes now. */
    public function payWaitingAdvances(Project $project): void
    {
        $project->milestones()->where('status', 'released')->get()
            ->filter(fn (Milestone $m) => !empty($m->meta['advance']) && empty($m->meta['advance']['paid_at']))
            ->each(fn (Milestone $m) => $this->payAdvance($m));
    }
}
