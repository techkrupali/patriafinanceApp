<?php

namespace App\Console\Commands;

use App\Models\Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Reconcile withdrawals stuck in 'pending' after a banking timeout (see
 * WalletService::withdrawToBank, which leaves the debit reserved with
 * meta.needs_reconciliation when the payout outcome is unknown).
 *
 * The Matrix Banking API exposes no payout/transfer status lookup, so the
 * payout outcome is UNKNOWABLE from here. We must NOT refund blindly — the
 * bank may have executed the payout, and re-crediting the wallet would
 * double-spend (WalletService's no-blind-refund invariant). Instead, once the
 * grace period has elapsed we flag the transaction for manual review: status
 * stays 'pending', funds stay reserved, and an operator confirms the outcome
 * with the bank before reversing via POST /admin/transactions/{id}/reverse.
 * Each flag runs in its own DB transaction with a row lock and re-checks state
 * under the lock, so repeated runs never re-flag. Registered on the scheduler
 * in bootstrap/app.php as banking:reconcile.
 */
class ReconcilePendingPayouts extends Command
{
    protected $signature = 'banking:reconcile';

    protected $description = 'Flag withdrawals left pending past the reconciliation grace period for manual review';

    /** Wait this long after the debit before acting, so a slow payout can still settle. */
    private const GRACE_MINUTES = 15;

    public function handle(): int
    {
        $cutoff = now()->subMinutes(self::GRACE_MINUTES);

        $candidates = Transaction::where('status', 'pending')
            ->where('meta->needs_reconciliation', true)
            ->whereNull('meta->needs_manual_review')
            ->where('created_at', '<', $cutoff)
            ->get();

        $flagged = 0;

        foreach ($candidates as $candidate) {
            $marked = DB::transaction(function () use ($candidate) {
                // Row-lock the txn and re-check under the lock to stay idempotent
                // against a concurrent reconcile run or an admin reversal.
                $txn = Transaction::whereKey($candidate->id)->lockForUpdate()->first();
                $meta = $txn->meta ?? [];

                if ($txn->status !== 'pending'
                    || empty($meta['needs_reconciliation'])
                    || !empty($meta['needs_manual_review'])
                    || !empty($meta['refunded'])
                    || !empty($meta['reversed'])) {
                    return false;
                }

                $txn->update([
                    'meta' => array_merge($meta, [
                        'needs_manual_review' => true,
                        'reviewed_after' => now()->toIso8601String(),
                        'reconcile_note' => 'Payout unresolved past grace period; funds held pending manual review — confirm outcome with the bank before reversing.',
                    ]),
                ]);

                return true;
            });

            if ($marked) {
                $flagged++;
                Log::warning("Stuck payout {$candidate->reference}: outcome unknown past grace period; flagged for manual review (funds remain reserved, no refund issued).");
            }
        }

        $this->info("Flagged {$flagged} stuck payout(s) for manual review out of {$candidates->count()} candidate(s).");

        return self::SUCCESS;
    }
}
