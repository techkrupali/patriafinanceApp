<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\AppNotification;
use App\Models\KycSubmission;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\KycService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

abstract class ApiController extends Controller
{
    /**
     * Kobo the user has committed to sending OUT to third parties today. Used to
     * enforce the per-KYC-tier daily limit. This counts money genuinely leaving to
     * others — both executed/pending ledger debits AND still-open approval-gated
     * spends the user initiated today — but NEVER internal own-wallet moves or
     * escrow/milestone payouts.
     */
    protected function todaysOutgoingKobo(User $user): int
    {
        $startOfDay = now()->startOfDay();

        // Wallets this user OWNS — used to exclude internal own-wallet-to-own-wallet moves.
        $ownWalletIds = $user->wallets()->pluck('id')->all();

        // 1. Executed/pending ledger debits initiated by this user today. Only money
        //    leaving to third parties counts:
        //      - withdrawal:   payout to an external bank account (always counts)
        //      - transfer_out: internal wallet move — counts ONLY when it lands in a
        //        wallet the user does NOT own and is not an escrow/milestone release
        //        (those originate from a 'project' wallet).
        $rows = Transaction::where('user_id', $user->id)
            ->where('direction', 'debit')
            ->whereIn('type', ['transfer_out', 'withdrawal'])
            ->whereIn('status', ['successful', 'pending'])
            ->where('created_at', '>=', $startOfDay)
            ->with('wallet:id,type')
            ->get();

        $total = 0;
        foreach ($rows as $row) {
            if ($row->type === 'withdrawal') {
                $total += $row->amount + $row->fee;
                continue;
            }

            // transfer_out: skip escrow/milestone payouts (sourced from a project wallet).
            if ($row->wallet && $row->wallet->type === 'project') {
                continue;
            }

            // Skip internal moves into another wallet the same user owns.
            $destWalletId = $row->counterparty['wallet_id'] ?? null;
            if ($destWalletId !== null && in_array((int) $destWalletId, $ownWalletIds, true)) {
                continue;
            }

            $total += $row->amount + $row->fee;
        }

        // 2. Still-open (pending/approved, not yet executed/failed/rejected/expired)
        //    approval-gated outgoing spends this user initiated today. These have not
        //    hit the ledger yet, so counting them here stops many concurrent
        //    approval-gated transfers from collectively blowing past the daily cap.
        //    Apply the SAME exclusions as part 1 (escrow payouts + internal
        //    own-wallet moves) so the pending accounting stays symmetric with the
        //    executed accounting and can't wrongly inflate the daily total.
        $openApprovals = ApprovalRequest::where('initiator_id', $user->id)
            ->whereIn('status', ['pending', 'approved'])
            ->whereIn('action', ['withdrawal', 'transfer_bank', 'transfer_wallet', 'transfer_user'])
            ->where('created_at', '>=', $startOfDay)
            ->with('wallet:id,type')
            ->get();

        foreach ($openApprovals as $req) {
            // Skip escrow/milestone payouts (sourced from a project wallet).
            if ($req->wallet && $req->wallet->type === 'project') {
                continue;
            }
            // Skip internal moves into another wallet the same user owns.
            if ($req->action === 'transfer_wallet') {
                $destWalletId = $req->payload['wallet_id'] ?? null;
                if ($destWalletId !== null && in_array((int) $destWalletId, $ownWalletIds, true)) {
                    continue;
                }
            }
            $total += $req->amount + $req->fee;
        }

        return $total;
    }

    /**
     * Guard an outgoing spend of $amountKobo against the user's daily transfer
     * limit for their KYC tier. Returns a 422 JsonResponse if it would be exceeded,
     * or null when allowed (limit null = unlimited, e.g. tier 3).
     */
    protected function dailyTransferLimitError(User $user, int $amountKobo): ?JsonResponse
    {
        $limit = KycService::make()->limits((int) $user->kyc_tier)['daily_transfer_limit'];
        if ($limit === null) {
            return null;
        }

        if ($this->todaysOutgoingKobo($user) + $amountKobo > $limit) {
            return $this->fail('This exceeds your daily transfer limit for your verification tier. Verify a higher tier to raise it.', 422);
        }

        return null;
    }

    protected function ok(string $message, mixed $data = null, int $code = 200): JsonResponse
    {
        $payload = ['status' => true, 'message' => $message];
        if ($data !== null) {
            $payload['data'] = $data;
        }

        return response()->json($payload, $code);
    }

    protected function fail(string $message, int $code = 422, mixed $errors = null): JsonResponse
    {
        $payload = ['status' => false, 'message' => $message];
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }

        return response()->json($payload, $code);
    }

    protected function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'full_name' => $user->fullName(),
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar_url' => $user->avatar_url,
            'kyc_tier' => $user->kyc_tier,
            'role' => $user->role,
            'status' => $user->status,
            'email_verified' => (bool) $user->email_verified_at,
            'phone_verified' => (bool) $user->phone_verified_at,
            'has_pin' => (bool) $user->pin,
            'created_at' => $user->created_at?->toIso8601String(),
        ];
    }

    protected function serializeWallet(Wallet $wallet, bool $withOwner = false): array
    {
        $data = [
            'id' => $wallet->id,
            'type' => $wallet->type,
            'name' => $wallet->name,
            'description' => $wallet->description,
            'currency' => $wallet->currency,
            'balance' => $wallet->balanceNaira(),
            'target_amount' => $wallet->target_amount !== null ? number_format($wallet->target_amount / 100, 2, '.', '') : null,
            'approval_enabled' => (bool) $wallet->approval_enabled,
            'approval_threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
            'required_approvals' => (int) $wallet->required_approvals,
            'virtual_account' => $wallet->virtual_account,
            'virtual_account_bank' => $wallet->virtual_account_bank,
            'status' => $wallet->status,
            'created_at' => $wallet->created_at?->toIso8601String(),
        ];

        if ($withOwner) {
            $data['owner'] = [
                'id' => $wallet->owner->id,
                'name' => $wallet->owner->fullName(),
                'email' => $wallet->owner->email,
            ];
        }

        return $data;
    }

    protected function serializeTransaction(Transaction $txn): array
    {
        return [
            'id' => $txn->id,
            'reference' => $txn->reference,
            'wallet_id' => $txn->wallet_id,
            'type' => $txn->type,
            'direction' => $txn->direction,
            'amount' => number_format($txn->amount / 100, 2, '.', ''),
            'fee' => number_format($txn->fee / 100, 2, '.', ''),
            'balance_after' => $txn->balance_after !== null ? number_format($txn->balance_after / 100, 2, '.', '') : null,
            'status' => $txn->status,
            'description' => $txn->description,
            'counterparty' => $txn->counterparty,
            'created_at' => $txn->created_at?->toIso8601String(),
        ];
    }

    protected function serializeMember(WalletMember $member): array
    {
        return [
            'id' => $member->id,
            'user_id' => $member->user_id,
            'name' => $member->user?->fullName(),
            'email' => $member->user?->email,
            'role' => $member->role,
            'can_approve' => (bool) $member->can_approve,
            'can_spend' => in_array($member->role, ['owner', 'co_owner'], true)
                || ($member->permissions['can_spend'] ?? false) === true,
            'status' => $member->status,
        ];
    }

    protected function serializeInvitation(WalletInvitation $invitation): array
    {
        return [
            'id' => $invitation->id,
            'wallet_id' => $invitation->wallet_id,
            'wallet' => $invitation->relationLoaded('wallet') && $invitation->wallet ? [
                'id' => $invitation->wallet->id,
                'name' => $invitation->wallet->name,
                'type' => $invitation->wallet->type,
            ] : null,
            'inviter' => $invitation->relationLoaded('inviter') && $invitation->inviter ? [
                'id' => $invitation->inviter->id,
                'name' => $invitation->inviter->fullName(),
            ] : null,
            'invitee_identifier' => $invitation->invitee_identifier,
            'invitee_user_id' => $invitation->invitee_user_id,
            'role' => $invitation->role,
            'can_approve' => (bool) $invitation->can_approve,
            'status' => $invitation->status,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
            'responded_at' => $invitation->responded_at?->toIso8601String(),
            'created_at' => $invitation->created_at?->toIso8601String(),
        ];
    }

    protected function serializeApprovalRequest(ApprovalRequest $request, ?User $viewer = null): array
    {
        $data = [
            'id' => $request->id,
            'wallet_id' => $request->wallet_id,
            'wallet' => $request->relationLoaded('wallet') && $request->wallet ? [
                'id' => $request->wallet->id,
                'name' => $request->wallet->name,
                'type' => $request->wallet->type,
            ] : null,
            'initiator' => $request->relationLoaded('initiator') && $request->initiator ? [
                'id' => $request->initiator->id,
                'name' => $request->initiator->fullName(),
            ] : null,
            'action' => $request->action,
            'amount' => number_format($request->amount / 100, 2, '.', ''),
            'fee' => number_format($request->fee / 100, 2, '.', ''),
            'description' => $request->description,
            'status' => $request->status,
            'approvals_count' => (int) $request->approvals_count,
            'required_approvals' => (int) $request->required_approvals,
            'executed_transaction_reference' => $request->executed_transaction_reference,
            'fail_reason' => $request->fail_reason,
            'expires_at' => $request->expires_at?->toIso8601String(),
            'created_at' => $request->created_at?->toIso8601String(),
        ];

        if ($viewer !== null) {
            $data['my_responded'] = $request->responses()->where('approver_id', $viewer->id)->exists();
        }

        return $data;
    }

    protected function serializeNotification(AppNotification $notification): array
    {
        return [
            'id' => $notification->id,
            'type' => $notification->type,
            'title' => $notification->title,
            'body' => $notification->body,
            'data' => $notification->data,
            'read' => $notification->read_at !== null,
            'read_at' => $notification->read_at?->toIso8601String(),
            'created_at' => $notification->created_at?->toIso8601String(),
        ];
    }

    protected function serializeLoan(Loan $loan): array
    {
        return [
            'id' => $loan->id,
            'reference' => $loan->reference,
            'category' => $loan->category,
            'purpose' => $loan->purpose,
            'principal' => number_format($loan->principal / 100, 2, '.', ''),
            'interest_bps' => (int) $loan->interest_bps,
            'fee' => number_format($loan->fee / 100, 2, '.', ''),
            'total_repayable' => number_format($loan->total_repayable / 100, 2, '.', ''),
            'outstanding' => number_format($loan->outstanding / 100, 2, '.', ''),
            'penalty_accrued' => number_format($loan->penalty_accrued / 100, 2, '.', ''),
            'tenor_days' => (int) $loan->tenor_days,
            'repayment_frequency' => $loan->repayment_frequency,
            'status' => $loan->status,
            'disbursed_wallet_id' => $loan->disbursed_wallet_id,
            'disbursed_at' => $loan->disbursed_at?->toIso8601String(),
            'due_at' => $loan->due_at?->toIso8601String(),
            'progress_pct' => $loan->progressPct(),
            'created_at' => $loan->created_at?->toIso8601String(),
        ];
    }

    protected function serializeLoanRepayment(LoanRepayment $repayment): array
    {
        return [
            'id' => $repayment->id,
            'sequence' => (int) $repayment->sequence,
            'due_date' => $repayment->due_date?->toDateString(),
            'amount_due' => number_format($repayment->amount_due / 100, 2, '.', ''),
            'amount_paid' => number_format($repayment->amount_paid / 100, 2, '.', ''),
            'status' => $repayment->status,
            'paid_at' => $repayment->paid_at?->toIso8601String(),
        ];
    }

    protected function serializeProject(Project $project, ?User $viewer = null): array
    {
        return [
            'id' => $project->id,
            'title' => $project->title,
            'description' => $project->description,
            'wallet_id' => $project->wallet_id,
            'wallet_balance' => $project->wallet ? $project->wallet->balanceNaira() : number_format(0, 2, '.', ''),
            'budget' => number_format($project->budget / 100, 2, '.', ''),
            'reserved' => number_format($project->reservedAmount() / 100, 2, '.', ''),
            'available' => number_format($project->availableToAllocate() / 100, 2, '.', ''),
            'released' => number_format($project->releasedAmount() / 100, 2, '.', ''),
            'status' => $project->status,
            'vendor' => $project->vendor ? ['id' => $project->vendor->id, 'name' => $project->vendor->fullName()] : null,
            'owner' => $project->owner ? ['id' => $project->owner->id, 'name' => $project->owner->fullName()] : null,
            'my_role' => $viewer !== null ? $project->roleOf($viewer) : null,
            'milestones_total' => (int) $project->milestones()->count(),
            'milestones_released' => (int) $project->milestones()->where('status', 'released')->count(),
            'created_at' => $project->created_at?->toIso8601String(),
        ];
    }

    protected function serializeMilestone(Milestone $milestone): array
    {
        return [
            'id' => $milestone->id,
            'sequence' => (int) $milestone->sequence,
            'title' => $milestone->title,
            'description' => $milestone->description,
            'amount' => number_format($milestone->amount / 100, 2, '.', ''),
            'status' => $milestone->status,
            'proof' => $milestone->proof,
            'submitted_at' => $milestone->submitted_at?->toIso8601String(),
            'released_at' => $milestone->released_at?->toIso8601String(),
            'released_transaction_reference' => $milestone->released_transaction_reference,
            'created_at' => $milestone->created_at?->toIso8601String(),
        ];
    }

    protected function serializeKycSubmission(KycSubmission $s, bool $withPayload = false): array
    {
        $data = [
            'id' => $s->id,
            'target_tier' => (int) $s->target_tier,
            'type' => $s->type,
            'status' => $s->status,
            'review_note' => $s->review_note,
            'reviewed_at' => $s->reviewed_at?->toIso8601String(),
            'created_at' => $s->created_at?->toIso8601String(),
        ];

        if ($withPayload) {
            $data['payload'] = $s->payload;
        }

        return $data;
    }

    /** Parse a naira amount ("1500" / "1500.50") into kobo int. */
    protected function toKobo(string|int|float $naira): int
    {
        return (int) round(((float) $naira) * 100);
    }
}
