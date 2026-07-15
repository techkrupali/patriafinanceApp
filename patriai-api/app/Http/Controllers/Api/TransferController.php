<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\NotificationService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class TransferController extends ApiController
{
    /**
     * POST /transfers
     * {
     *   from_wallet_id, amount, pin, description?,
     *   destination: { kind: "wallet"|"user"|"bank", ... }
     * }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_wallet_id' => ['required', 'integer', 'exists:wallets,id'],
            'amount' => ['required', 'numeric', 'min:1'],
            'pin' => ['required', 'digits:4'],
            'description' => ['nullable', 'string', 'max:200'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'destination.kind' => ['required', 'in:wallet,user,bank'],
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

        try {
            $response = $this->performTransfer($user, $data);
        } catch (\Throwable $e) {
            // A failed attempt must be retryable immediately: drop the short-window
            // dedupe marker (and any idempotency lock) so a corrected retry is allowed.
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
     * Execute a validated transfer. Split out of store() so the surrounding
     * idempotency/double-submit guard never runs a second debit for a replay.
     */
    private function performTransfer(User $user, array $data): JsonResponse
    {
        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $from = Wallet::find($data['from_wallet_id']);
        if (!$from || !$from->isAccessibleBy($user)) {
            return $this->fail('Source wallet not found', 404);
        }
        if (!$from->canSpend($user)) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }

        $amountKobo = $this->toKobo($data['amount']);
        $service = WalletService::make();
        $dest = $data['destination'];
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // Fee only applies to external (bank) transfers; wallet/user moves are free.
        $spendKobo = $amountKobo + ($dest['kind'] === 'bank' ? $feeKobo : 0);

        // Per-tier daily transfer limit (money leaving the wallet).
        if ($err = $this->dailyTransferLimitError($user, $amountKobo)) {
            return $err;
        }

        // Cannot commit more than is genuinely available: pending approvals and
        // (for project wallets) milestone reservations are subtracted here.
        if ($spendKobo > $from->availableToSpend()) {
            return $this->fail('Amount exceeds available balance (funds are reserved for pending approvals/milestones).', 422);
        }

        // Only route to approval when at least one eligible approver exists; otherwise
        // the initiator is the sole controller, so the spend executes directly.
        $needsApproval = $from->approvalRequiredFor($amountKobo) && $from->eligibleApprovers($user->id)->isNotEmpty();

        switch ($dest['kind']) {
            case 'wallet':
                $to = Wallet::find($dest['wallet_id']);
                if (!$to || !$to->isAccessibleBy($user)) {
                    return $this->fail('Destination wallet not found', 404);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_wallet', $amountKobo, 0, $data['description'] ?? null, [
                        'wallet_id' => $to->id,
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets($from, $to, $amountKobo, $user, $data['description'] ?? null);
                break;

            case 'user':
                $recipient = str_contains($dest['identifier'], '@')
                    ? User::where('email', strtolower($dest['identifier']))->first()
                    : User::where('phone', $dest['identifier'])->first();

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
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets(
                    $from,
                    $to,
                    $amountKobo,
                    $user,
                    $data['description'] ?? "Transfer to {$recipient->fullName()}",
                );
                $result['recipient'] = ['name' => $recipient->fullName(), 'email' => $recipient->email];

                NotificationService::make()->push(
                    $recipient,
                    'transfer_received',
                    'You received ₦' . number_format($amountKobo / 100, 2, '.', ''),
                    "{$user->fullName()} sent you ₦" . number_format($amountKobo / 100, 2, '.', '') . '.',
                    [
                        'amount' => number_format($amountKobo / 100, 2, '.', ''),
                        'reference' => $result['reference'],
                        'from' => $user->fullName(),
                    ],
                );
                break;

            default: // bank
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_bank', $amountKobo, $feeKobo, $data['description'] ?? null, [
                        'bank_code' => $dest['bank_code'],
                        'account_number' => $dest['account_number'],
                        'account_name' => $dest['account_name'],
                        'bank_name' => $dest['bank_name'],
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $txn = $service->withdrawToBank(
                    $from,
                    $user,
                    $amountKobo,
                    $dest['bank_code'],
                    $dest['account_number'],
                    $dest['account_name'],
                    $dest['bank_name'],
                    $data['description'] ?? null,
                );
                $result = ['reference' => $txn->reference, 'balance_after' => $txn->balance_after];
        }

        $from->refresh();

        return $this->ok('Transfer successful', [
            'reference' => $result['reference'],
            'balance' => $from->balanceNaira(),
            'recipient' => $result['recipient'] ?? null,
        ]);
    }

    private function pendingApproval(ApprovalRequest $req, User $user): JsonResponse
    {
        return $this->ok('Transfer submitted for approval', [
            'pending_approval' => true,
            'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
        ]);
    }
}
