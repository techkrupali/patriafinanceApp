<?php

namespace App\Http\Controllers\Api;

use App\Models\EmergencyBeneficiary;
use App\Models\EmergencySetting;
use App\Models\SavingsPlan;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\EmergencyService;
use App\Services\KycService;
use App\Services\SavingsService;
use App\Services\WalletService;
use App\Services\WalletSetupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

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

    /**
     * POST /wallets — guided creation.
     * { type, name, description?, target_amount?, target_date?, purpose?,
     *   initial_deposit?, source_wallet_id?, monthly_amount?, monthly_day?,
     *   emergency?, milestones?, contributors?, savings_plan?, draft_id? }
     * `emergency` (emergency wallets only) carries the Step 2 access rules; see
     * EmergencyService::configure. milestones/contributors/savings_plan are the
     * savings-goal setup (savings + goal wallets); see SavingsService::configure.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:' . implode(',', self::CREATABLE_TYPES)],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:200'],
            'target_amount' => ['nullable', 'numeric', 'min:0'],
            'purpose' => ['nullable', 'string', 'max:40'],
            'initial_deposit' => ['nullable', 'numeric', 'min:0'],
            'source_wallet_id' => ['nullable', 'integer'],
            'monthly_amount' => ['nullable', 'numeric', 'min:0'],
            'monthly_day' => ['nullable', 'integer', 'between:1,28'],
            'emergency' => ['nullable', 'array'],
            'emergency.purpose' => ['required_with:emergency', 'in:' . implode(',', EmergencySetting::PURPOSES)],
            'emergency.dual_approval' => ['sometimes', 'boolean'],
            'emergency.approver_user_id' => ['nullable', 'integer'],
            'emergency.unlock_on_document' => ['sometimes', 'boolean'],
            'emergency.manual_unlock' => ['sometimes', 'boolean'],
            'emergency.unlock_reason' => ['nullable', 'string', 'max:150'],
            'emergency.emergency_pin' => ['nullable', 'digits:4'],
            'emergency.override_national_crisis' => ['sometimes', 'boolean'],
            'emergency.override_high_balance' => ['sometimes', 'boolean'],
            'emergency.beneficiary_note' => ['nullable', 'string', 'max:1000'],
            'emergency.beneficiaries' => ['sometimes', 'array', 'max:3'],
            'emergency.beneficiaries.*.user_id' => ['required', 'integer'],
            'emergency.beneficiaries.*.relationship' => ['nullable', 'string', 'max:40'],
            'emergency.beneficiaries.*.role' => ['sometimes', 'in:' . implode(',', EmergencyBeneficiary::ROLES)],
            'emergency.beneficiaries.*.withdrawal_limit' => ['nullable', 'numeric', 'min:0'],
            'emergency.beneficiaries.*.access_type' => ['sometimes', 'in:' . implode(',', EmergencyBeneficiary::ACCESS_TYPES)],
            // Savings goals.
            'target_date' => ['nullable', 'date', 'after:today'],
            'milestones' => ['sometimes', 'array', 'max:' . SavingsService::MAX_MILESTONES],
            'milestones.*.title' => ['required', 'string', 'max:100'],
            'milestones.*.amount' => ['required', 'numeric', 'min:1'],
            'milestones.*.due_date' => ['nullable', 'date'],
            'contributors' => ['sometimes', 'array', 'max:' . SavingsService::MAX_CONTRIBUTORS],
            'contributors.*.user_id' => ['required', 'integer'],
            'contributors.*.can_approve' => ['sometimes', 'boolean'],
            'contributors.*.permissions' => ['sometimes', 'array'],
            'contributors.*.permissions.view' => ['sometimes', 'boolean'],
            'contributors.*.permissions.fund' => ['sometimes', 'boolean'],
            'contributors.*.permissions.request' => ['sometimes', 'boolean'],
            'contributors.*.permissions.withdraw' => ['sometimes', 'boolean'],
            'savings_plan' => ['nullable', 'array'],
            'savings_plan.amount' => ['required_with:savings_plan', 'numeric', 'min:1'],
            'savings_plan.frequency' => ['required_with:savings_plan', 'in:' . implode(',', SavingsPlan::FREQUENCIES)],
            'savings_plan.day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'savings_plan.day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'savings_plan.auto_save' => ['sometimes', 'boolean'],
            'savings_plan.allow_contributor_edit' => ['sometimes', 'boolean'],
            'draft_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();

        // KYC tier wallet-count guard. Caps are generous (5/10/25) so existing
        // users are unaffected — verifying a higher tier unlocks more wallets.
        $maxWallets = KycService::make()->limits((int) $user->kyc_tier)['max_wallets'];
        if ($user->wallets()->count() >= $maxWallets) {
            return $this->fail('Wallet limit reached for your verification tier. Verify a higher KYC tier to create more wallets.', 422);
        }

        if (!empty($data['emergency']) && $data['type'] !== 'emergency') {
            return $this->fail('Emergency access rules only apply to emergency wallets', 422);
        }
        $savingsFields = ['milestones', 'contributors', 'savings_plan'];
        if (!in_array($data['type'], SavingsService::TYPES, true) && array_filter(array_intersect_key($data, array_flip($savingsFields)))) {
            return $this->fail('Milestones, contributors and savings plans are for savings and goal wallets', 422);
        }

        // Naira over the wire, kobo from here on. Zero means "not set".
        $kobo = fn ($naira) => ($naira === null || (float) $naira <= 0) ? null : $this->toKobo((string) $naira);

        $data['target_amount'] = $kobo($data['target_amount'] ?? null);
        $data['initial_deposit'] = $kobo($data['initial_deposit'] ?? null);
        $data['monthly_amount'] = $kobo($data['monthly_amount'] ?? null);
        foreach ($data['milestones'] ?? [] as $i => $m) {
            $data['milestones'][$i]['amount'] = $kobo($m['amount']);
        }
        if (!empty($data['savings_plan'])) {
            $data['savings_plan']['amount'] = $kobo($data['savings_plan']['amount'] ?? null);
        }
        if (!empty($data['emergency']['beneficiaries'])) {
            foreach ($data['emergency']['beneficiaries'] as $i => $b) {
                $data['emergency']['beneficiaries'][$i]['withdrawal_limit'] = $kobo($b['withdrawal_limit'] ?? null);
            }
        }

        $wallet = WalletSetupService::make()->create($user, $data);

        return $this->ok('Wallet created', ['wallet' => $this->serializeWallet($wallet)], 201);
    }

    // GET /wallets/{wallet}
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        // WalletPolicy::view === Wallet::isAccessibleBy — same rule, one source of truth.
        if ($request->user()->cannot('view', $wallet)) {
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
            'my_can_request' => $wallet->canRequest($user),
            'approval' => [
                'enabled' => (bool) $wallet->approval_enabled,
                'threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
                'required_approvals' => (int) $wallet->required_approvals,
            ],
            'held_amount' => number_format($wallet->heldAmount() / 100, 2, '.', ''),
            'pending_approvals' => $wallet->approvalRequests()->where('status', 'pending')->count(),
            // Emergency wallets only: lock state + the viewer's emergency role.
            'emergency' => EmergencyService::make()->summary($wallet, $user),
            // Savings/goal wallets with a plan: the rule every saver follows.
            'savings' => SavingsService::make()->invitationSummary($wallet),
            'recent_transactions' => $wallet->transactions()->latest()->limit(10)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
        ]);
    }

    // GET /wallets/{wallet}/transactions
    public function transactions(Request $request, Wallet $wallet): JsonResponse
    {
        // WalletPolicy::view === Wallet::isAccessibleBy — same rule, one source of truth.
        if ($request->user()->cannot('view', $wallet)) {
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

    // POST /wallets/{wallet}/withdraw  { amount, bank_code, account_number, account_name, pin, description?, idempotency_key? }
    public function withdraw(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if (!$wallet->canSpend($request->user())) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }
        // Additive granular gate: an explicit permissions[withdraw]=false blocks a
        // member who otherwise holds a spend grant. Never loosens canSpend, so
        // owner/co_owner behaviour is unchanged.
        if (!$wallet->canWithdraw($request->user())) {
            return $this->fail('You do not have permission to withdraw from this wallet', 403);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'bank_code' => ['required', 'string'],
            'account_number' => ['required', 'digits:10'],
            'account_name' => ['required', 'string', 'max:150'],
            'bank_name' => ['required', 'string', 'max:150'],
            'pin' => ['required', 'digits:4'],
            'description' => ['nullable', 'string', 'max:200'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ]);

        $user = $request->user();

        // --- Idempotency / double-submit protection -------------------------------
        // 1. Explicit client key: replay the original response for ~5 minutes and
        //    lock out concurrent duplicates carrying the same (user, key).
        $idempotencyKey = $data['idempotency_key'] ?? null;
        $cacheKey = $idempotencyKey !== null
            ? 'withdraw:idem:' . $user->id . ':' . sha1($idempotencyKey)
            : null;

        if ($cacheKey !== null) {
            if ($cached = Cache::get($cacheKey)) {
                return response()->json($cached['body'], $cached['code']);
            }
            if (!Cache::add($cacheKey . ':lock', 1, now()->addSeconds(30))) {
                return $this->fail('A withdrawal with this idempotency key is already being processed.', 409);
            }
        }

        // 2. Even without a key: reject a byte-identical withdrawal intent from the
        //    same user within ~5 seconds (accidental double tap / slow-network
        //    retry). Short enough to still allow an intentional identical repeat
        //    withdrawal moments later. Cache::add is atomic, so of two concurrent
        //    taps exactly one proceeds.
        $fingerprint = 'withdraw:dedupe:' . $user->id . ':' . sha1(json_encode([
            'wallet' => $wallet->id,
            'amount' => $data['amount'],
            'bank_code' => $data['bank_code'],
            'account_number' => $data['account_number'],
        ]));
        if (!Cache::add($fingerprint, 1, now()->addSeconds(5))) {
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            return $this->fail('Duplicate withdrawal ignored — this looks like a double submission. Please wait a moment before retrying.', 409);
        }

        try {
            $response = $this->performWithdrawal($user, $wallet, $data);
        } catch (\Throwable $e) {
            if ($this->isUnknownBankingOutcome($e)) {
                // Banking timeout/network failure: the payout outcome is UNKNOWN (the
                // bank may have executed it), so a retry could fire a second real
                // payout. KEEP the dedupe marker and cache a do-not-retry response
                // under the key so replays are answered without touching the rails.
                if ($cacheKey !== null) {
                    Cache::put($cacheKey, [
                        'body' => ['status' => false, 'message' => 'Your withdrawal is processing — do not retry. It will complete shortly or be reversed automatically.'],
                        'code' => 409,
                    ], now()->addMinutes(5));
                    Cache::forget($cacheKey . ':lock');
                }
                throw $e;
            }
            // Any other failed attempt must be retryable immediately: drop the
            // short-window dedupe marker (and any idempotency lock) so a corrected
            // retry is allowed.
            Cache::forget($fingerprint);
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            throw $e;
        }

        if ($cacheKey !== null) {
            Cache::forget($cacheKey . ':lock');
        }

        if ($response->getStatusCode() >= 300) {
            // Non-success (e.g. 422): allow an immediate corrected retry.
            Cache::forget($fingerprint);
        } elseif ($cacheKey !== null) {
            // Store the successful outcome for idempotent replay within the window.
            Cache::put($cacheKey, [
                'body' => $response->getData(true),
                'code' => $response->getStatusCode(),
            ], now()->addMinutes(5));
        }

        return $response;
    }

    /**
     * Execute a validated withdrawal. Split out of withdraw() so the surrounding
     * idempotency/double-submit guard never runs a second payout for a replay.
     */
    private function performWithdrawal(User $user, Wallet $wallet, array $data): JsonResponse
    {
        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $amountKobo = $this->toKobo($data['amount']);
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // Per-tier daily withdrawal/transfer limit. Fee-inclusive, because
        // todaysOutgoingKobo() accumulates amount + fee for withdrawals — checking
        // the bare amount here would let the fee leak past the daily cap.
        if ($err = $this->dailyTransferLimitError($user, $amountKobo + $feeKobo)) {
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

    /**
     * True for the unknown-outcome banking failure: WalletService caught a
     * ConnectionException mid-payout (the bank may have executed it) and surfaced
     * it as a ValidationException whose 'banking' message says the withdrawal is
     * processing. Message-prefix match is deliberate — the definitive-rejection
     * path uses the same 'banking' key with a "Bank transfer failed" message.
     */
    private function isUnknownBankingOutcome(\Throwable $e): bool
    {
        return $e instanceof ValidationException
            && str_starts_with($e->errors()['banking'][0] ?? '', 'Your withdrawal is processing');
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

    // POST /wallets/{wallet}/archive — reversible soft delete (status=closed), owner only
    public function archive(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardDeletable($request, $wallet)) {
            return $err;
        }
        if ($wallet->status === 'closed') {
            return $this->fail('This wallet is already archived', 422);
        }
        $wallet->update(['status' => 'closed']);

        return $this->ok('Wallet archived', ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // POST /wallets/{wallet}/unarchive — restore an archived wallet, owner only
    public function unarchive(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id) {
            return $this->fail('Wallet not found', 404);
        }
        if ($wallet->status !== 'closed') {
            return $this->fail('This wallet is not archived', 422);
        }
        $wallet->update(['status' => 'active']);

        return $this->ok('Wallet restored', ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // DELETE /wallets/{wallet} — permanent delete (archived + empty only), owner only
    public function destroy(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardDeletable($request, $wallet)) {
            return $err;
        }
        if ($wallet->status !== 'closed') {
            return $this->fail('Archive the wallet first, then delete it permanently', 422);
        }
        $wallet->delete(); // cascades members, transactions and invitations

        return $this->ok('Wallet deleted permanently');
    }

    /**
     * Shared safety guards for archive / permanent-delete. Returns a fail
     * response, or null when the wallet may be removed. Money-safety first: the
     * main wallet is protected, the wallet must be empty, and it must have no
     * other members or an attached project.
     */
    private function guardDeletable(Request $request, Wallet $wallet): ?JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id) {
            return $this->fail('Wallet not found', 404);
        }
        if ($wallet->type === 'main') {
            return $this->fail('Your main wallet cannot be deleted', 422);
        }
        if ((int) $wallet->balance !== 0) {
            return $this->fail('Move the balance out first — the wallet must be empty to delete it', 422);
        }
        $otherMembers = $wallet->members()
            ->where('status', 'active')
            ->where('user_id', '!=', $wallet->user_id)
            ->exists();
        if ($otherMembers) {
            return $this->fail('Remove the other members before deleting this wallet', 422);
        }
        if (\App\Models\Project::where('wallet_id', $wallet->id)->exists()) {
            return $this->fail("This wallet belongs to a project and can't be deleted here", 422);
        }

        return null;
    }
}
