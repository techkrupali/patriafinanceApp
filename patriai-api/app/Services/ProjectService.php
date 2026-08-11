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

    private function assertOwnerOrVendor(Project $project, User $user): void
    {
        if ($project->owner_id !== $user->id && $project->vendor_id !== $user->id) {
            throw ValidationException::withMessages(['project' => 'Only the project owner or vendor can perform this action']);
        }
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
    public function assignVendor(Project $project, User $owner, User $vendor): Project
    {
        $this->assertOwner($project, $owner);

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
        if ($project->milestones()->whereIn('status', ['submitted', 'approved', 'released'])->exists()) {
            throw ValidationException::withMessages(['vendor' => 'Cannot remove the vendor after milestones have been submitted, approved, or released']);
        }

        $project->update(['vendor_id' => null]);

        return $project->refresh();
    }

    /**
     * Add a milestone reserving part of the escrow wallet. Owner only.
     * Amount must be > 0 and within the wallet's unallocated balance.
     */
    public function addMilestone(Project $project, User $actor, string $title, ?string $description, int $amountKobo, ?string $dueDate = null): Milestone
    {
        // Both the project owner and the assigned vendor may add milestones.
        $this->assertOwnerOrVendor($project, $actor);

        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active']);
        }
        if ($amountKobo <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero']);
        }
        if ($amountKobo > $project->availableToAllocate()) {
            throw ValidationException::withMessages([
                'amount' => 'Insufficient available funds in this Project Wallet. Fund the escrow first — only ₦'
                    . $this->naira($project->availableToAllocate()) . ' is available to allocate to milestones.',
            ]);
        }

        $sequence = ((int) $project->milestones()->max('sequence')) + 1;

        $milestone = Milestone::create([
            'project_id' => $project->id,
            'sequence' => $sequence,
            'title' => $title,
            'description' => $description,
            'amount' => $amountKobo,
            'due_date' => $dueDate,
            'status' => 'funded',
        ]);

        // Notify the counterparty (owner adds -> tell vendor; vendor adds -> tell owner).
        $notify = $actor->id === $project->owner_id ? $project->vendor : $project->owner;
        if ($notify) {
            $this->notifications->push(
                $notify,
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
        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active.']);
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
    /**
     * Owner approves a submitted milestone. If the escrow wallet's governance
     * requires approval for this amount, this routes the payout through the
     * multi-approver ApprovalService (milestone moves to 'approved' = awaiting
     * approvers, escrow stays reserved) instead of releasing immediately.
     * Otherwise it releases straight away.
     */
    public function approveMilestone(Milestone $milestone, User $owner): array
    {
        $project = $milestone->project;
        if (!$project || $project->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can approve this milestone']);
        }
        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active.']);
        }
        if ($milestone->status !== 'submitted') {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be approved']);
        }
        if (!$project->vendor_id || !$project->vendor) {
            throw ValidationException::withMessages(['milestone' => 'No vendor is assigned to receive this payout']);
        }
        if (!$project->vendor->mainWallet()) {
            throw ValidationException::withMessages(['milestone' => 'Vendor has no active wallet to receive payment']);
        }

        $projectWallet = $project->wallet;

        // Governance: when the escrow wallet requires approval for this amount,
        // create a multi-approver request and hold the milestone as 'approved'
        // (escrow stays reserved) until enough approvers sign off.
        if ($projectWallet->approvalRequiredFor($milestone->amount)) {
            $request = ApprovalService::make()->create(
                $projectWallet,
                $owner,
                'milestone_release',
                $milestone->amount,
                0,
                "Milestone payout: {$milestone->title}",
                ['milestone_id' => $milestone->id],
            );

            $milestone->update([
                'status' => 'approved',
                'meta' => array_merge($milestone->meta ?? [], ['approval_request_id' => $request->id]),
            ]);

            return [
                'status' => 'pending_approval',
                'milestone' => $milestone->refresh(),
                'approval_request_id' => $request->id,
            ];
        }

        $result = $this->releaseMilestone($milestone, $owner);

        return ['status' => 'released', 'milestone' => $result['milestone'], 'reference' => $result['reference']];
    }

    /**
     * Pay a milestone out of escrow to the vendor's main wallet and mark it
     * released. Called directly (no-governance path) and by ApprovalService once
     * a milestone_release request reaches its approval count. Row-locked and
     * idempotent: releases only a 'submitted' or 'approved' (pending) milestone.
     */
    public function releaseMilestone(Milestone $milestone, User $actor): array
    {
        $project = $milestone->project;
        $vendor = $project?->vendor;
        $vendorWallet = $vendor?->mainWallet();
        $projectWallet = $project?->wallet;
        if (!$project || !$vendor || !$vendorWallet || !$projectWallet) {
            throw ValidationException::withMessages(['milestone' => 'Cannot release: vendor or wallet is missing.']);
        }

        return DB::transaction(function () use ($milestone, $project, $actor, $vendor, $vendorWallet, $projectWallet) {
            // Row lock so two concurrent releases cannot both pay out. The second
            // finds a non-releasable status and aborts before any transfer.
            $fresh = Milestone::whereKey($milestone->id)->lockForUpdate()->first();
            if (!$fresh || !in_array($fresh->status, ['submitted', 'approved'], true)) {
                throw ValidationException::withMessages(['milestone' => 'This milestone has already been processed']);
            }

            // Overdraft-guarded, row-locked escrow payout. Throws (and rolls back
            // this transaction) if the escrow was drained below the amount.
            $result = $this->wallets->transferBetweenWallets(
                $projectWallet,
                $vendorWallet,
                $fresh->amount,
                $actor,
                "Milestone payout: {$fresh->title}",
            );

            $fresh->update([
                'status' => 'released',
                'released_at' => now(),
                'released_transaction_reference' => $result['reference'],
            ]);

            // Auto-complete the project once every milestone is released — only from
            // 'active', never overwriting a terminal status like 'cancelled'.
            if ($project->status === 'active'
                && $project->milestones()->count() > 0
                && !$project->milestones()->where('status', '!=', 'released')->exists()) {
                $project->update(['status' => 'completed']);
            }

            $this->notifications->push(
                $vendor,
                'milestone_released',
                'Milestone payment released',
                '₦' . $this->naira($fresh->amount) . " was released to your wallet for \"{$fresh->title}\".",
                [
                    'project_id' => $project->id,
                    'milestone_id' => $fresh->id,
                    'amount' => $this->naira($fresh->amount),
                    'reference' => $result['reference'],
                ],
            );

            $this->notifications->push(
                $project->owner,
                'milestone_released',
                'Milestone paid',
                "\"{$fresh->title}\" — ₦" . $this->naira($fresh->amount) . " released to {$vendor->fullName()}.",
                [
                    'project_id' => $project->id,
                    'milestone_id' => $fresh->id,
                    'reference' => $result['reference'],
                ],
            );

            return ['milestone' => $fresh->refresh(), 'reference' => $result['reference']];
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
