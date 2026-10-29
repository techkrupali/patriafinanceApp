<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The builder and the family working on a project (client sheet "Projects,
 * vendors, disputes"):
 *  - INV-V1…V5: the invited builder accepts, asks for a change on milestones (the
 *    family agrees or keeps the original), or declines with a reason (PRJ-12)
 *  - VDM-09 / PRJ-11: the builder proposes a new milestone; the family approves
 *    it (the project total grows) or asks for changes
 *  - PRJ-05: the family edits a milestone; a new amount or date waits for the
 *    builder to accept
 *  - VDM-05: the builder's side ticks deliverables and submits with photos
 * Amounts are kobo.
 */
class VendorProjectService
{
    public const DECLINE_REASONS = ['fully_booked', 'budget_too_low', 'outside_area', 'not_my_work', 'other'];

    public const PROPOSE_REASONS = ['family_asked', 'found_on_site', 'price_change', 'other'];

    public function __construct(
        private readonly ProjectService $projects,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(ProjectService::make(), NotificationService::make());
    }

    // ----------------------------------------------------------------- the invitation

    /** INV-V2 "Accept them all". The project starts and the first milestone's money is set aside. */
    public function accept(Project $project, User $vendor): Project
    {
        $this->assertInvited($project, $vendor);
        if ($this->vendorChanges($project)->isNotEmpty()) {
            throw ValidationException::withMessages(['project' => 'You asked for changes. Wait for the family, or clear your changes first.']);
        }
        $project->update(['vendor_status' => 'accepted', 'vendor_responded_at' => now()]);
        $this->fundPlanned($project);
        $name = $this->businessName($vendor);
        $this->tellFamily($project, 'project_vendor_accepted', "{$name} accepted", "They accepted the milestones for {$project->title}. The project can start.");

        return $project->refresh();
    }

    /**
     * INV-V3 "Ask for a change": a different amount or dates on one milestone,
     * with why and a quote. Saved until the builder sends the changes back.
     */
    public function askChange(Milestone $milestone, User $vendor, array $data): Milestone
    {
        $project = $milestone->project;
        $this->assertInvited($project, $vendor);
        $change = array_filter([
            'by' => 'vendor',
            'user_id' => $vendor->id,
            'amount' => isset($data['amount']) ? (int) $data['amount'] : null,
            'starts_on' => $data['starts_on'] ?? null,
            'due_date' => $data['due_date'] ?? null,
            'why' => $data['why'] ?? null,
            'attachment' => $data['attachment'] ?? null, // {name, url}
            'at' => now()->toIso8601String(),
        ], fn ($v) => $v !== null);
        if (!isset($change['amount']) && !isset($change['starts_on']) && !isset($change['due_date'])) {
            throw ValidationException::withMessages(['amount' => 'Change the amount or the dates.']);
        }
        $milestone->update(['change_request' => $change]);

        return $milestone->refresh();
    }

    /** INV-V2: drop the change asked on one milestone ("OK" again). */
    public function clearChange(Milestone $milestone, User $vendor): Milestone
    {
        $this->assertInvited($milestone->project, $vendor);
        $milestone->update(['change_request' => null]);

        return $milestone->refresh();
    }

    /** INV-V4 "Send back with 1 change": the family reviews them. */
    public function sendChanges(Project $project, User $vendor): Project
    {
        $this->assertInvited($project, $vendor);
        $changed = $this->vendorChanges($project);
        if ($changed->isEmpty()) {
            throw ValidationException::withMessages(['project' => 'There are no changes to send. Accept the milestones instead.']);
        }
        $project->update(['vendor_status' => 'changes_proposed', 'vendor_responded_at' => now()]);
        $name = $this->businessName($vendor);
        $lines = $changed->map(fn (Milestone $m) => isset($m->change_request['amount'])
            ? "{$m->title} ₦" . number_format($m->amount / 100) . ' → ₦' . number_format($m->change_request['amount'] / 100)
            : "{$m->title}: new dates")->join('; ');
        $this->tellFamily($project, 'project_vendor_changes', "{$name} asked for " . ($changed->count() === 1 ? 'a change' : "{$changed->count()} changes"), "{$lines}. Once you agree, the project starts.");

        return $project->refresh();
    }

    /** The family agrees to the builder's changes (the project starts) or keeps the original milestones. */
    public function answerChanges(Project $project, User $approver, bool $agree): Project
    {
        if (!$project->isFamilyApprover($approver)) {
            throw ValidationException::withMessages(['project' => 'Only the family can answer this.']);
        }
        if ($project->vendor_status !== 'changes_proposed') {
            throw ValidationException::withMessages(['project' => 'There are no changes waiting.']);
        }
        DB::transaction(function () use ($project, $agree) {
            foreach ($this->vendorChanges($project) as $m) {
                if ($agree) {
                    $this->applyChange($m, $m->change_request);
                }
                $m->update(['change_request' => null]);
            }
            $project->update(['vendor_status' => $agree ? 'accepted' : 'invited', 'vendor_responded_at' => now()]);
            if ($agree) {
                $project->update(['budget' => (int) $project->milestones()->whereNotIn('status', ['cancelled', 'proposed'])->sum('amount')]);
            }
        });
        if ($agree) {
            $this->fundPlanned($project->refresh());
        }
        if ($project->vendor) {
            $this->notifications->push(
                $project->vendor,
                'project_changes_answered',
                $agree ? "The family agreed. {$project->title} starts" : "The family kept the original milestones",
                $agree ? 'Your changes are in. Submit photos when each milestone is done.' : 'You can accept the milestones as they are, or decline the project.',
                ['project_id' => $project->id],
            );
        }

        return $project->refresh();
    }

    /** INV-V5 "Decline this project?": the family is told and can find someone else (PRJ-12). */
    public function decline(Project $project, User $vendor, array $data): Project
    {
        $this->assertInvited($project, $vendor, allowChanges: true);
        $profile = VendorProfile::where('user_id', $vendor->id)->first();
        $meta = $project->meta ?? [];
        $meta['vendor_declined'] = array_filter([
            'user_id' => $vendor->id,
            'vendor_profile_id' => $profile?->id,
            'name' => $this->businessName($vendor),
            'reason' => $data['reason'],
            'message' => $data['message'] ?? null,
            'start_month' => $data['start_month'] ?? null, // YYYY-MM: "Suggest I can start in March"
            'at' => now()->toIso8601String(),
        ], fn ($v) => $v !== null);
        DB::transaction(function () use ($project, $meta) {
            $project->milestones()->update(['change_request' => null]);
            $project->update(['vendor_id' => null, 'vendor_status' => 'declined', 'vendor_responded_at' => now(), 'meta' => $meta]);
        });
        $this->tellFamily($project, 'project_vendor_declined', "{$meta['vendor_declined']['name']} declined", ($data['message'] ?? null) ?: 'Your money stays in the project wallet. Find another verified builder.');

        return $project->refresh();
    }

    /** PRJ-12 "Remind me to re-invite Adeyemi in March". */
    public function remindReinvite(Project $project, User $approver): Carbon
    {
        $declined = $project->meta['vendor_declined'] ?? null;
        if (!$project->isFamilyApprover($approver) || !$declined) {
            throw ValidationException::withMessages(['project' => 'There is no builder to re-invite.']);
        }
        $on = !empty($declined['start_month']) ? Carbon::parse($declined['start_month'] . '-01') : now()->addMonth()->startOfMonth();
        $meta = $project->meta;
        $meta['reinvite_on'] = $on->toDateString();
        $project->update(['meta' => $meta]);

        return $on;
    }

    /** Daily: "Time to re-invite Adeyemi Builders" on the month they suggested. */
    public function sendReinviteReminders(): int
    {
        $sent = 0;
        Project::whereNotNull('meta->reinvite_on')->where('status', 'active')->get()->each(function (Project $project) use (&$sent) {
            if (now()->toDateString() < $project->meta['reinvite_on']) {
                return;
            }
            $name = $project->meta['vendor_declined']['name'] ?? 'the builder';
            $this->tellFamily($project, 'project_reinvite', "Time to re-invite {$name}", "{$name} said they could start around now on {$project->title}.");
            $meta = $project->meta;
            unset($meta['reinvite_on']);
            $project->update(['meta' => $meta]);
            $sent++;
        });

        return $sent;
    }

    // ----------------------------------------------------------------- milestones

    /** VDM-09 "Send to the family": nothing is paid until the family approves it. */
    public function proposeMilestone(Project $project, User $actor, array $data): Milestone
    {
        if (!$project->actsForVendor($actor, 'submit') || !in_array($project->vendor_status, ['accepted', null], true)) {
            throw ValidationException::withMessages(['project' => 'Only the builder can propose a milestone.']);
        }
        $milestone = Milestone::create([
            'project_id' => $project->id,
            'sequence' => ((int) $project->milestones()->max('sequence')) + 1,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'amount' => (int) $data['amount'],
            'due_date' => $data['due_date'] ?? null,
            'deliverables' => $this->deliverables($data['deliverables'] ?? []),
            'status' => 'proposed',
            'origin' => 'vendor',
            'meta' => array_filter(['reason' => $data['reason'] ?? null, 'why' => $data['why'] ?? null, 'proposed_by' => $actor->id]),
        ]);
        $this->tellFamily($project, 'milestone_proposed', "New milestone from the builder: {$milestone->title}", '₦' . number_format($milestone->amount / 100) . " on {$project->title}. Approve it before work starts.", ['milestone_id' => $milestone->id]);

        return $milestone->refresh();
    }

    /** PRJ-11 "Approve milestone" (the project total grows) or "Ask for changes". */
    public function answerProposed(Milestone $milestone, User $approver, bool $approve, ?string $note): Milestone
    {
        $project = $milestone->project;
        if (!$project->isFamilyApprover($approver)) {
            throw ValidationException::withMessages(['milestone' => 'Only the family can approve a new milestone.']);
        }
        if ($milestone->status !== 'proposed') {
            throw ValidationException::withMessages(['milestone' => 'This milestone is not waiting for approval.']);
        }
        if ($approve) {
            $milestone->update(['status' => 'planned', 'meta' => array_merge($milestone->meta ?? [], ['approved_by' => $approver->id, 'family_note' => null])]);
            // PRJ-11 "New project total … Funding gap": the wallet's target grows by what it doesn't cover yet.
            // The budget stays as planned, so PRJ-10 shows the extra against the buffer.
            $wallet = $project->wallet;
            $planTotal = (int) $project->milestones()->whereNotIn('status', ['cancelled', 'proposed'])->sum('amount');
            if ($wallet && $wallet->target_amount && $planTotal > $wallet->target_amount) {
                $wallet->update(['target_amount' => $planTotal]);
            }
            $this->fundPlanned($project->refresh());
        } else {
            $milestone->update(['meta' => array_merge($milestone->meta ?? [], ['family_note' => $note ?: 'Please change this milestone.'])]);
        }
        $to = $project->vendor;
        if ($to) {
            $this->notifications->push($to, 'milestone_proposal_answered', $approve ? "{$milestone->title} approved" : "Changes asked on {$milestone->title}", $approve ? 'Start when you are ready. Submit photos when it is done.' : ($note ?: 'The family asked for changes.'), ['project_id' => $project->id, 'milestone_id' => $milestone->id]);
        }

        return $milestone->refresh();
    }

    /** The builder edits a milestone the family hasn't approved yet (after "Ask for changes"). */
    public function updateProposed(Milestone $milestone, User $actor, array $data): Milestone
    {
        $project = $milestone->project;
        if ($milestone->status !== 'proposed' || !$project->actsForVendor($actor, 'submit')) {
            throw ValidationException::withMessages(['milestone' => 'Only a proposed milestone can be changed here.']);
        }
        $milestone->update(array_filter([
            'title' => $data['title'] ?? null,
            'amount' => isset($data['amount']) ? (int) $data['amount'] : null,
            'due_date' => $data['due_date'] ?? null,
            'deliverables' => isset($data['deliverables']) ? $this->deliverables($data['deliverables']) : null,
        ], fn ($v) => $v !== null) + ['meta' => array_merge($milestone->meta ?? [], ['family_note' => null])]);
        $this->tellFamily($project, 'milestone_proposed', "{$milestone->title} was updated", 'Have another look and approve it.', ['milestone_id' => $milestone->id]);

        return $milestone->refresh();
    }

    /**
     * PRJ-05 "Save and send to builder": the name, what must be done and the proof
     * needed change now; a new amount or due date waits for the builder.
     */
    public function editMilestone(Milestone $milestone, User $approver, array $data): Milestone
    {
        $project = $milestone->project;
        if (!$project->isFamilyApprover($approver)) {
            throw ValidationException::withMessages(['milestone' => 'Only the family can edit milestones.']);
        }
        if (in_array($milestone->status, ['submitted', 'approved', 'released', 'cancelled'], true)) {
            throw ValidationException::withMessages(['milestone' => 'This milestone can\'t be changed now.']);
        }
        $milestone->update(array_filter([
            'title' => $data['title'] ?? null,
            'deliverables' => array_key_exists('deliverables', $data) ? $this->deliverables($data['deliverables'] ?? []) : null,
            'proof_needed' => $data['proof_needed'] ?? null,
        ], fn ($v) => $v !== null));

        $money = array_filter([
            'amount' => isset($data['amount']) && (int) $data['amount'] !== $milestone->amount ? (int) $data['amount'] : null,
            'due_date' => !empty($data['due_date']) && $data['due_date'] !== $milestone->due_date?->toDateString() ? $data['due_date'] : null,
        ], fn ($v) => $v !== null);
        if ($money) {
            $builderAgreed = $project->vendor_id && in_array($project->vendor_status, ['accepted', null], true);
            if ($builderAgreed && $milestone->status !== 'proposed') {
                $milestone->update(['change_request' => $money + ['by' => 'family', 'user_id' => $approver->id, 'at' => now()->toIso8601String()]]);
                $this->notifications->push($project->vendor, 'milestone_change_asked', "The family changed {$milestone->title}", $this->describeChange($milestone, $money) . ' Accept the change?', ['project_id' => $project->id, 'milestone_id' => $milestone->id]);
            } else {
                $this->applyChange($milestone, $money);
            }
        }

        return $milestone->refresh();
    }

    /** The builder accepts or refuses the family's new amount or date. */
    public function answerFamilyChange(Milestone $milestone, User $actor, bool $agree): Milestone
    {
        $project = $milestone->project;
        if (!$project->actsForVendor($actor, 'submit') || ($milestone->change_request['by'] ?? null) !== 'family') {
            throw ValidationException::withMessages(['milestone' => 'There is no change waiting for you.']);
        }
        $change = $milestone->change_request;
        if ($agree) {
            $this->applyChange($milestone, $change);
        }
        $milestone->update(['change_request' => null]);
        $this->tellFamily($project, 'milestone_change_answered', $agree ? "The builder accepted the change to {$milestone->title}" : "The builder kept {$milestone->title} as it was", $this->describeChange($milestone->refresh(), $change), ['milestone_id' => $milestone->id]);

        return $milestone->refresh();
    }

    /** VDM-05: tick what's done (a foreman can, before a site manager submits). */
    public function tickDeliverables(Milestone $milestone, User $actor, array $done): Milestone
    {
        $project = $milestone->project;
        if (!$project->actsForVendor($actor, 'upload')) {
            throw ValidationException::withMessages(['milestone' => 'Only the builder\'s team can tick deliverables.']);
        }
        $list = collect($milestone->deliverables ?? [])->values()->map(fn ($d, $i) => ['text' => $d['text'], 'done' => (bool) ($done[$i] ?? false)])->all();
        $milestone->update(['deliverables' => $list]);

        return $milestone->refresh();
    }

    /**
     * VDM-05 "Submit for ₦1,900,000": the deliverables ticked, a note for the family,
     * and the proof the release rules ask for (photos, a video).
     */
    public function submit(Milestone $milestone, User $actor, ?string $note, ?array $done): Milestone
    {
        $project = $milestone->project;
        if (!$project->actsForVendor($actor, 'submit')) {
            throw ValidationException::withMessages(['milestone' => 'Only the builder or a site manager can submit for payment.']);
        }
        if ($done !== null) {
            $this->tickDeliverables($milestone, $actor, $done);
        }
        $release = $project->meta['release'] ?? [];
        $evidence = $milestone->evidence()->get();
        if (!empty($release['photos']) && !$evidence->contains('kind', 'image')) {
            throw ValidationException::withMessages(['evidence' => 'Add photos from the site first.']);
        }
        if (!empty($release['video']) && !$evidence->contains('kind', 'video')) {
            throw ValidationException::withMessages(['evidence' => 'Add a short video walk-through first.']);
        }
        if (!empty($release['receipts']) && !$evidence->contains('kind', 'receipt')) {
            throw ValidationException::withMessages(['evidence' => 'Add the receipts for materials first.']);
        }

        return $this->projects->submitMilestone($milestone, $actor, $note ?: 'Submitted for review');
    }

    // ----------------------------------------------------------------- helpers

    /** Planned milestones get their money set aside, in order, while the wallet covers them. */
    public function fundPlanned(Project $project): void
    {
        foreach ($project->milestones()->where('status', 'planned')->orderBy('sequence')->get() as $m) {
            if ($m->amount > $project->availableToAllocate()) {
                return;
            }
            $m->update(['status' => 'funded']);
        }
    }

    private function applyChange(Milestone $milestone, array $change): void
    {
        $meta = $milestone->meta ?? [];
        if (!empty($change['starts_on'])) {
            $meta['starts_on'] = $change['starts_on'];
        }
        $update = array_filter([
            'amount' => isset($change['amount']) ? (int) $change['amount'] : null,
            'due_date' => $change['due_date'] ?? null,
        ], fn ($v) => $v !== null) + ['meta' => $meta];
        // A bigger amount the wallet can't cover goes back to waiting for its money.
        if (isset($change['amount']) && $milestone->status === 'funded' && (int) $change['amount'] > $milestone->amount
            && (int) $change['amount'] - $milestone->amount > $milestone->project->availableToAllocate()) {
            $update['status'] = 'planned';
        }
        $milestone->update($update);
    }

    private function describeChange(Milestone $milestone, array $change): string
    {
        $parts = [];
        if (isset($change['amount'])) {
            $parts[] = '₦' . number_format($change['amount'] / 100);
        }
        if (!empty($change['due_date'])) {
            $parts[] = 'due ' . Carbon::parse($change['due_date'])->format('j M Y');
        }

        return "{$milestone->title}: " . implode(', ', $parts) . '.';
    }

    /** @return Collection<int, Milestone> */
    private function vendorChanges(Project $project): Collection
    {
        return $project->milestones()->orderBy('sequence')->get()->filter(fn (Milestone $m) => ($m->change_request['by'] ?? null) === 'vendor')->values();
    }

    private function assertInvited(Project $project, User $vendor, bool $allowChanges = false): void
    {
        $ok = $project->vendor_id === $vendor->id
            && ($project->vendor_status === 'invited' || ($allowChanges && $project->vendor_status === 'changes_proposed'));
        if (!$ok) {
            throw ValidationException::withMessages(['project' => 'There is no invitation to answer on this project.']);
        }
    }

    /** @return list<array{text: string, done: bool}> */
    private function deliverables(array $items): array
    {
        return collect($items)->map(fn ($d) => is_array($d) ? (string) ($d['text'] ?? '') : (string) $d)
            ->map(fn ($t) => trim($t))->filter()->take(12)->map(fn ($t) => ['text' => mb_substr($t, 0, 120), 'done' => false])->values()->all();
    }

    private function businessName(User $vendor): string
    {
        return VendorProfile::where('user_id', $vendor->id)->value('business_name') ?? $vendor->fullName();
    }

    /** The owner and the project wallet's co-owners. */
    public function tellFamily(Project $project, string $type, string $title, string $body, array $data = []): void
    {
        $ids = collect([$project->owner_id]);
        if ($project->wallet) {
            $ids = $ids->merge($project->wallet->members()->where('status', 'active')->where('role', 'co_owner')->pluck('user_id'));
        }
        foreach (User::whereIn('id', $ids->unique())->get() as $user) {
            $this->notifications->push($user, $type, $title, $body, ['project_id' => $project->id] + $data);
        }
    }
}
