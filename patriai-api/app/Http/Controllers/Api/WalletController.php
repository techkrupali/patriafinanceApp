<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\KycService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends ApiController
{
    /** Wallet types a user may create directly (main is auto-provisioned). */
    private const CREATABLE_TYPES = ['shared', 'project', 'savings', 'goal', 'emergency', 'giving', 'joint', 'child', 'spending'];

    // GET /wallets
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $own = $user->wallets()->latest()->get()->map(fn ($w) => $this->serializeWallet($w) + ['my_role' => 'owner']);
        $member = $user->memberWallets()
            ->where('wallets.user_id', '!=', $user->id)
            ->get()
            ->map(fn ($w) => $this->serializeWallet($w, withOwner: true) + ['my_role' => $w->pivot->role]);

        return $this->ok('Wallets fetched', ['wallets' => $own->concat($member)->values()]);
    }

    // POST /wallets  { type, name, description?, target_amount? }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:' . implode(',', self::CREATABLE_TYPES)],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:200'],
            'target_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $user = $request->user();

        // KYC tier wallet-count guard. Caps are generous (5/10/25) so existing
        // users are unaffected — verifying a higher tier unlocks more wallets.
        $maxWallets = KycService::make()->limits((int) $user->kyc_tier)['max_wallets'];
        if ($user->wallets()->count() >= $maxWallets) {
            return $this->fail('Wallet limit reached for your verification tier. Verify a higher KYC tier to create more wallets.', 422);
        }

        $opts = [];
        if (($data['description'] ?? null) !== null) {
            $opts['description'] = $data['description'];
        }
        if (($data['target_amount'] ?? null) !== null) {
            $opts['target_amount'] = $this->toKobo($data['target_amount']);
        }

        $wallet = WalletService::make()->createWallet($user, $data['type'], $data['name'], $opts);

        return $this->ok('Wallet created', ['wallet' => $this->serializeWallet($wallet)], 201);
    }

    // GET /wallets/{wallet}
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $user = $request->user();

        $members = $wallet->members()->with('user')->where('status', 'active')->get()->map(fn ($m) => [
            'user_id' => $m->user_id,
            'name' => $m->user?->fullName(),
            'email' => $m->user?->email,
            'role' => $m->role,
            'can_approve' => (bool) $m->can_approve,
        ]);

        return $this->ok('Wallet fetched', [
            'wallet' => $this->serializeWallet($wallet, withOwner: true),
            'members' => $members,
            'my_role' => $wallet->roleOf($user),
            'my_can_spend' => $wallet->canSpend($user),
            'approval' => [
                'enabled' => (bool) $wallet->approval_enabled,
                'threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
                'required_approvals' => (int) $wallet->required_approvals,
            ],
            'held_amount' => number_format($wallet->heldAmount() / 100, 2, '.', ''),
            'pending_approvals' => $wallet->approvalRequests()->where('status', 'pending')->count(),
            'recent_transactions' => $wallet->transactions()->latest()->limit(10)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
        ]);
    }

    // GET /wallets/{wallet}/transactions
    public function transactions(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $txns = $wallet->transactions()
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('direction'), fn ($q, $d) => $q->where('direction', $d))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Transactions fetched', [
            'transactions' => collect($txns->items())->map(fn ($t) => $this->serializeTransaction($t)),
            'pagination' => [
                'page' => $txns->currentPage(),
                'per_page' => $txns->perPage(),
                'total' => $txns->total(),
                'last_page' => $txns->lastPage(),
            ],
        ]);
    }

    // GET /wallets/{wallet}/funding-details
    public function fundingDetails(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        if (!$wallet->virtual_account) {
            WalletService::make()->ensureVirtualAccount($wallet);
            $wallet->refresh();
        }

        if (!$wallet->virtual_account) {
            return $this->fail('Funding account is being provisioned. Try again shortly.', 503);
        }

        return $this->ok('Funding details fetched', [
            'account_number' => $wallet->virtual_account,
            'bank_name' => $wallet->virtual_account_bank,
            'account_name' => 'PATRIAI/' . strtoupper($wallet->owner->fullName()),
            'note' => 'Transfer any amount to this account from any Nigerian bank to fund this wallet instantly.',
        ]);
    }

    // POST /wallets/{wallet}/withdraw  { amount, bank_code, account_number, account_name, pin, description? }
    public function withdraw(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if (!$wallet->canSpend($request->user())) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'bank_code' => ['required', 'string'],
            'account_number' => ['required', 'digits:10'],
            'account_name' => ['required', 'string', 'max:150'],
            'bank_name' => ['required', 'string', 'max:150'],
            'pin' => ['required', 'digits:4'],
            'description' => ['nullable', 'string', 'max:200'],
        ]);

        $user = $request->user();
        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $amountKobo = $this->toKobo($data['amount']);
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // Per-tier daily withdrawal/transfer limit.
        if ($err = $this->dailyTransferLimitError($user, $amountKobo)) {
            return $err;
        }

        // Cannot commit more than is genuinely available: pending approvals and
        // (for project wallets) milestone reservations are subtracted here.
        if ($amountKobo + $feeKobo > $wallet->availableToSpend()) {
            return $this->fail('Amount exceeds available balance (funds are reserved for pending approvals/milestones).', 422);
        }

        // Only route to approval when at least one eligible approver exists; otherwise
        // the initiator is the sole controller, so the spend executes directly.
        if ($wallet->approvalRequiredFor($amountKobo) && $wallet->eligibleApprovers($user->id)->isNotEmpty()) {
            $req = ApprovalService::make()->create(
                $wallet,
                $user,
                'withdrawal',
                $amountKobo,
                $feeKobo,
                $data['description'] ?? null,
                [
                    'bank_code' => $data['bank_code'],
                    'account_number' => $data['account_number'],
                    'account_name' => $data['account_name'],
                    'bank_name' => $data['bank_name'],
                    'description' => $data['description'] ?? null,
                ],
            );

            return $this->ok('Withdrawal submitted for approval', [
                'pending_approval' => true,
                'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
            ]);
        }

        $txn = WalletService::make()->withdrawToBank(
            $wallet,
            $user,
            $amountKobo,
            $data['bank_code'],
            $data['account_number'],
            $data['account_name'],
            $data['bank_name'],
            $data['description'] ?? null,
        );

        return $this->ok('Withdrawal successful', ['transaction' => $this->serializeTransaction($txn)]);
    }

    // PATCH /wallets/{wallet}  { name?, description?, approval_enabled?, approval_threshold?, required_approvals? }
    public function updateSettings(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can change wallet settings', 403);
        }

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:200'],
            'approval_enabled' => ['sometimes', 'boolean'],
            'approval_threshold' => ['nullable', 'numeric', 'min:0'],
            'required_approvals' => ['sometimes', 'integer', 'min:1'],
        ]);

        // Approval-governance fields are owner-only. Co-owners may edit
        // name/description but must not be able to change who can spend how much.
        $governanceFields = ['approval_enabled', 'approval_threshold', 'required_approvals'];
        $touchesGovernance = false;
        foreach ($governanceFields as $field) {
            if ($request->exists($field)) {
                $touchesGovernance = true;
                break;
            }
        }
        if ($touchesGovernance && $role !== 'owner') {
            return $this->fail('Only the owner can change approval governance settings', 403);
        }

        // Main wallets cannot use spend-approval governance.
        if ($wallet->type === 'main' && $request->boolean('approval_enabled')) {
            return $this->fail('Approval controls are not available on your main wallet', 422);
        }

        // A required-approvals count higher than the number of people who could ever
        // approve would make every gated spend unreachable (stuck state). Reject it.
        $effectiveApprovalEnabled = $request->exists('approval_enabled')
            ? $request->boolean('approval_enabled')
            : (bool) $wallet->approval_enabled;
        if ($request->exists('required_approvals') && $effectiveApprovalEnabled) {
            // The initiator is always excluded from approving their own request, and
            // the owner (a guaranteed approver) is a possible initiator, so at most
            // (approvers - 1) sign-offs are ever collectable. Cap the requirement
            // there so a gated spend can never become permanently unreachable.
            $maxApprovers = $wallet->eligibleApprovers()->count();
            $maxRequired = max(1, $maxApprovers - 1);
            if ((int) $data['required_approvals'] > $maxRequired) {
                return $this->fail("With {$maxApprovers} eligible approver(s), a spend can require at most {$maxRequired} approval(s) — the initiator can't approve their own request.", 422);
            }
        }

        $update = [];
        if ($request->exists('name') && $data['name'] !== null) {
            $update['name'] = $data['name'];
        }
        if ($request->exists('description')) {
            $update['description'] = $data['description'];
        }
        if ($request->exists('approval_enabled')) {
            $update['approval_enabled'] = $request->boolean('approval_enabled');
        }
        if ($request->exists('approval_threshold')) {
            $update['approval_threshold'] = $data['approval_threshold'] !== null ? $this->toKobo($data['approval_threshold']) : null;
        }
        if ($request->exists('required_approvals')) {
            $update['required_approvals'] = (int) $data['required_approvals'];
        }

        $wallet->update($update);

        return $this->ok('Wallet settings updated', ['wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true)]);
    }
}
