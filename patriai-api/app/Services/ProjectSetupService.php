<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletDraft;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Project wallet from the client prototype (PRW-01…06): what is being built and
 * where, the budget with a buffer and the timeline, milestones planned before
 * the money is in, the builder (from the directory, invited, or later), who
 * funds it each month, savings moved in now, and when the builder gets paid —
 * what they send, who says yes, and how much is held back until after handover.
 * Amounts are kobo.
 */
class ProjectSetupService
{
    public const KINDS = ['building', 'renovation', 'event', 'community'];

    /** Each funder's monthly amount moves on this day (EMG-02's "on the 25th"). */
    public const FUNDING_DAY = 25;

    public function __construct(
        private readonly ProjectService $projects,
        private readonly WalletService $wallets,
        private readonly InvitationService $invitations,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(ProjectService::make(), WalletService::make(), InvitationService::make(), NotificationService::make());
    }

    /**
     * $data: title, kind, location?, starts_on?, finishes_on?, budget, buffer_percent,
     * milestones [{title, description?, amount, starts_on?, ends_on?}],
     * vendor? {vendor_profile_id} | {identifier}, source_wallet_id?, my_monthly?,
     * funders [{user_id | identifier, role, amount}], move_in_wallet_id?,
     * release {photos, video, receipts, approvers: all|owner, retention_percent, retention_months}, draft_id?
     */
    public function setup(User $owner, array $data): Project
    {
        // Everything that can be refused is checked before anything is created.
        $source = null;
        if ((int) ($data['my_monthly'] ?? 0) > 0) {
            $source = Wallet::where('id', (int) ($data['source_wallet_id'] ?? 0))->where('user_id', $owner->id)->first();
            if (!$source) {
                throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your wallets to fund this from.']);
            }
        }
        $moveIn = null;
        if (!empty($data['move_in_wallet_id'])) {
            $moveIn = Wallet::where('id', (int) $data['move_in_wallet_id'])->where('user_id', $owner->id)->first();
            if (!$moveIn || $moveIn->type === 'main' || !$moveIn->canSpend($owner) || $moveIn->availableToSpend() <= 0) {
                throw ValidationException::withMessages(['move_in_wallet_id' => "That wallet's savings can't be moved in right now."]);
            }
        }
        $vendor = $this->resolveVendor($data['vendor'] ?? null);
        $budget = (int) $data['budget'];
        $buffer = intdiv($budget * (int) ($data['buffer_percent'] ?? 0), 100);
        $planned = array_sum(array_map(fn ($m) => (int) $m['amount'], $data['milestones'] ?? []));
        if ($planned > $budget + $buffer) {
            throw ValidationException::withMessages(['milestones' => 'The milestones add up to more than the budget and buffer.']);
        }

        $project = $this->projects->createProject($owner, $data['title'], $data['location'] ?? null, $budget);
        $wallet = $project->wallet;
        $invited = [];

        DB::transaction(function () use ($owner, $data, $project, $wallet, $vendor, $source, $moveIn, $buffer, &$invited) {
            $release = $data['release'] ?? [];
            $project->update(['meta' => [
                'kind' => in_array($data['kind'] ?? null, self::KINDS, true) ? $data['kind'] : 'building',
                'location' => $data['location'] ?? null,
                'starts_on' => $data['starts_on'] ?? null,
                'finishes_on' => $data['finishes_on'] ?? null,
                'buffer_percent' => (int) ($data['buffer_percent'] ?? 0),
                'release' => [
                    'photos' => (bool) ($release['photos'] ?? true),
                    'video' => (bool) ($release['video'] ?? true),
                    'receipts' => (bool) ($release['receipts'] ?? false),
                    'approvers' => ($release['approvers'] ?? 'all') === 'owner' ? 'owner' : 'all',
                    'retention_percent' => (int) ($release['retention_percent'] ?? 10),
                    'retention_months' => (int) ($release['retention_months'] ?? 3),
                ],
                'vendor_invite' => $vendor['invite'] ?? null,
            ]]);
            $wallet->update(['target_amount' => $project->budget + $buffer, 'target_date' => $data['finishes_on'] ?? null]);

            foreach (array_values($data['milestones'] ?? []) as $i => $m) {
                Milestone::create([
                    'project_id' => $project->id,
                    'sequence' => $i + 1,
                    'title' => $m['title'],
                    'description' => $m['description'] ?? null,
                    'amount' => (int) $m['amount'],
                    'due_date' => $m['ends_on'] ?? null,
                    'status' => 'planned',
                    'meta' => array_filter(['starts_on' => $m['starts_on'] ?? null]),
                ]);
            }

            // PRW-06 "Ngozi and Emeka both say yes": every co-owner approves each payment.
            $hasCoOwners = collect($data['funders'] ?? [])->contains(fn ($f) => ($f['role'] ?? null) === 'co_owner');
            if (($data['release']['approvers'] ?? 'all') === 'all' && $hasCoOwners) {
                $meta = $wallet->meta ?? [];
                $meta['approval_mode'] = 'all';
                $wallet->update(['approval_enabled' => true, 'approval_threshold' => null, 'required_approvals' => 1, 'meta' => $meta]);
            }

            if ($source) {
                AutomationService::make()->createRule($owner, [
                    'name' => "Monthly into {$project->title}",
                    'from_wallet_id' => $source->id,
                    'to_wallet_id' => $wallet->id,
                    'amount' => (int) $data['my_monthly'],
                    'frequency' => 'monthly',
                    'day_of_month' => self::FUNDING_DAY,
                ]);
            }

            foreach (array_values($data['funders'] ?? []) as $i => $f) {
                $invitee = !empty($f['user_id']) ? User::find((int) $f['user_id']) : $this->invitations->resolveInvitee((string) ($f['identifier'] ?? ''));
                $identifier = $invitee ? $this->invitations->identifierFor($invitee) : trim((string) ($f['identifier'] ?? ''));
                if ($identifier === '') {
                    throw ValidationException::withMessages(["funders.{$i}" => 'Choose who to invite.']);
                }
                try {
                    $invited[] = [$this->invitations->create($wallet, $owner, $invitee, $identifier, $f['role'] === 'co_owner' ? 'co_owner' : 'contributor', $f['role'] === 'co_owner', null, (int) $f['amount'] ?: null), $invitee];
                } catch (ValidationException $e) {
                    throw ValidationException::withMessages(["funders.{$i}" => collect($e->errors())->flatten()->first()]);
                }
            }

            // PRW-05 "Move in House Project savings — ₦1,200,000 now".
            if ($moveIn) {
                $this->wallets->transferBetweenWallets($moveIn, $wallet, $moveIn->availableToSpend(), $owner, "Moved in from {$moveIn->name}");
            }

            if (!empty($data['draft_id'])) {
                WalletDraft::where('id', (int) $data['draft_id'])->where('user_id', $owner->id)->delete();
            }
        });

        foreach ($invited as [$invitation, $invitee]) {
            $this->invitations->deliver($invitation, $wallet, $owner, $invitee);
        }

        // PRW-04: the builder is asked to accept the milestones.
        if ($vendor['user'] ?? null) {
            $this->projects->assignVendor($project->refresh(), $owner, $vendor['user']);
        } elseif ($phone = $vendor['invite'] ?? null) {
            SmsService::make()->send($phone, "{$owner->fullName()} wants you to build \"{$project->title}\" on Patriai and get paid by milestone. Get the Patriai app to accept: " . rtrim((string) config('app.url'), '/'));
        }

        return $project->refresh();
    }

    /**
     * PRW-04: a builder from the directory, one invited by phone or email (an
     * account is assigned now; a number without one gets an SMS), or none yet.
     *
     * @return array{user?: User, invite?: string}|null
     */
    private function resolveVendor(?array $vendor): ?array
    {
        if (!$vendor) {
            return null;
        }
        if (!empty($vendor['vendor_profile_id'])) {
            $profile = VendorProfile::with('user')->find((int) $vendor['vendor_profile_id']);
            if (!$profile?->user) {
                throw ValidationException::withMessages(['vendor.vendor_profile_id' => 'Choose a builder from the directory.']);
            }

            return ['user' => $profile->user];
        }
        $identifier = trim((string) ($vendor['identifier'] ?? ''));
        if ($identifier === '') {
            return null;
        }
        $user = $this->invitations->resolveInvitee($identifier);

        return $user ? ['user' => $user] : ['invite' => $identifier];
    }

    /** PRW-06 retention: paid to the builder once its months after handover are up. */
    public function releaseRetention(): int
    {
        $paid = 0;
        Milestone::with('project.vendor', 'project.wallet', 'project.owner')->where('status', 'released')->where('retention', '>', 0)
            ->whereNull('retention_released_at')->whereNotNull('retention_due_at')->where('retention_due_at', '<=', now())
            ->get()->each(function (Milestone $m) use (&$paid) {
                $project = $m->project;
                $to = $project?->vendor?->mainWallet();
                if (!$project || !$to || !$project->owner) {
                    return;
                }
                $sent = DB::transaction(function () use ($m, $project, $to, &$paid) {
                    $fresh = Milestone::whereKey($m->id)->lockForUpdate()->first();
                    if ($fresh->retention_released_at) {
                        return 0;
                    }
                    $this->wallets->transferBetweenWallets($project->wallet, $to, $fresh->retention, $project->owner, "Retention released: {$fresh->title}");
                    $fresh->update(['retention_released_at' => now()]);
                    $this->notifications->push($project->vendor, 'retention_released', 'Retention released', '₦' . number_format($fresh->retention / 100) . " held back on \"{$fresh->title}\" is now in your wallet.", ['project_id' => $project->id, 'milestone_id' => $fresh->id]);
                    $paid++;

                    return $fresh->retention;
                });
                // VDM-06 "every payout, straight away" includes what was held back.
                VendorPayoutService::make()->autoWithdraw($project->vendor, (int) $sent, $m->title);
            });

        return $paid;
    }
}
