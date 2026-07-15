<?php

namespace App\Console\Commands;

use App\Models\Transaction;
use App\Models\Wallet;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Reconcile withdrawals stuck in 'pending' after a banking timeout (see
 * WalletService::withdrawToBank, which leaves the debit reserved with
 * meta.needs_reconciliation when the payout outcome is unknown).
 *
 * The Matrix Banking API exposes no payout/transfer status lookup, so once the
 * grace period has elapsed we conservatively REFUND the reserved amount + fee
 * back to the wallet (mirroring withdrawToBank's Throwable refund path) and mark
 * the transaction 'failed'. Each refund runs in its own DB transaction with a
 * row lock and re-checks state under the lock, so repeated runs (or a concurrent
 * admin reversal) never double-refund. Registered on the scheduler in
 * bootstrap/app.php as banking:reconcile.
 */
class ReconcilePendingPayouts extends Command
{
    protected $signature = 'banking:reconcile';

    protected $description = 'Refund and fail withdrawals left pending past the reconciliation grace period';

    /** Wait this long after the debit before acting, so a slow payout can still settle. */
    private const GRACE_MINUTES = 15;

    public function handle(): int
    {
        $cutoff = now()->subMinutes(self::GRACE_MINUTES);

        $candidates = Transaction::where('status', 'pending')
            ->where('meta->needs_reconciliation', true)
            ->where('created_at', '<', $cutoff)
            ->get();

        $reconciled = 0;

        foreach ($candidates as $candidate) {
            $refunded = DB::transaction(function () use ($candidate) {
                // Row-lock the txn and re-check under the lock to stay idempotent
                // against a concurrent reconcile run or an admin reversal.
                $txn = Transaction::whereKey($candidate->id)->lockForUpdate()->first();
                $meta = $txn->meta ?? [];

                if ($txn->status !== 'pending'
                    || empty($meta['needs_reconciliation'])
                    || !empty($meta['refunded'])
                    || !empty($meta['reversed'])) {
                    return false;
                }

                $wallet = Wallet::whereKey($txn->wallet_id)->lockForUpdate()->first();
                if (!$wallet) {
                    return false;
                }

                $wallet->balance += $txn->amount + $txn->fee;
                $wallet->save();

                $txn->update([
                    'status' => 'failed',
                    'balance_after' => $wallet->balance,
                    'meta' => array_merge($meta, [
                        'refunded' => true,
                        'reconciled' => true,
                        'reconciled_at' => now()->toIso8601String(),
                        'reconcile_note' => 'Payout unresolved past grace period; amount + fee refunded automatically.',
                    ]),
                ]);

                return true;
            });

            if ($refunded) {
                $reconciled++;
                Log::warning("Reconciled stuck payout {$candidate->reference}: refunded amount + fee and marked failed.");
            }
        }

        $this->info("Reconciled {$reconciled} stuck payout(s) out of {$candidates->count()} candidate(s).");

        return self::SUCCESS;
    }
}
