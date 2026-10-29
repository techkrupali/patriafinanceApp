<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
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

        // INV-V1: the builder is invited, and accepts (or asks for changes, or declines).
        $meta = $project->meta ?? [];
        unset($meta['vendor_declined'], $meta['reinvite_on'], $meta['vendor_invite']);
        $project->update(['vendor_id' => $vendor->id, 'vendor_status' => 'invited', 'vendor_responded_at' => null, 'meta' => $meta]);
        $business = \App\Models\VendorProfile::where('user_id', $vendor->id)->value('business_name') ?? $vendor->fullName();
        $family = $owner->last_name ? "The {$owner->last_name} family" : $owner->fullName();

        $this->notifications->push(
            $vendor,
            'project_vendor_invited',
            "{$family} invited {$business}",
            "Review the milestones for \"{$project->title}\", then accept, ask for a change, or decline.",
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
        // The family (the owner or a co-owner); the builder proposes instead (VDM-09).
        if (!$project->isFamilyApprover($actor)) {
            throw ValidationException::withMessages(['project' => 'Only the family can add a milestone']);
        }

        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active']);
        }
        if ($amountKobo <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero']);
        }
        $sequence = ((int) $project->milestones()->max('sequence')) + 1;

        // Funded when the wallet covers it; otherwise planned until the money is in (PRW-03).
        $milestone = Milestone::create([
            'project_id' => $project->id,
            'sequence' => $sequence,
            'title' => $title,
            'description' => $description,
            'amount' => $amountKobo,
            'due_date' => $dueDate,
            'status' => $amountKobo <= $project->availableToAllocate() ? 'funded' : 'planned',
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
        if (!$project || !$project->actsForVendor($vendor, 'submit')) {
            throw ValidationException::withMessages(['milestone' => 'Only the assigned vendor can submit this milestone']);
        }
        if (!in_array($project->vendor_status, ['accepted', null], true)) {
            throw ValidationException::withMessages(['milestone' => 'Accept the project before submitting work.']);
        }
        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active.']);
        }
        if (!in_array($milestone->status, ['planned', 'funded', 'rejected'], true)) {
            throw ValidationException::withMessages(['milestone' => 'This milestone cannot be submitted in its current state']);
        }
        // PRW-03: planned before the money was in; it's reserved now, if it's there.
        if ($milestone->status === 'planned' && $milestone->amount > $project->availableToAllocate()) {
            throw ValidationException::withMessages(['milestone' => "The money for \"{$milestone->title}\" isn't in the project wallet yet. Only ₦" . $this->naira(max(0, $project->availableToAllocate())) . ' is free.']);
        }

        $meta = $milestone->meta ?? [];
        unset($meta['rejection']);
        $milestone->update([
            'status' => 'submitted',
            'proof' => $proof,
            'submitted_at' => now(),
            'submitted_by' => $vendor->id,
            'meta' => $meta,
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
     * The family approves a submitted milestone (the owner or a co-owner, PRJ-07).
     * If the escrow wallet's governance requires approval for this amount, this
     * routes the payout through the multi-approver ApprovalService (milestone
     * moves to 'approved' = awaiting approvers, escrow stays reserved) and a later
     * approver's yes is recorded on that request; otherwise it releases straight
     * away. Nothing is paid while a dispute holds it or to an unverified business.
     *
     * @return array{status: string, milestone: Milestone, reference?: string, approval_request_id?: int}
     */
    public function approveMilestone(Milestone $milestone, User $approver): array
    {
        $project = $milestone->project;
        if (!$project || !$project->isFamilyApprover($approver)) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can approve this milestone']);
        }
        if ($project->status !== 'active') {
            throw ValidationException::withMessages(['project' => 'Project is not active.']);
        }

        // PRJ-07 "Chidi · Waiting": the next approver says yes to the request the first one started.
        $requestId = $milestone->meta['approval_request_id'] ?? null;
        if ($milestone->status === 'approved' && $requestId && ($pending = ApprovalRequest::find($requestId)) && $pending->status === 'pending') {
            ApprovalService::make()->respond($pending, $approver, 'approve', null);
            $milestone->refresh();

            return $milestone->status === 'released'
                ? ['status' => 'released', 'milestone' => $milestone, 'reference' => $milestone->released_transaction_reference]
                : ['status' => 'pending_approval', 'milestone' => $milestone, 'approval_request_id' => $pending->id];
        }

        if ($milestone->status !== 'submitted') {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be approved']);
        }
        // DSP-02 "Opening a dispute puts the milestone payment on hold until it is sorted."
        $dispute = $milestone->activeDispute();
        if ($dispute && $dispute->status !== 'fixing') {
            throw ValidationException::withMessages(['milestone' => 'This payment is on hold while the dispute is open.']);
        }
        if (!$project->vendor_id || !$project->vendor) {
            throw ValidationException::withMessages(['milestone' => 'No vendor is assigned to receive this payout']);
        }
        if (!$project->vendor->mainWallet()) {
            throw ValidationException::withMessages(['milestone' => 'Vendor has no active wallet to receive payment']);
        }
        // VON-09 "Until you're approved … families can't pay you yet."
        $profile = VendorProfile::where('user_id', $project->vendor_id)->first();
        if (!$profile?->canBePaid()) {
            $name = $profile?->business_name ?? $project->vendor->fullName();
            throw ValidationException::withMessages(['milestone' => "{$name} isn't verified yet. Families can only pay verified businesses."]);
        }

        $projectWallet = $project->wallet;

        // Governance: when the escrow wallet requires approval for this amount,
        // create a multi-approver request and hold the milestone as 'approved'
        // (escrow stays reserved) until enough approvers sign off.
        if ($projectWallet->approvalRequiredFor($milestone->amount)) {
            $request = ApprovalService::make()->create(
                $projectWallet,
                $approver,
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

        $result = $this->releaseMilestone($milestone, $approver);

        return ['status' => 'released', 'milestone' => $result['milestone'], 'reference' => $result['reference']];
    }

    /**
     * Pay a milestone out of escrow to the vendor's main wallet and mark it
     * released. Called directly (no-governance path) and by ApprovalService once
     * a milestone_release request reaches its approval count. Row-locked and
     * idempotent: releases only a 'submitted' or 'approved' (pending) milestone.
     */
    public function releaseMilestone(Milestone $milestone, User $actor, int $refund = 0): array
    {
        $project = $milestone->project;
        $vendor = $project?->vendor;
        $vendorWallet = $vendor?->mainWallet();
        $projectWallet = $project?->wallet;
        if (!$project || !$vendor || !$vendorWallet || !$projectWallet) {
            throw ValidationException::withMessages(['milestone' => 'Cannot release: vendor or wallet is missing.']);
        }

        $released = DB::transaction(function () use ($milestone, $project, $actor, $vendor, $vendorWallet, $projectWallet, $refund) {
            // Row lock so two concurrent releases cannot both pay out. The second
            // finds a non-releasable status and aborts before any transfer.
            $fresh = Milestone::whereKey($milestone->id)->lockForUpdate()->first();
            if (!$fresh || !in_array($fresh->status, ['submitted', 'approved'], true)) {
                throw ValidationException::withMessages(['milestone' => 'This milestone has already been processed']);
            }

            // A dispute's partial refund (DSP-07) stays in the project wallet; the rest is paid.
            $refund = max(0, min($refund, $fresh->amount));
            $paid = $fresh->amount - $refund;
            // PRW-06 "Held back: 10% until 3 months after handover" stays in escrow.
            $retention = intdiv($paid * (int) ($project->meta['release']['retention_percent'] ?? 0), 100);

            // Overdraft-guarded, row-locked escrow payout. Throws (and rolls back
            // this transaction) if the escrow was drained below the amount.
            $result = $this->wallets->transferBetweenWallets(
                $projectWallet,
                $vendorWallet,
                $paid - $retention,
                $actor,
                "Milestone payout: {$fresh->title}",
            );

            $fresh->update([
                'status' => 'released',
                'released_at' => now(),
                'released_transaction_reference' => $result['reference'],
                'retention' => $retention,
                'meta' => array_merge($fresh->meta ?? [], array_filter(['refunded' => $refund ?: null, 'paid_now' => $paid - $retention])),
            ]);

            // Auto-complete the project once every milestone is released — only from
            // 'active', never overwriting a terminal status like 'cancelled'. That's
            // handover: what was held back is paid some months on.
            if ($project->status === 'active'
                && $project->milestones()->count() > 0
                && !$project->milestones()->whereNotIn('status', ['released', 'cancelled'])->exists()) {
                $project->update(['status' => 'completed']);
                $project->milestones()->where('retention', '>', 0)->whereNull('retention_released_at')
                    ->update(['retention_due_at' => now()->addMonthsNoOverflow((int) ($project->meta['release']['retention_months'] ?? 3))]);
            }

            $this->notifications->push(
                $vendor,
                'milestone_released',
                'Milestone payment released',
                '₦' . $this->naira($paid - $retention) . " was released to your wallet for \"{$fresh->title}\"." . ($retention ? ' ₦' . $this->naira($retention) . ' is held back until after handover.' : ''),
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
                "\"{$fresh->title}\" — ₦" . $this->naira($paid - $retention) . " released to {$vendor->fullName()}.",
                [
                    'project_id' => $project->id,
                    'milestone_id' => $fresh->id,
                    'reference' => $result['reference'],
                ],
            );

            // DSP-09: the fix the family accepted is done and paid, so the dispute closes.
            if (($dispute = $fresh->activeDispute()) && $dispute->status === 'fixing') {
                DisputeService::make()->resolveFixed($dispute, $paid - $retention, $retention);
            }

            return ['milestone' => $fresh->refresh(), 'reference' => $result['reference'], 'paid' => $paid - $retention];
        });

        // After the money is safely in: "Automatic withdrawal — every payout, straight away"
        // (VDM-06), and the next milestone's money is set aside.
        VendorPayoutService::make()->autoWithdraw($vendor, $released['paid'], $milestone->title);
        VendorProjectService::make()->fundPlanned($project->refresh());

        return $released;
    }

    /** PRJ-06 "Ask for changes": a submitted milestone goes back to the builder. The owner or a co-owner. */
    public function rejectMilestone(Milestone $milestone, User $owner, ?string $note): Milestone
    {
        $project = $milestone->project;
        if (!$project || !$project->isFamilyApprover($owner)) {
            throw ValidationException::withMessages(['milestone' => 'Only the project owner can reject this milestone']);
        }
        if (!in_array($milestone->status, ['submitted', 'approved'], true)) {
            throw ValidationException::withMessages(['milestone' => 'Only a submitted milestone can be rejected']);
        }

        $meta = $milestone->meta ?? [];
        // A co-owner's "not yet" stops the approval the first one started.
        if (!empty($meta['approval_request_id'])) {
            ApprovalRequest::whereKey($meta['approval_request_id'])->where('status', 'pending')->update(['status' => 'cancelled']);
            unset($meta['approval_request_id']);
        }
        $meta['rejection'] = $note ?: 'The family asked for changes.';

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
        if (!in_array($milestone->status, ['planned', 'funded', 'rejected'], true)) {
            throw ValidationException::withMessages(['milestone' => 'Only a planned, funded or rejected milestone can be removed']);
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
