<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApprovalRequest;
use App\Models\AppNotification;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Http\JsonResponse;

abstract class ApiController extends Controller
{
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

    /** Parse a naira amount ("1500" / "1500.50") into kobo int. */
    protected function toKobo(string|int|float $naira): int
    {
        return (int) round(((float) $naira) * 100);
    }
}
