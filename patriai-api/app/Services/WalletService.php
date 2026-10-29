<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Wallet ledger engine. All balance mutations happen inside DB transactions
 * with row-level locks (SELECT ... FOR UPDATE) — PostgreSQL guarantees
 * financial consistency under concurrency.
 */
class WalletService
{
    public function __construct(private readonly MatrixBankingService $banking) {}

    public static function make(): self
    {
        return new self(MatrixBankingService::make());
    }

    /**
     * Create a wallet and register its funding virtual account on the banking rails.
     * $opts may carry 'description' (string), 'target_amount' (kobo int),
     * 'target_date' (Y-m-d) and 'meta' (array, e.g. the type-specific purpose
     * chosen during setup).
     */
    public function createWallet(User $user, string $type, string $name, array $opts = []): Wallet
    {
        if (!in_array($type, Wallet::TYPES, true)) {
            throw ValidationException::withMessages(['type' => 'Invalid wallet type']);
        }

        if ($type === 'main') {
            if ($user->wallets()->where('type', 'main')->exists()) {
                throw ValidationException::withMessages(['type' => 'Main wallet already exists']);
            }
        } else {
            // Enforce the KYC wallet-count limit on EVERY non-main creation path
            // (direct wallets and project escrow wallets alike), before any insert —
            // so a Project Wallet can't bypass the cap and no partial rows are left.
            $max = KycService::make()->limits((int) $user->kyc_tier)['max_wallets'];
            if ($user->wallets()->count() >= $max) {
                throw ValidationException::withMessages([
                    'wallet' => "Wallet limit reached for your verification tier ({$max}). Verify a higher KYC tier to create more wallets.",
                ]);
            }
        }

        $wallet = Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => $name,
            'description' => $opts['description'] ?? null,
            'target_amount' => $opts['target_amount'] ?? null,
            'target_date' => $opts['target_date'] ?? null,
            'meta' => $opts['meta'] ?? null,
            'balance' => 0,
        ]);

        WalletMember::create([
            'wallet_id' => $wallet->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'status' => 'active',
        ]);

        if ($type !== 'main') {
            $target = $opts['target_amount'] ?? null;
            AuditService::make()->log($wallet, $user, 'wallet_created', 'Created the wallet', [
                'summary' => 'created the wallet',
                'detail' => $target ? 'Goal ₦' . number_format($target / 100) . (!empty($opts['target_date']) ? ' by ' . \Carbon\Carbon::parse($opts['target_date'])->format('j M Y') : '') : ucfirst($type) . ' wallet',
                'type' => $type,
            ]);
        }

        // Funding virtual account on the banking provider. Non-fatal if the
        // provider is briefly unavailable — retried on first funding-details call.
        // A joint wallet gets its account once the partner accepts (JNT WCR-07).
        if ($type !== 'joint') {
            $this->ensureVirtualAccount($wallet);
        }

        return $wallet->refresh();
    }

    public function ensureVirtualAccount(Wallet $wallet): void
    {
        if ($wallet->virtual_account) {
            return;
        }

        $accountNumber = $this->generateAccountNumber();
        $accountName = 'PATRIAI/' . strtoupper($wallet->owner->fullName() ?: 'WALLET') . '/' . strtoupper($wallet->type);

        try {
            $this->banking->createVirtualAccount($accountNumber, $accountName);
            $wallet->update([
                'virtual_account' => $accountNumber,
                'virtual_account_bank' => 'Assetmatrix MFB',
            ]);
        } catch (\Throwable $e) {
            Log::warning("Virtual account creation deferred for wallet {$wallet->id}: {$e->getMessage()}");
        }
    }

    private function generateAccountNumber(): string
    {
        do {
            $number = '90' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        } while (Wallet::where('virtual_account', $number)->exists());

        return $number;
    }

    /** Credit a wallet (deposit webhook). Idempotent by sessionId. */
    public function credit(Wallet $wallet, int $amountKobo, string $type, array $counterparty = [], ?string $sessionId = null, ?string $description = null, ?int $userId = null, ?string $bankingReference = null): Transaction
    {
        try {
            return DB::transaction(function () use ($wallet, $amountKobo, $type, $counterparty, $sessionId, $description, $userId, $bankingReference) {
                if ($sessionId && Transaction::where('session_id', $sessionId)->exists()) {
                    return Transaction::where('session_id', $sessionId)->first();
                }

                $locked = Wallet::whereKey($wallet->id)->lockForUpdate()->first();
                $locked->balance += $amountKobo;
                $locked->save();

                return Transaction::create([
                    'reference' => Transaction::generateReference(),
                    'wallet_id' => $locked->id,
                    'user_id' => $userId,
                    'type' => $type,
                    'direction' => 'credit',
                    'amount' => $amountKobo,
                    'balance_after' => $locked->balance,
                    'status' => 'successful',
                    'description' => $description,
                    'counterparty' => $counterparty ?: null,
                    'session_id' => $sessionId,
                    'banking_reference' => $bankingReference,
                ]);
            });
        } catch (QueryException $e) {
            // Concurrent duplicate delivery: the unique session_id lost the race.
            // Return the winning row instead of surfacing a 500 (keeps webhooks idempotent).
            if ($sessionId && ($existing = Transaction::where('session_id', $sessionId)->first())) {
                return $existing;
            }
            throw $e;
        }
    }

    /** Debit a wallet with an overdraft guard. */
    public function debit(Wallet $wallet, int $amountKobo, int $feeKobo, string $type, array $counterparty = [], ?string $description = null, ?int $userId = null, ?string $bankingReference = null, string $status = 'successful', bool $adminOverride = false): Transaction
    {
        return DB::transaction(function () use ($wallet, $amountKobo, $feeKobo, $type, $counterparty, $description, $userId, $bankingReference, $status, $adminOverride) {
            $locked = Wallet::whereKey($wallet->id)->lockForUpdate()->first();
            $total = $amountKobo + $feeKobo;

            if (!$adminOverride && $locked->status !== 'active') {
                throw ValidationException::withMessages(['wallet' => 'Wallet is not active']);
            }
            if ($locked->balance < $total) {
                throw ValidationException::withMessages(['amount' => 'Insufficient wallet balance']);
            }

            $locked->balance -= $total;
            $locked->save();

            return Transaction::create([
                'reference' => Transaction::generateReference(),
                'wallet_id' => $locked->id,
                'user_id' => $userId,
                'type' => $type,
                'direction' => 'debit',
                'amount' => $amountKobo,
                'fee' => $feeKobo,
                'balance_after' => $locked->balance,
                'status' => $status,
                'description' => $description,
                'counterparty' => $counterparty ?: null,
                'banking_reference' => $bankingReference,
            ]);
        });
    }

    /** Internal transfer between two Patriai wallets (atomic, deadlock-safe lock order). */
    public function transferBetweenWallets(Wallet $from, Wallet $to, int $amountKobo, User $initiator, ?string $description = null): array
    {
        if ($from->id === $to->id) {
            throw ValidationException::withMessages(['to' => 'Source and destination wallets are the same']);
        }

        $result = DB::transaction(function () use ($from, $to, $amountKobo, $initiator, $description) {
            // Lock in ascending id order to avoid deadlocks.
            $ids = [$from->id, $to->id];
            sort($ids);
            $locked = Wallet::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

            $src = $locked[$from->id];
            $dst = $locked[$to->id];

            // A paused wallet still takes money in (WAL-12); nothing leaves it.
            if ($src->status !== 'active' || !in_array($dst->status, ['active', 'frozen'], true)) {
                throw ValidationException::withMessages(['wallet' => 'One of the wallets is not active']);
            }
            if ($src->balance < $amountKobo) {
                throw ValidationException::withMessages(['amount' => 'Insufficient wallet balance']);
            }

            $src->balance -= $amountKobo;
            $src->save();
            $dst->balance += $amountKobo;
            $dst->save();

            $out = Transaction::create([
                'reference' => Transaction::generateReference(),
                'wallet_id' => $src->id,
                'user_id' => $initiator->id,
                'type' => 'transfer_out',
                'direction' => 'debit',
                'amount' => $amountKobo,
                'balance_after' => $src->balance,
                'status' => 'successful',
                'description' => $description,
                'counterparty' => [
                    'kind' => 'wallet',
                    'wallet_id' => $dst->id,
                    'wallet_name' => $dst->name,
                    'owner' => $dst->owner->fullName(),
                ],
            ]);

            Transaction::create([
                'reference' => Transaction::generateReference(),
                'wallet_id' => $dst->id,
                'user_id' => $initiator->id,
                'type' => 'transfer_in',
                'direction' => 'credit',
                'amount' => $amountKobo,
                'balance_after' => $dst->balance,
                'status' => 'successful',
                'description' => $description ?: "Transfer from {$src->name}",
                'counterparty' => [
                    'kind' => 'wallet',
                    'wallet_id' => $src->id,
                    'wallet_name' => $src->name,
                    'owner' => $src->owner->fullName(),
                ],
                'meta' => ['pair_reference' => $out->reference],
            ]);

            return ['reference' => $out->reference, 'balance_after' => $src->balance];
        });

        $this->recordRoundUp($from, $amountKobo, $to, $description);

        // WAL-06 "Notifications": members who asked to hear about every payment.
        if (($from->meta['notify'] ?? null) || ($to->meta['notify'] ?? null)) {
            $manage = WalletManageService::make();
            foreach (Transaction::where('reference', $result['reference'])->orWhere('meta->pair_reference', $result['reference'])->get() as $txn) {
                $manage->notifyPayment($txn->wallet_id === $from->id ? $from : $to, $txn, $initiator);
            }
        }

        return $result;
    }

    /** Spending from Main feeds round-up savings; never undoes the move it follows. */
    private function recordRoundUp(Wallet $from, int $amountKobo, ?Wallet $to, ?string $description): void
    {
        try {
            RoundUpService::make()->record($from, $amountKobo, $to, $description);
        } catch (\Throwable $e) {
            Log::warning("Round-up for wallet {$from->id} not recorded: {$e->getMessage()}");
        }
    }

    /** Withdraw to an external bank account via the banking rails. */
    public function withdrawToBank(Wallet $wallet, User $initiator, int $amountKobo, string $bankCode, string $accountNumber, string $accountName, string $bankName, ?string $description = null): Transaction
    {
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);
        $amountNaira = number_format($amountKobo / 100, 2, '.', '');

        // 1. Debit the ledger first (reserves funds atomically).
        $txn = $this->debit(
            $wallet,
            $amountKobo,
            $feeKobo,
            'withdrawal',
            [
                'kind' => 'bank',
                'bank_code' => $bankCode,
                'bank_name' => $bankName,
                'account_number' => $accountNumber,
                'account_name' => $accountName,
            ],
            $description ?: "Withdrawal to {$accountName}",
            $initiator->id,
            null,
            'pending',
        );

        // 2. Execute on the banking rails.
        try {
            $this->banking->payout($txn->reference, $amountNaira, $accountNumber, $bankCode, $description ?: 'Patriai withdrawal');
            $txn->update(['status' => 'successful', 'banking_reference' => $txn->reference]);
            $this->recordRoundUp($wallet, $amountKobo, null, $description);
            if ($wallet->meta['notify'] ?? null) {
                WalletManageService::make()->notifyPayment($wallet, $txn, $initiator);
            }
        } catch (ConnectionException $e) {
            // Timeout / network failure: the payout outcome is UNKNOWN. Do NOT refund
            // blindly (the bank may have executed it) — leave funds reserved as 'pending'
            // for reconciliation so we never double-spend.
            Log::error("Withdrawal {$txn->reference} banking status unknown: {$e->getMessage()}");
            $txn->update(['status' => 'pending', 'meta' => ['needs_reconciliation' => true, 'error' => $e->getMessage()]]);
            throw ValidationException::withMessages([
                'banking' => 'Your withdrawal is processing. It will complete shortly or be reversed automatically.',
            ]);
        } catch (\Throwable $e) {
            // Definitive rejection from the provider: refund the reserved amount + fee.
            DB::transaction(function () use ($wallet, $txn, $amountKobo, $feeKobo) {
                $locked = Wallet::whereKey($wallet->id)->lockForUpdate()->first();
                $locked->balance += $amountKobo + $feeKobo;
                $locked->save();
                $txn->update(['status' => 'failed', 'balance_after' => $locked->balance, 'meta' => ['refunded' => true]]);
            });
            throw ValidationException::withMessages(['banking' => 'Bank transfer failed: ' . $e->getMessage()]);
        }

        return $txn->refresh();
    }
}
