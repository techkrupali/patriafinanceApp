<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\MoneyRequestService;
use App\Services\NotificationService;
use App\Services\SpendRules;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

class TransferController extends ApiController
{
    /**
     * POST /transfers
     * {
     *   from_wallet_id, amount, pin, description?,
     *   destination: { kind: "wallet"|"user"|"bank"|"group"|"request", ... }
     * }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'amount' => ['required', 'numeric', 'min:1'],
            'pin' => ['required', self::TXN_PIN],
            'description' => ['nullable', 'string', 'max:200'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            // Spending wallets: what the payment is for (SPD-03 category).
            'budget_category_id' => ['nullable', 'integer'],
            'destination.kind' => ['required', 'in:wallet,user,bank,group,request'],
            // REQ-03 paying someone's request (all or part) into the wallet they chose.
            'destination.code' => ['required_if:destination.kind,request', 'nullable', 'string', 'max:12'],
            // SND-03 groups ("Our churches · split 50/50"): one payment shared out.
            'destination.group_id' => ['required_if:destination.kind,group', 'nullable', 'integer'],
            'destination.wallet_id' => ['required_if:destination.kind,wallet', 'nullable', 'integer'],
            'destination.identifier' => ['required_if:destination.kind,user', 'nullable', 'string'],
            'destination.bank_code' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.account_number' => ['required_if:destination.kind,bank', 'nullable', 'digits:10'],
            'destination.account_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.bank_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
        ]);

        $user = $request->user();

        // --- Idempotency / double-submit protection -------------------------------
        // 1. Explicit client key: replay the original response for ~5 minutes and
        //    lock out concurrent duplicates carrying the same (user, key).
        $idempotencyKey = $data['idempotency_key'] ?? null;
        $cacheKey = $idempotencyKey !== null
            ? 'transfer:idem:' . $user->id . ':' . sha1($idempotencyKey)
            : null;

        if ($cacheKey !== null) {
            if ($cached = Cache::get($cacheKey)) {
                return response()->json($cached['body'], $cached['code']);
            }
            if (!Cache::add($cacheKey . ':lock', 1, now()->addSeconds(30))) {
                return $this->fail('A transfer with this idempotency key is already being processed.', 409);
            }
        }

        // 2. Even without a key: reject a byte-identical transfer intent from the
        //    same user within ~5 seconds (accidental double tap / slow-network
        //    retry). Short enough to still allow an intentional identical repeat
        //    payment moments later. Cache::add is atomic, so of two concurrent
        //    taps exactly one proceeds.
        $fingerprint = 'transfer:dedupe:' . $user->id . ':' . sha1(json_encode([
            'from' => $data['from_wallet_id'],
            'amount' => $data['amount'],
            'destination' => $data['destination'],
        ]));
        if (!Cache::add($fingerprint, 1, now()->addSeconds(5))) {
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            return $this->fail('Duplicate transfer ignored — this looks like a double submission. Please wait a moment before retrying.', 409);
        }

        $startedAt = now();

        try {
            $response = $this->performTransfer($user, $data);
        } catch (\Throwable $e) {
            // Ambiguous outcome: a bank payout that timed out on the rails is parked
            // by WalletService as pending/needs_reconciliation — the bank may still
            // execute it. A retry must NOT run a second payout, so KEEP the dedupe
            // marker and make the idempotency key replay a "processing" answer until
            // reconciliation settles the original.
            if ($parked = $this->unresolvedWithdrawal($user, $data, $startedAt)) {
                if ($cacheKey !== null) {
                    Cache::put($cacheKey, [
                        'body' => [
                            'status' => false,
                            'message' => 'Transfer is processing — do not retry. It will complete shortly or be reversed automatically.',
                            'errors' => ['reference' => $parked->reference],
                        ],
                        'code' => 409,
                    ], now()->addMinutes(5));
                    Cache::forget($cacheKey . ':lock');
                }
                // SND-11 "Banks sometimes take a moment. You can leave this screen."
                return response()->json(['status' => false, 'message' => 'Your payment is processing. It will complete shortly or come back to you automatically.', 'data' => ['code' => 'processing', 'reference' => $parked->reference]], 422);
            }

            // Definitive failure (validation, provider rejection with refund): must be
            // retryable immediately — drop the short-window dedupe marker (and any
            // idempotency lock) so a corrected retry is allowed.
            Cache::forget($fingerprint);
            if ($cacheKey !== null) {
                Cache::forget($cacheKey . ':lock');
            }
            // SND-13 "This payment didn't go through … your money is back".
            if ($e instanceof ValidationException && isset($e->errors()['banking'])) {
                $failed = Transaction::where('wallet_id', $data['from_wallet_id'])->where('user_id', $user->id)->where('type', 'withdrawal')
                    ->where('status', 'failed')->where('created_at', '>=', $startedAt)->latest('id')->first();

                return response()->json(['status' => false, 'message' => "The bank didn't accept this payment. Your money is back.", 'data' => ['code' => 'bank_failed', 'reference' => $failed?->reference, 'reason' => preg_replace('/^Bank transfer failed: /', '', $e->errors()['banking'][0])]], 422);
            }
            throw $e;
        }

        if ($cacheKey !== null) {
            Cache::forget($cacheKey . ':lock');
        }

        if ($response->getStatusCode() >= 300) {
            // Non-success (e.g. 404/403/422): allow an immediate corrected retry.
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
     * SND-14 a scheduled payment's date came round: the same transfer, with the
     * PIN (and two-step) already given when it was set up.
     */
    public function runScheduled(User $user, array $data): JsonResponse
    {
        return $this->performTransfer($user, $data, scheduled: true);
    }

    /**
     * Execute a validated transfer. Split out of store() so the surrounding
     * idempotency/double-submit guard never runs a second debit for a replay.
     */
    private function performTransfer(User $user, array $data, bool $scheduled = false): JsonResponse
    {
        if (!$scheduled) {
            app(\App\Services\PinService::class)->verify($user, $data['pin']);
        }

        $from = Wallet::find($data['from_wallet_id']);
        if (!$from || !$from->isAccessibleBy($user)) {
            return $this->fail('Source wallet not found', 404);
        }
        if (!$from->canSpend($user)) {
            return $this->cannotSpendError($user);
        }
        // EMG-03 "Pay the hospital directly": money goes to the bill, not a person.
        if ($data['destination']['kind'] !== 'bank' && $from->paysBillsDirectly()) {
            return $this->fail('This emergency fund pays bills directly. Send the money to the hospital or clinic\'s bank account.', 422);
        }

        $amountKobo = $this->toKobo($data['amount']);
        $service = WalletService::make();
        $dest = $data['destination'];
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // A group: its own saved accounts, each with its share (BEN-04).
        $group = null;
        if ($dest['kind'] === 'group') {
            $group = \App\Models\SavedAccountGroup::with('accounts.payee')->where('user_id', $user->id)->find((int) $dest['group_id']);
            if (!$group || $group->accounts->isEmpty()) {
                return $this->fail('Group not found', 404);
            }
            if ($group->split === 'fixed') {
                $amountKobo = array_sum($group->shares(0));
            }
        }

        // A money request: paid into the wallet it names, never more than is left.
        $moneyRequest = null;
        if ($dest['kind'] === 'request') {
            $moneyRequest = \App\Models\MoneyRequest::with(['requester', 'wallet'])->where('code', strtoupper((string) $dest['code']))->first();
            if (!$moneyRequest || ($moneyRequest->payer_user_id !== null && $moneyRequest->payer_user_id !== $user->id && $moneyRequest->requester_id !== $user->id)) {
                return $this->fail('Request not found', 404);
            }
            MoneyRequestService::make()->assertPayable($moneyRequest, $user);
            $amountKobo = min($amountKobo, $moneyRequest->left());
        }

        // Fee only applies to external (bank) transfers; wallet/user moves are free.
        $bankPayees = $group ? $group->accounts->filter(fn ($a) => !$a->isPatriai())->count() : ($dest['kind'] === 'bank' ? 1 : 0);
        $spendKobo = $amountKobo + $bankPayees * $feeKobo;

        // Limits, holds and two-step (ME-11/18, ACC-05/06, ME-08), fee-inclusive so it
        // matches how the day's total adds up. Moving between your own wallets is free of
        // limits; paying someone checks how much their account may hold.
        $ownTarget = $dest['kind'] === 'wallet' && (int) Wallet::whereKey((int) ($dest['wallet_id'] ?? 0))->value('user_id') === $user->id;
        $receiver = match ($dest['kind']) {
            'user' => $this->findPayee((string) $dest['identifier']),
            'request' => $moneyRequest->requester,
            default => null,
        };
        if ($err = $this->spendGuardError($user, $spendKobo, request(), internal: $ownTarget && $from->user_id === $user->id, recipient: $receiver, scheduled: $scheduled)) {
            return $err;
        }

        // Cannot commit more than is genuinely available: pending approvals and
        // (for project wallets) milestone reservations are subtracted here.
        if ($spendKobo > $from->availableToSpend()) {
            return $this->fail('Amount exceeds available balance (funds are reserved for pending approvals/milestones).', 422);
        }

        // The wallet's own rules: a spending budget (may stop it, or need an owner's
        // yes when it goes over a limit) and the early-break fee on locked savings.
        $rules = SpendRules::make();
        $plan = $rules->plan($from, $user, $amountKobo, isset($data['budget_category_id']) ? (int) $data['budget_category_id'] : null, to: match ($dest['kind']) {
            'wallet' => ['kind' => 'wallet', 'wallet_id' => (int) $dest['wallet_id']],
            'user', 'request' => ['kind' => 'user', 'user_id' => $receiver?->id],
            'group' => ['kind' => 'group', 'group_id' => $group?->id],
            default => ['kind' => 'bank', 'account_number' => $dest['account_number'] ?? null],
        });
        $extra = array_filter(['budget_category_id' => $plan['category_id'], 'over_limit' => $plan['over']]);

        // Only route to approval when at least one eligible approver exists; otherwise
        // the initiator is the sole controller, so the spend executes directly.
        $needsApproval = ($from->approvalRequiredFor($amountKobo) || $plan['over'] !== null) && $from->eligibleApprovers($user->id)->isNotEmpty();

        switch ($dest['kind']) {
            case 'wallet':
                $to = Wallet::find($dest['wallet_id']);
                // WPV-05 "Add to the bike": a relative on a child's wallet may add to the child's goal.
                if (!$to || !($to->isAccessibleBy($user) || \App\Services\ChildAppService::make()->canGiftInto($to, $user))) {
                    return $this->fail('Destination wallet not found', 404);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_wallet', $amountKobo, 0, $data['description'] ?? null, [
                        'wallet_id' => $to->id,
                        'description' => $data['description'] ?? null,
                    ] + $extra);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets($from, $to, $plan['net'], $user, $data['description'] ?? null);
                // WPV-05 "Kamsi gets a note saying it's from Aunty Ada".
                \App\Services\ChildAppService::make()->gifted($to, $user, $plan['net']);
                break;

            case 'user':
                $recipient = $receiver;

                if (!$recipient || $recipient->id === $user->id) {
                    return $this->fail('Recipient not found', 404);
                }
                $to = $recipient->mainWallet();
                if (!$to) {
                    return $this->fail('Recipient has no active wallet', 422);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_user', $amountKobo, 0, $data['description'] ?? null, [
                        'identifier' => $dest['identifier'],
                        'user_id' => $recipient->id,
                        'description' => $data['description'] ?? null,
                    ] + $extra);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets(
                    $from,
                    $to,
                    $plan['net'],
                    $user,
                    $data['description'] ?? "Transfer to {$recipient->fullName()}",
                );
                $result['recipient'] = ['name' => $recipient->fullName(), 'email' => $recipient->email];

                NotificationService::make()->push(
                    $recipient,
                    'transfer_received',
                    'You received ₦' . number_format($plan['net'] / 100, $plan['net'] % 100 ? 2 : 0),
                    "{$user->fullName()} sent you ₦" . number_format($plan['net'] / 100, $plan['net'] % 100 ? 2 : 0) . '.',
                    [
                        'amount' => number_format($plan['net'] / 100, 2, '.', ''),
                        'reference' => $result['reference'],
                        'from' => $user->fullName(),
                    ],
                );
                break;

            case 'group':
                if (!$from->canWithdraw($user)) {
                    return $this->fail('You do not have permission to pay out of this wallet', 403);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_group', $amountKobo, $bankPayees * $feeKobo, $data['description'] ?? null, [
                        'group_id' => $group->id,
                        'to_name' => $group->name,
                        'description' => $data['description'] ?? null,
                    ] + $extra);

                    return $this->pendingApproval($req, $user);
                }
                $paid = $service->payGroup($from, $user, $group, $plan['net'], $data['description'] ?? $group->name);
                $result = ['reference' => $paid[0]['reference'] ?? null, 'group' => $paid];
                break;

            case 'request':
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_request', $amountKobo, 0, $data['description'] ?? null, [
                        'code' => $moneyRequest->code,
                        'to_name' => $moneyRequest->requester->fullName(),
                        'description' => $data['description'] ?? null,
                    ] + $extra);

                    return $this->pendingApproval($req, $user);
                }
                $result = MoneyRequestService::make()->settle($moneyRequest, $user, $from, $plan['net']);
                $result['recipient'] = ['name' => $moneyRequest->requester->fullName(), 'email' => $moneyRequest->requester->email];
                break;

            default: // bank
                // Additive granular gate on external payouts: an explicit
                // permissions[withdraw]=false blocks a member who otherwise holds a
                // spend grant. Never loosens canSpend (owner/co_owner unchanged).
                if (!$from->canWithdraw($user)) {
                    return $this->fail('You do not have permission to withdraw from this wallet', 403);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_bank', $amountKobo, $feeKobo, $data['description'] ?? null, [
                        'bank_code' => $dest['bank_code'],
                        'account_number' => $dest['account_number'],
                        'account_name' => $dest['account_name'],
                        'bank_name' => $dest['bank_name'],
                        'description' => $data['description'] ?? null,
                    ] + $extra);

                    return $this->pendingApproval($req, $user);
                }
                $txn = $service->withdrawToBank(
                    $from,
                    $user,
                    $plan['net'],
                    $dest['bank_code'],
                    $dest['account_number'],
                    $dest['account_name'],
                    $dest['bank_name'],
                    $data['description'] ?? null,
                );
                $result = ['reference' => $txn->reference, 'balance_after' => $txn->balance_after];
        }

        $donation = $rules->settle($from, $user, $result['reference'], $plan);
        $from->refresh();

        return $this->ok('Transfer successful', [
            'reference' => $result['reference'],
            'balance' => $from->balanceNaira(),
            'recipient' => $result['recipient'] ?? null,
            'group' => $result['group'] ?? null,
            // BRK-04/05: taking locked savings out early kept a fee, half to the charity picked.
            'early_break' => ($plan['fee'] ?? 0) > 0 ? [
                'fee' => number_format($plan['fee'] / 100, 2, '.', ''),
                'received' => number_format($plan['net'] / 100, 2, '.', ''),
                'charity' => $donation?->organisation?->name,
                'charity_amount' => $donation ? number_format($donation->amount / 100, 2, '.', '') : null,
                'receipt_no' => $donation?->receipt_no,
            ] : null,
        ]);
    }

    /**
     * Detect the ambiguous-outcome bank payout: on a rails timeout WalletService
     * does NOT refund — it parks the debit as pending with needs_reconciliation
     * and throws. Returns that transaction when THIS request created one (only
     * the timeout path leaves one behind), or null for definitive failures where
     * nothing is in flight and an immediate retry is safe.
     */
    private function unresolvedWithdrawal(User $user, array $data, Carbon $startedAt): ?Transaction
    {
        if (($data['destination']['kind'] ?? null) !== 'bank') {
            return null;
        }

        return Transaction::where('wallet_id', $data['from_wallet_id'])
            ->where('user_id', $user->id)
            ->where('type', 'withdrawal')
            ->where('amount', $this->toKobo($data['amount']))
            ->where('status', 'pending')
            ->where('meta->needs_reconciliation', true)
            ->where('created_at', '>=', $startedAt)
            ->latest('id')
            ->first();
    }

    private function pendingApproval(ApprovalRequest $req, User $user): JsonResponse
    {
        return $this->ok('Transfer submitted for approval', [
            'pending_approval' => true,
            'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
        ]);
    }
}
