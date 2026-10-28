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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

abstract class ApiController extends Controller
{
    /** Transaction PIN: 6 digits for phone sign-ups, 4 for accounts made before them. */
    protected const TXN_PIN = 'regex:/^(\d{4}|\d{6})$/';

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

    /**
     * Best-effort normalize a phone identifier to the stored E.164 form
     * (+<code><national>). Clients send E.164 directly; this also rescues loose
     * inputs (spaces/dashes, a "00" international prefix, or a bare local
     * trunk-0 number, which we treat as the primary market — Nigeria, +234).
     */
    protected function normalizePhone(string $raw): string
    {
        $trimmed = trim($raw);
        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D/', '', $trimmed);

        if ($digits === '') {
            return $trimmed;
        }
        if ($hasPlus) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, '00')) {
            return '+' . substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            return '+234' . ltrim($digits, '0');
        }

        return '+' . $digits;
    }

    /** Wallets whose spend requests this user may approve: owned, or an approving member. */
    protected function approvableWalletIds(User $user): \Illuminate\Support\Collection
    {
        $owned = Wallet::where('user_id', $user->id)->pluck('id');

        $member = WalletMember::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('role', '!=', 'viewer')
            ->where(function ($q) {
                $q->whereIn('role', ['owner', 'co_owner', 'admin'])->orWhere('can_approve', true);
            })
            ->pluck('wallet_id');

        return $owned->concat($member)->unique()->values();
    }

    /** Record the device a session was opened from (Devices screen, push tokens). */
    protected function recordDevice(Request $request, User $user): void
    {
        if (!$request->filled('device_id')) {
            return;
        }

        $user->devices()->updateOrCreate(
            ['device_id' => $request->input('device_id')],
            [
                'device_name' => $request->input('device_name'),
                'platform' => $request->input('platform'),
                'last_active_at' => now(),
            ],
        );
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
            'username' => $user->username,
            'avatar_url' => $user->avatar_url,
            'kyc_tier' => $user->kyc_tier,
            'role' => $user->role,
            'status' => $user->status,
            'email_verified' => (bool) $user->email_verified_at,
            'phone_verified' => (bool) $user->phone_verified_at,
            'has_pin' => (bool) $user->pin,
            'has_password' => $user->password !== null,
            'pin_length' => (int) ($user->pin_length ?? 4),
            'language' => $user->language ?? 'en',
            'date_of_birth' => $user->date_of_birth?->toDateString(),
            'onboarding_purposes' => $user->onboarding_purposes ?? [],
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
            // PRW-05 "Move in House Project savings — ₦1,200,000 now": what's free to move.
            'available' => in_array($wallet->type, ['savings', 'project'], true) ? number_format(max(0, $wallet->availableToSpend()) / 100, 2, '.', '') : null,
            'target_amount' => $wallet->target_amount !== null ? number_format($wallet->target_amount / 100, 2, '.', '') : null,
            'target_date' => $wallet->target_date?->toDateString(),
            'approval_enabled' => (bool) $wallet->approval_enabled,
            'approval_threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
            'required_approvals' => (int) $wallet->required_approvals,
            'virtual_account' => $wallet->virtual_account,
            'virtual_account_bank' => $wallet->virtual_account_bank,
            'status' => $wallet->status,
            // Scheduled-access window (Wallet Lock feature); null when unrestricted.
            'access_schedule' => $wallet->access_schedule,
            // Emergency wallet held by its access rules (always false for other types).
            'emergency_locked' => $wallet->isEmergencyLocked(),
            // Type-specific purpose chosen during guided setup (e.g. "medical").
            'purpose' => $wallet->type === 'emergency'
                ? ($wallet->emergencySetting?->purpose ?? $wallet->meta['purpose'] ?? null)
                : ($wallet->meta['purpose'] ?? null),
            // Guided creation choices (WCR-02/09/11).
            'mode' => $wallet->meta['mode'] ?? null,
            'approval_mode' => $wallet->approvalMode(),
            'lock_until_goal' => ($wallet->meta['lock_until_goal'] ?? false) === true,
            'goal_locked' => $wallet->isGoalLocked(),
            'approval_expiry_hours' => $wallet->approvalExpiryHours(),
            'reminder_day' => $wallet->reminderDay(),
            'colour' => $wallet->meta['colour'] ?? null,
            // SAV-05: until a date or the target; `locked` while it holds.
            // GLW: kind, what it covers, the contribution link, paying someone directly.
            'goal' => $wallet->type === 'goal' ? \App\Services\GoalService::make()->summary($wallet) : null,
            'joint' => \App\Services\JointService::make()->summary($wallet),
            'child' => \App\Services\ChildService::make()->summary($wallet),
            'lock' => ($lock = $wallet->savingsLock()) ? $lock + [
                'locked' => $wallet->isGoalLocked(),
                'charity' => $lock['charity_id'] ? \App\Models\Organisation::find($lock['charity_id'])?->only(['id', 'name', 'area', 'state']) : null,
            ] : null,
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
            // Mirror Wallet::canSpend exactly: owner/co_owner always; admin/contributor
            // only with an explicit grant; every other role never (so a stale grant on
            // a demoted viewer/child/vendor is not shown as spendable).
            'can_spend' => in_array($member->role, ['owner', 'co_owner'], true)
                || (in_array($member->role, ['admin', 'contributor'], true)
                    && ($member->permissions['can_spend'] ?? false) === true),
            // Effective granular access matrix ("Assign Wallet Access & Roles"),
            // mirroring Wallet::canView/canFund/canRequest/canWithdraw so the app can
            // render each toggle's true state. Owner/co_owner => all on; view/fund/
            // request default on unless explicitly disabled; withdraw follows can_spend.
            'permissions' => $this->serializeMemberPermissions($member),
            'status' => $member->status,
        ];
    }

    /** Effective view/fund/request/withdraw booleans for a member (see serializeMember). */
    protected function serializeMemberPermissions(WalletMember $member): array
    {
        $elevated = in_array($member->role, ['owner', 'co_owner'], true);
        $perms = $member->permissions ?? [];
        $canSpend = $elevated
            || (in_array($member->role, ['admin', 'contributor'], true) && ($perms['can_spend'] ?? false) === true);

        return [
            'view' => $elevated ? true : (($perms['view'] ?? true) !== false),
            'fund' => $elevated ? true : (($perms['fund'] ?? true) !== false),
            'request' => $elevated ? true : (($perms['request'] ?? true) !== false),
            'withdraw' => $elevated ? true : ($canSpend && (($perms['withdraw'] ?? true) !== false)),
            // Per-member spend-request cap: naira decimal string, or null when unset.
            'request_limit' => ($perms['request_limit'] ?? null) !== null
                ? number_format(((int) $perms['request_limit']) / 100, 2, '.', '')
                : null,
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
            // Access chosen for this person at invite time (null = role defaults).
            'permissions' => $invitation->permissions ? array_intersect_key($invitation->permissions, array_flip(['view', 'fund', 'request', 'withdraw'])) : null,
            // Emergency contributors: what they were asked to put in each month (EMG-02).
            'pledge' => $invitation->pledge_amount ? [
                'amount' => number_format($invitation->pledge_amount / 100, 2, '.', ''),
                'label' => '₦' . number_format($invitation->pledge_amount / 100) . ' a month, on the 25th',
            ] : null,
            // Savings wallets: the plan the invitee is joining.
            'savings' => $invitation->relationLoaded('wallet') && $invitation->wallet
                ? \App\Services\SavingsService::make()->invitationSummary($invitation->wallet)
                : null,
            // INV-O1: the joint wallet rules the partner accepts.
            'joint' => $invitation->relationLoaded('wallet') && $invitation->wallet
                ? \App\Services\JointService::make()->summary($invitation->wallet)
                : null,
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
            // PRW-01…06: what, where, when, the buffer and the release rules.
            'setup' => $project->meta ? [
                'kind' => $project->meta['kind'] ?? null,
                'location' => $project->meta['location'] ?? null,
                'starts_on' => $project->meta['starts_on'] ?? null,
                'finishes_on' => $project->meta['finishes_on'] ?? null,
                'buffer_percent' => (int) ($project->meta['buffer_percent'] ?? 0),
                'release' => $project->meta['release'] ?? null,
                'vendor_invite' => $project->meta['vendor_invite'] ?? null,
            ] : null,
            'held_back' => number_format($project->heldBack() / 100, 2, '.', ''),
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
            'due_date' => $milestone->due_date?->toDateString(),
            'status' => $milestone->status,
            'proof' => $milestone->proof,
            'submitted_at' => $milestone->submitted_at?->toIso8601String(),
            'released_at' => $milestone->released_at?->toIso8601String(),
            'released_transaction_reference' => $milestone->released_transaction_reference,
            'starts_on' => $milestone->meta['starts_on'] ?? null,
            'retention' => number_format($milestone->retention / 100, 2, '.', ''),
            'retention_due_at' => $milestone->retention_due_at?->toIso8601String(),
            'retention_released_at' => $milestone->retention_released_at?->toIso8601String(),
            'evidence' => $milestone->evidence->map(fn ($e) => [
                'id' => $e->id,
                'kind' => $e->kind,
                'url' => $e->url,
                'uploaded_by' => $e->user?->fullName(),
                'created_at' => $e->created_at?->toIso8601String(),
            ])->values(),
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

    /**
     * Parse a naira amount ("1500" / "1500.50") into kobo int.
     *
     * Single choke point for every money input: only a plain positive decimal
     * (max 2 places) within 0 < kobo <= ₦10 billion is accepted, so oversized,
     * signed, or scientific-notation input can never overflow into negative kobo.
     */
    protected function toKobo(string|int|float $naira): int
    {
        $raw = is_string($naira) ? trim($naira) : (string) $naira;

        // Plain decimal only — no sign/exponent, max 11 integer digits + 2 places.
        if (!preg_match('/^(\d{1,11})(?:\.(\d{1,2}))?$/', $raw, $m)) {
            throw ValidationException::withMessages(['amount' => 'Invalid amount.']);
        }

        // Pure integer math (max fits comfortably in 64 bits) — no float path.
        $kobo = ((int) $m[1]) * 100 + (int) str_pad($m[2] ?? '', 2, '0');

        if ($kobo <= 0 || $kobo > 10_000_000_000_00) { // cap: ₦10 billion in kobo
            throw ValidationException::withMessages(['amount' => 'Invalid amount.']);
        }

        return $kobo;
    }
}
