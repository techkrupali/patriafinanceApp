<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Escrow-backed milestone project engine. A Project is funded through a dedicated
 * 'project'-type wallet. Milestone amounts are tracked as reservations against that
 * wallet's balance (via milestone status sums); approving a milestone RELEASES its
 * amount to the vendor's main wallet by replaying the spend through WalletService so
 * the balance change stays inside a row-locked, overdraft-guarded transaction.
 * This service NEVER mutates wallet balances directly. No milestone approval = no payment.
 */
class ProjectService
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    private function assertOwner(Project $project, User $owner): void
    {
        if ($project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['project' => 'Only the project owner can perform this action']);
        }
    }

    /** Resolve a user by email (lowercased) or phone. */
    private function resolveUser(string $identifier): ?User
    {
        $identifier = trim($identifier);

        return str_contains($identifier, '@')
            ? User::where('email', strtolower($identifier))->first()
            : User::where('phone', $identifier)->first();
    }

    /**
     * Create a project backed by a fresh 'project'-type escrow wallet.
     *
     * createWallet performs its own inserts plus an external virtual-account call;
     * it is deliberately kept OUT of a DB transaction so the banking HTTP round trip
     * never holds a lock open. An orphaned empty wallet (were the Project insert to
     * fail) is harmless — balance 0, no linkage.
     */
    public function createProject(User $owner, string $title, ?string $description, int $budgetKobo): Project
    {
        if ($budgetKobo < 0) {
            throw ValidationException::withMessages(['budget' => 'Budget cannot be negative']);
        }

        $wallet = $this->wallets->createWallet($owner, 'project', $title, ['description' => $description]);

        $project = Project::create([
            'wallet_id' => $wallet->id,
            'owner_id' => $owner->id,
            'title' => $title,
            'description' => $description,
            'budget' => $budgetKobo,
            'status' => 'active',
        ]);

        $project->setRelation('wallet', $wallet);
        $project->setRelation('owner', $owner);

        return $project;
    }

    /**
     * Assign (or reassign) a vendor. Owner only. Blocks self-assignment and reassigning
     * away from a vendor who already has released milestones.
     */
    public function assignVendor(Project $project, User $owner, string $identifier): Project
    {
        $this->assertOwner($project, $owner);

        $vendor = $this->resolveUser($identifier);
        if (!$vendor) {
            throw ValidationException::withMessages(['identifier' => 'No user found for that email or phone']);
        }
        if ($vendor->id === $owner->id) {
            throw ValidationException::withMessages(['identifier' => 'You cannot assign yourself as the vendor']);
        }

        // A vendor is already assigned to someone else: only allow reassignment when
        // nothing has been paid out yet (no released milestones) and no milestone is
        // mid-flight (submitted/approved) for the current vendor.
        if ($project->vendor_id && $project->vendor_id !== $vendor->id) {
            if ($project->milestones()->where('status', 'released')->exists()) {
                throw ValidationException::withMessages(['vendor' => 'Cannot reassign the vendor after milestones have been released']);
            }
            if ($project->milestones()->whereIn('status', ['submitted', 'approved'])->exists()) {
                throw ValidationException::withMessages(['vendor' => 'Cannot reassign the vendor while milestones are submitted or approved']);
            }
        }

        $project->update(['vendor_id' => $vendor->id]);

        $this->notifications->push(
            $vendor,
            'project_vendor_assigned',
            'You were assigned to a project',
            "{$owner->fullName()} assigned you as the vendor on \"{$project->title}\".",
            ['project_id' => $project->id, 'title' => $project->title],
        );

        return $project->refresh();
    }

    /** Remove the assigned vendor. Owner only. Blocked while milestones are in flight. */
    public function removeVendor(Project $project, User $owner): Project
    {
        $this->assertOwner($project, $owner);

        if (!$project->vendor_id) {
            throw ValidationException::withMessages(['vendor' => 'No vendor is assigned to this project']);
        }
        if ($project->milestones()->whereIn('status', ['submitted', 'approved'])->exists()) {
            throw ValidationException::withMessages(['vendor' => 'Cannot remove the vendor while milestones are submitted or approved']);
        }

        $project->update(['vendor_id' => null]);

        return $project->refresh();
    }

    /**
     * Add a milestone reserving part of the escrow wallet. Owner only.
     * Amount must be > 0 and within the wallet's unallocated balance.
     */
    public function addMilestone(Project $project, User $owner, string $title, ?string $description, int $amountKobo): Milestone
    {
        $this->assertOwner($project, $owner);

        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active']);
        }
        if ($amountKobo <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero']);
        }
        if ($amountKobo > $project->availableToAllocate()) {
            throw ValidationException::withMessages(['amount' => 'Milestone amount exceeds unallocated wallet balance']);
        }

        $sequence = ((int) $project->milestones()->max('sequence')) + 1;

        $milestone = Milestone::create([
            'project_id' => $project->id,
            'sequence' => $sequence,
            'title' => $title,
            'description' => $description,
            'amount' => $amountKobo,
            'status' => 'funded',
        ]);

        if ($project->vendor_id && ($vendor = $project->vendor)) {
            $this->notifications->push(
                $vendor,
                'milestone_added',
                'New milestone added',
                "A new milestone \"{$title}\" (₦" . $this->naira($amountKobo) . ") was added to \"{$project->title}\".",
                ['project_id' => $project->id, 'milestone_id' => $milestone->id],
            );
        }

        return $milestone;
    }

    /** Vendor submits proof of work. Assigned vendor only; must be funded or rejected. */
    public function submitMilestone(Milestone $milestone, User $vendor, string $proof): Milestone
    {
        $project = $milestone->project;
        if (!$project || $project->vendor_id !== $vendor->id) {
            throw ValidationException::withMessages(['milestone' => 'Only the assigned vendor can submit this milestone']);
        }
        if (!in_array($milestone->status, ['funded', 'rejected'], true)) {
            throw ValidationException::withMessages(['milestone' => 'This milestone cannot be submitted in its current state']);
        }

        $milestone->update([
            'status' => 'submitted',
            'proof' => $proof,
            'submitted_at' => now(),
        ]);

        if ($owner = $project->owner) {
            $this->notifications->push(
                $owner,
                'milestone_submitted',
                'Milestone submitted for review',
                "{$vendor->fullName()} submitted \"{$milestone->title}\" on \"{$project->title}\" for your approval.",
                ['project_id' => $project->id, 'milestone_id' => $milestone->id],
            );
        }

        return $milestone->refresh();
    }

    /**
     * Approve a submitted milestone and RELEASE its amount to the vendor's main wallet.
     * Owner only. The escrow transfer is atomic + overdraft-guarded inside WalletService;
     * on any money failure the ValidationException rolls the whole thing back so the
     * milestone is NOT marked released.
     *
     * @return array{milestone: Milestone, reference: string}
     */
    public function approveMilestone(Milestone $milestone, User $owner): array
    {
        $project = $milestone->project;
        if (!$project || $project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can approve this milestone']);
        }
        if ($milestone->status !== 'submitted') {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be approved']);
        }
        if (!$project->vendor_id || !($vendor = $project->vendor)) {
            throw ValidationException::withMessages(['milestone' => 'No vendor is assigned to receive this payout']);
        }

        $vendorWallet = $vendor->mainWallet();
        if (!$vendorWallet) {
            throw ValidationException::withMessages(['milestone' => 'Vendor has no active wallet to receive payment']);
        }

        $projectWallet = $project->wallet;

        return DB::transaction(function () use ($milestone, $project, $owner, $vendor, $vendorWallet, $projectWallet) {
            // Overdraft-guarded, row-locked escrow payout. Throws ValidationException if
            // the escrow wallet was drained below the milestone amount — which rolls back
            // this transaction so the milestone stays 'submitted'.
            $result = $this->wallets->transferBetweenWallets(
                $projectWallet,
                $vendorWallet,
                $milestone->amount,
                $owner,
                "Milestone payout: {$milestone->title}",
            );

            $milestone->update([
                'status' => 'released',
                'released_at' => now(),
                'released_transaction_reference' => $result['reference'],
            ]);

            // Auto-complete the project once every milestone has been released.
            if ($project->milestones()->count() > 0
                && !$project->milestones()->where('status', '!=', 'released')->exists()) {
                $project->update(['status' => 'completed']);
            }

            $this->notifications->push(
                $vendor,
                'milestone_released',
                'Milestone payment released',
                '₦' . $this->naira($milestone->amount) . " was released to your wallet for \"{$milestone->title}\".",
                [
                    'project_id' => $project->id,
                    'milestone_id' => $milestone->id,
                    'amount' => $this->naira($milestone->amount),
                    'reference' => $result['reference'],
                ],
            );

            $this->notifications->push(
                $owner,
                'milestone_released',
                'Milestone approved and paid',
                "You approved \"{$milestone->title}\" and released ₦" . $this->naira($milestone->amount) . " to {$vendor->fullName()}.",
                [
                    'project_id' => $project->id,
                    'milestone_id' => $milestone->id,
                    'reference' => $result['reference'],
                ],
            );

            return ['milestone' => $milestone->refresh(), 'reference' => $result['reference']];
        });
    }

    /** Reject a submitted milestone back to 'funded' for revision. Owner only. */
    public function rejectMilestone(Milestone $milestone, User $owner, ?string $note): Milestone
    {
        $project = $milestone->project;
        if (!$project || $project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can reject this milestone']);
        }
        if ($milestone->status !== 'submitted') {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be rejected']);
        }

        $meta = $milestone->meta ?? [];
        $meta['rejection'] = $note;

        $milestone->update([
            'status' => 'funded',
            'meta' => $meta,
        ]);

        if ($vendor = $project->vendor) {
            $this->notifications->push(
                $vendor,
                'milestone_rejected',
                'Milestone sent back for revision',
                "\"{$milestone->title}\" on \"{$project->title}\" needs changes." . ($note ? " Note: {$note}" : ''),
                ['project_id' => $project->id, 'milestone_id' => $milestone->id],
            );
        }

        return $milestone->refresh();
    }

    /** Delete a milestone, freeing its reservation. Owner only; funded/rejected only. */
    public function removeMilestone(Milestone $milestone, User $owner): void
    {
        $project = $milestone->project;
        if (!$project || $project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can remove this milestone']);
        }
        if (!in_array($milestone->status, ['funded', 'rejected'], true)) {
            throw ValidationException::withMessages(['milestone' => 'Only a funded or rejected milestone can be removed']);
        }

        $milestone->delete();
    }

    /**
     * Cancel a project. Owner only. Blocked once any milestone has been submitted,
     * approved, or released (work/payment is already in flight). Sets status to
     * 'cancelled' and notifies the assigned vendor, if any.
     */
    public function cancel(Project $project, User $owner): Project
    {
        $this->assertOwner($project, $owner);

        if ($project->status === 'cancelled') {
            throw ValidationException::withMessages(['project' => 'Project is already cancelled']);
        }
        if ($project->milestones()->whereIn('status', ['submitted', 'approved', 'released'])->exists()) {
            throw ValidationException::withMessages(['project' => 'Cannot cancel a project with submitted, approved, or released milestones']);
        }

        $project->update(['status' => 'cancelled']);

        if ($project->vendor_id && ($vendor = $project->vendor)) {
            $this->notifications->push(
                $vendor,
                'project_cancelled',
                'Project cancelled',
                "{$owner->fullName()} cancelled the project \"{$project->title}\".",
                ['project_id' => $project->id, 'title' => $project->title],
            );
        }

        return $project->refresh();
    }
}
