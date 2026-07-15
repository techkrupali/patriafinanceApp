<?php

namespace App\Services;

use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Patria Lending engine. Platform-funded loans tied to a USER (enforced across
 * all their wallets — one open loan at a time). Disbursement CREDITS a wallet;
 * repayment DEBITS a wallet. Every balance change is replayed through
 * WalletService so it stays inside a row-locked DB transaction — this service
 * never mutates wallet balances directly.
 */
class LoanService
{
    /** Flat interest for M4: 5% (500 basis points). */
    private const INTEREST_BPS = 500;

    /** Loans at or below this principal (kobo) with a target wallet auto-approve. */
    private const AUTO_APPROVE_MAX_KOBO = 10_000_000; // ₦100,000

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /** KYC-tier borrowing cap in kobo. */
    private function tierCap(User $user): int
    {
        return match (true) {
            $user->kyc_tier >= 3 => 100_000_000, // ₦1,000,000
            $user->kyc_tier === 2 => 20_000_000,  // ₦200,000
            default => 5_000_000,                 // ₦50,000 (tier 0/1)
        };
    }

    /** Sum of the user's successful CREDIT transactions in the last 90 days (kobo). */
    private function recentCreditVolume(User $user): int
    {
        $walletIds = $user->wallets()->pluck('id');

        if ($walletIds->isEmpty()) {
            return 0;
        }

        // Only genuine inflows count toward credit history. Loan disbursements,
        // reversals, and admin credits are not real earned volume and would
        // otherwise let a disbursed loan inflate the next borrowing limit.
        return (int) Transaction::whereIn('wallet_id', $walletIds)
            ->where('direction', 'credit')
            ->where('status', 'successful')
            ->whereNotIn('type', ['loan_disbursement', 'reversal', 'admin_credit'])
            ->where('created_at', '>=', now()->subDays(90))
            ->sum('amount');
    }

    /** Outstanding + penalty still owed across the user's open loans (kobo). */
    private function currentOwed(User $user): int
    {
        return (int) Loan::where('user_id', $user->id)
            ->whereIn('status', Loan::OWED_STATUSES)
            ->sum(DB::raw('outstanding + penalty_accrued'));
    }

    /** Deterministic eligible borrowing limit in kobo (never below 0). */
    private function maxEligibleKobo(User $user): int
    {
        $tierCap = $this->tierCap($user);

        // History factor: 2× recent successful credit volume, capped at the tier cap.
        $historyFactor = min($tierCap, 2 * $this->recentCreditVolume($user));

        // New users still get a starter limit of 20% of the tier cap.
        $base = min($tierCap, max((int) round($tierCap * 0.2), $historyFactor));

        // Reduce by whatever is still owed on open loans.
        return max(0, $base - $this->currentOwed($user));
    }

    /** True if the user already has an open (blocking) loan. */
    private function hasOpenLoan(User $user): bool
    {
        return Loan::where('user_id', $user->id)
            ->whereIn('status', Loan::OPEN_STATUSES)
            ->exists();
    }

    /**
     * Borrowing eligibility snapshot for a user.
     * Returns: max_amount (naira string), max_amount_kobo (int), tier (int),
     * categories (string[]), has_active_loan (bool).
     */
    public function eligibility(User $user): array
    {
        $maxKobo = $this->maxEligibleKobo($user);

        return [
            'max_amount' => $this->naira($maxKobo),
            'max_amount_kobo' => $maxKobo,
            'tier' => (int) $user->kyc_tier,
            'categories' => Loan::CATEGORIES,
            'has_active_loan' => $this->hasOpenLoan($user),
        ];
    }

    /**
     * Submit a loan application. Auto-approves + disburses small loans that name
     * a disbursement wallet; otherwise leaves the loan 'pending' for an admin.
     */
    public function apply(
        User $user,
        string $category,
        int $principalKobo,
        int $tenorDays,
        string $frequency,
        ?string $purpose,
        ?int $disburseWalletId,
    ): Loan {
        if (!in_array($category, Loan::CATEGORIES, true)) {
            throw ValidationException::withMessages(['category' => 'Invalid loan category']);
        }
        if (!in_array($frequency, ['once', 'weekly', 'monthly'], true)) {
            throw ValidationException::withMessages(['repayment_frequency' => 'Invalid repayment frequency']);
        }
        if ($tenorDays < 7 || $tenorDays > 365) {
            throw ValidationException::withMessages(['tenor_days' => 'Tenor must be between 7 and 365 days']);
        }
        if ($principalKobo <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero']);
        }
        // If a disbursement wallet is named it must belong to the borrower.
        $disburseWallet = null;
        if ($disburseWalletId !== null) {
            $disburseWallet = Wallet::where('id', $disburseWalletId)
                ->where('user_id', $user->id)
                ->first();
            if (!$disburseWallet) {
                throw ValidationException::withMessages(['disburse_wallet_id' => 'Invalid disbursement wallet']);
            }
        }

        $interest = (int) round($principalKobo * self::INTEREST_BPS / 10000);
        $fee = 0;
        $totalRepayable = $principalKobo + $interest + $fee;

        // Serialize per-user: lock the user row so two concurrent applications can't
        // both pass the one-open-loan guard. The open-loan + eligibility checks are
        // re-evaluated inside the lock, and creation (+ auto-disburse) happens atomically.
        return DB::transaction(function () use ($user, $category, $purpose, $principalKobo, $interest, $fee, $totalRepayable, $tenorDays, $frequency, $disburseWallet) {
            User::whereKey($user->id)->lockForUpdate()->first();

            if ($this->hasOpenLoan($user)) {
                throw ValidationException::withMessages(['loan' => 'You already have an active or pending loan']);
            }
            if ($principalKobo > $this->maxEligibleKobo($user)) {
                throw ValidationException::withMessages(['amount' => 'Amount exceeds your eligible limit']);
            }

            $loan = Loan::create([
                'reference' => Loan::generateReference(),
                'user_id' => $user->id,
                'category' => $category,
                'purpose' => $purpose,
                'principal' => $principalKobo,
                'interest_bps' => self::INTEREST_BPS,
                'fee' => $fee,
                'total_repayable' => $totalRepayable,
                'outstanding' => $totalRepayable,
                'penalty_accrued' => 0,
                'tenor_days' => $tenorDays,
                'repayment_frequency' => $frequency,
                'status' => 'pending',
                'disbursed_wallet_id' => $disburseWallet?->id,
            ]);

            $this->notifications->push(
                $user,
                'loan_submitted',
                'Loan application received',
                'Your ₦' . $this->naira($principalKobo) . " {$category} loan is being reviewed.",
                ['loan_id' => $loan->id, 'loan_reference' => $loan->reference],
            );

            // Auto-approve small, wallet-targeted loans.
            if ($principalKobo <= self::AUTO_APPROVE_MAX_KOBO && $disburseWallet !== null) {
                return $this->approveAndDisburse($loan, null);
            }

            return $loan;
        });
    }

    /**
     * Approve a pending loan, credit the disbursement wallet and build the
     * repayment schedule. Idempotent-guarded on loan status.
     */
    public function approveAndDisburse(Loan $loan, ?User $admin): Loan
    {
        if (!in_array($loan->status, ['pending', 'approved'], true)) {
            throw ValidationException::withMessages(['loan' => 'This loan cannot be disbursed in its current state']);
        }

        $wallet = $loan->disbursed_wallet_id
            ? Wallet::find($loan->disbursed_wallet_id)
            : $loan->user->mainWallet();

        if (!$wallet) {
            throw ValidationException::withMessages(['wallet' => 'No wallet available to disburse this loan']);
        }

        return DB::transaction(function () use ($loan, $admin, $wallet) {
            $this->wallets->credit(
                $wallet,
                $loan->principal,
                'loan_disbursement',
                ['kind' => 'loan', 'loan_reference' => $loan->reference],
                null,
                "Loan disbursement ({$loan->category})",
                $loan->user_id,
            );

            $now = now();
            $dueAt = $now->copy()->addDays($loan->tenor_days);

            $loan->update([
                'status' => 'active',
                'disbursed_at' => $now,
                'disbursed_wallet_id' => $wallet->id,
                'approved_by' => $admin?->id,
                'due_at' => $dueAt,
            ]);

            $this->buildSchedule($loan, $now, $dueAt);

            $this->notifications->push(
                $loan->user,
                'loan_disbursed',
                'Loan disbursed',
                '₦' . $this->naira($loan->principal) . " has been credited to {$wallet->name}. Total repayable: ₦" . $this->naira($loan->total_repayable) . '.',
                ['loan_id' => $loan->id, 'loan_reference' => $loan->reference, 'wallet_id' => $wallet->id],
            );

            return $loan->refresh();
        });
    }

    /** Create the installment rows for a freshly disbursed loan. */
    private function buildSchedule(Loan $loan, \Illuminate\Support\Carbon $start, \Illuminate\Support\Carbon $dueAt): void
    {
        $total = $loan->total_repayable;

        if ($loan->repayment_frequency === 'once') {
            LoanRepayment::create([
                'loan_id' => $loan->id,
                'sequence' => 1,
                'due_date' => $dueAt->toDateString(),
                'amount_due' => $total,
                'amount_paid' => 0,
                'status' => 'pending',
            ]);

            return;
        }

        $step = $loan->repayment_frequency === 'weekly' ? 7 : 30;
        $n = max(1, (int) ceil($loan->tenor_days / $step));

        $base = intdiv($total, $n);

        for ($i = 1; $i <= $n; $i++) {
            // Last installment absorbs the rounding remainder and lands on due_at.
            $amount = $i === $n ? $total - $base * ($n - 1) : $base;
            $dueDate = $i === $n ? $dueAt : $start->copy()->addDays($step * $i);

            LoanRepayment::create([
                'loan_id' => $loan->id,
                'sequence' => $i,
                'due_date' => $dueDate->toDateString(),
                'amount_due' => $amount,
                'amount_paid' => 0,
                'status' => 'pending',
            ]);
        }
    }

    /** Reject a pending loan. */
    public function reject(Loan $loan, User $admin, string $reason): Loan
    {
        if ($loan->status !== 'pending') {
            throw ValidationException::withMessages(['loan' => 'Only a pending loan can be rejected']);
        }

        $loan->update([
            'status' => 'rejected',
            'rejected_reason' => $reason,
            'approved_by' => $admin->id,
        ]);

        $this->notifications->push(
            $loan->user,
            'loan_rejected',
            'Loan application declined',
            "Your ₦" . $this->naira($loan->principal) . " {$loan->category} loan was declined. Reason: {$reason}",
            ['loan_id' => $loan->id, 'loan_reference' => $loan->reference],
        );

        return $loan->refresh();
    }

    /**
     * Repay a loan from one of the borrower's wallets. Applies the payment to
     * penalty first, then to outstanding + the schedule rows. DEBIT is
     * overdraft-guarded inside WalletService.
     */
    public function repay(Loan $loan, User $user, Wallet $wallet, int $amountKobo): array
    {
        return $this->applyPayment($loan, $user, $wallet, $amountKobo, $user->id, false, $user);
    }

    /**
     * Admin-initiated recovery against a borrower's wallet. Same money mechanics
     * as repay(); flags meta.recovered.
     */
    public function recover(Loan $loan, User $admin, Wallet $wallet, int $amountKobo): array
    {
        return $this->applyPayment($loan, $loan->user, $wallet, $amountKobo, $loan->user_id, true, $admin);
    }

    /**
     * Shared money path for repay() and recover().
     * $ownerCheck is the user the loan must belong to (borrower for both flows).
     * $recovery marks the loan meta and skips the borrower-ownership guard's error copy.
     */
    private function applyPayment(Loan $loan, User $ownerCheck, Wallet $wallet, int $amountKobo, int $debitUserId, bool $recovery, User $actor): array
    {
        if ($loan->user_id !== $ownerCheck->id) {
            throw ValidationException::withMessages(['loan' => 'This loan does not belong to you']);
        }
        if (!in_array($loan->status, Loan::OWED_STATUSES, true)) {
            throw ValidationException::withMessages(['loan' => 'This loan is not open for repayment']);
        }
        if ($amountKobo <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero']);
        }

        $totalOwed = $loan->outstanding + $loan->penalty_accrued;
        if ($amountKobo > $totalOwed) {
            throw ValidationException::withMessages(['amount' => 'Amount exceeds the outstanding balance']);
        }

        return DB::transaction(function () use ($loan, $wallet, $amountKobo, $debitUserId, $recovery, $actor) {
            $txn = $this->wallets->debit(
                $wallet,
                $amountKobo,
                0,
                'loan_repayment',
                ['kind' => 'loan', 'loan_reference' => $loan->reference],
                "Loan repayment ({$loan->reference})",
                $debitUserId,
            );

            // Apply to penalty first, then to principal outstanding.
            $penaltyPay = min($amountKobo, $loan->penalty_accrued);
            $loan->penalty_accrued -= $penaltyPay;
            $toOutstanding = $amountKobo - $penaltyPay;
            $loan->outstanding = max(0, $loan->outstanding - $toOutstanding);

            // Advance the schedule rows in order with the portion applied to outstanding.
            $left = $toOutstanding;
            $rows = $loan->repayments()
                ->whereIn('status', ['pending', 'partial', 'overdue'])
                ->orderBy('sequence')
                ->get();

            foreach ($rows as $row) {
                if ($left <= 0) {
                    break;
                }
                $rowDue = $row->amount_due - $row->amount_paid;
                if ($rowDue <= 0) {
                    continue;
                }
                $pay = min($left, $rowDue);
                $row->amount_paid += $pay;
                $left -= $pay;

                if ($row->amount_paid >= $row->amount_due) {
                    $row->status = 'paid';
                    $row->paid_at = now();
                } else {
                    $row->status = 'partial';
                }
                if ($row->transaction_id === null) {
                    $row->transaction_id = $txn->id;
                }
                $row->save();
            }

            $fullyRepaid = $loan->outstanding <= 0 && $loan->penalty_accrued <= 0;
            if ($fullyRepaid) {
                $loan->status = 'repaid';
            }

            if ($recovery) {
                $meta = $loan->meta ?? [];
                $meta['recovered'] = true;
                $meta['recovered_by'] = $actor->id;
                $meta['recovered_at'] = now()->toIso8601String();
                $loan->meta = $meta;
            }

            $loan->save();

            $this->notifications->push(
                $loan->user,
                $fullyRepaid ? 'loan_repaid_full' : 'loan_repaid_partial',
                $fullyRepaid ? 'Loan fully repaid' : 'Loan repayment received',
                $fullyRepaid
                    ? "Your ₦" . $this->naira($loan->total_repayable) . " {$loan->category} loan is now fully repaid."
                    : '₦' . $this->naira($amountKobo) . ' received. Outstanding: ₦' . $this->naira($loan->outstanding + $loan->penalty_accrued) . '.',
                ['loan_id' => $loan->id, 'loan_reference' => $loan->reference, 'transaction_reference' => $txn->reference],
            );

            return ['loan' => $loan->refresh(), 'transaction' => $txn];
        });
    }

    /** Cancel a still-pending loan (borrower-initiated). */
    public function cancel(Loan $loan, User $user): Loan
    {
        if ($loan->status !== 'pending') {
            throw ValidationException::withMessages(['loan' => 'Only a pending loan can be cancelled']);
        }

        $loan->update(['status' => 'cancelled']);

        return $loan->refresh();
    }

    /** Mark an active loan as defaulted (admin). */
    public function markDefaulted(Loan $loan, User $admin): Loan
    {
        if ($loan->status !== 'active') {
            throw ValidationException::withMessages(['loan' => 'Only an active loan can be defaulted']);
        }

        $loan->update(['status' => 'defaulted']);

        $this->notifications->push(
            $loan->user,
            'loan_defaulted',
            'Loan marked as defaulted',
            "Your ₦" . $this->naira($loan->total_repayable) . " {$loan->category} loan has been marked as defaulted. Please repay ₦" . $this->naira($loan->outstanding + $loan->penalty_accrued) . ' to settle it.',
            ['loan_id' => $loan->id, 'loan_reference' => $loan->reference],
        );

        return $loan->refresh();
    }

    /**
     * Sweep active loans for overdue installments: mark rows 'overdue' and add a
     * 1% penalty of the still-due installment to penalty_accrued, at most once
     * per calendar day per loan (guarded by meta.last_overdue_run).
     */
    public function accrueOverdue(): array
    {
        $today = now()->toDateString();
        $loansProcessed = 0;
        $loansPenalized = 0;
        $penaltyCharged = 0;

        Loan::where('status', 'active')->chunkById(100, function ($loans) use ($today, &$loansProcessed, &$loansPenalized, &$penaltyCharged) {
            foreach ($loans as $loan) {
                $overdueRows = $loan->repayments()
                    ->whereIn('status', ['pending', 'partial', 'overdue'])
                    ->whereDate('due_date', '<', $today)
                    ->orderBy('sequence')
                    ->get();

                if ($overdueRows->isEmpty()) {
                    continue;
                }

                $loansProcessed++;

                foreach ($overdueRows as $row) {
                    if ($row->status !== 'overdue') {
                        $row->update(['status' => 'overdue']);
                    }
                }

                $meta = $loan->meta ?? [];
                if (($meta['last_overdue_run'] ?? null) === $today) {
                    continue; // already penalised today
                }

                $penalty = 0;
                foreach ($overdueRows as $row) {
                    $stillDue = $row->amount_due - $row->amount_paid;
                    if ($stillDue > 0) {
                        $penalty += (int) round($stillDue * 0.01);
                    }
                }

                if ($penalty > 0) {
                    $meta['last_overdue_run'] = $today;
                    $loan->penalty_accrued += $penalty;
                    $loan->meta = $meta;
                    $loan->save();
                    $loansPenalized++;
                    $penaltyCharged += $penalty;
                }
            }
        });

        return [
            'loans_processed' => $loansProcessed,
            'loans_penalized' => $loansPenalized,
            'penalty_charged' => $this->naira($penaltyCharged),
        ];
    }
}
