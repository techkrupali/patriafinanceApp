<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Collection;

/**
 * SAV-03 "Based on what came into your Main wallet over the last 3 months": the
 * usual salary (the biggest bank deposit that comes in most months) and what
 * round-ups on spending would have saved. Amounts are kobo.
 */
class SavingsInsights
{
    /** A bank deposit into Main at least this big counts as salary (₦30,000). */
    public const SALARY_FLOOR = 3_000_000;

    private const MONTHS = 3;

    public static function make(): self
    {
        return new self();
    }

    /**
     * @return array{main: ?Wallet, months: int, salary: ?array{amount: int, day: int, from: ?string}, roundups: array<int, int>, spending: int, deposits: array<int, int>}
     */
    public function forUser(User $user): array
    {
        $main = $user->mainWallet();
        $empty = ['main' => $main, 'months' => 0, 'salary' => null, 'roundups' => array_fill_keys(\App\Models\SavingsPlan::ROUNDUP_STEPS, 0), 'spending' => 0, 'deposits' => $this->deposits($user)];
        if (!$main) {
            return $empty;
        }

        $since = now()->subMonths(self::MONTHS);
        $txns = Transaction::where('wallet_id', $main->id)
            ->where('status', 'successful')
            ->where('created_at', '>=', $since)
            ->orderBy('created_at')
            ->get();
        if ($txns->isEmpty()) {
            return $empty;
        }

        // Months with activity (at most 3), so a new account isn't divided by 3.
        $months = max(1, min(self::MONTHS, $txns->map(fn (Transaction $t) => $t->created_at->format('Y-m'))->unique()->count()));

        return [
            'main' => $main,
            'months' => $months,
            'salary' => $this->salary($txns),
            'roundups' => $this->roundups($txns, $user, $months),
            // SPD-02 "Last 3 months you spent about ₦338,000".
            'spending' => intdiv((int) $this->spends($txns, $user)->sum('amount'), $months),
            'deposits' => $this->deposits($user),
        ];
    }

    /**
     * GIV-03 "About ₦45,000 a month": what lands in each of the user's wallets from
     * banks in a typical month (kobo by wallet id) — for "a share of every deposit".
     *
     * @return array<int, int>
     */
    public function deposits(User $user): array
    {
        $ids = Wallet::where('user_id', $user->id)->pluck('id');
        $credits = Transaction::whereIn('wallet_id', $ids)
            ->where('type', 'fund')
            ->where('direction', 'credit')
            ->where('status', 'successful')
            ->where('created_at', '>=', now()->subMonths(self::MONTHS))
            ->get(['wallet_id', 'amount', 'created_at']);

        return $credits->groupBy('wallet_id')->map(function (Collection $g) {
            $months = max(1, min(self::MONTHS, $g->map(fn ($t) => $t->created_at->format('Y-m'))->unique()->count()));

            return intdiv((int) $g->sum('amount'), $months);
        })->all();
    }

    /** Typical monthly amount a "share of every salary" rule would move. */
    public function salaryShare(User $user, int $percent): ?int
    {
        $salary = $this->forUser($user)['salary'];

        return $salary ? intdiv($salary['amount'] * $percent, 100) : null;
    }

    /** The payer whose deposits come in the most months; their average and usual day. */
    private function salary(Collection $txns): ?array
    {
        $deposits = $txns->filter(fn (Transaction $t) => $t->type === 'fund' && $t->direction === 'credit' && $t->amount >= self::SALARY_FLOOR);
        if ($deposits->isEmpty()) {
            return null;
        }

        $best = $deposits
            ->groupBy(fn (Transaction $t) => strtolower(trim((string) ($t->counterparty['source_name'] ?? ''))))
            ->sortByDesc(fn (Collection $g) => [$g->map(fn ($t) => $t->created_at->format('Y-m'))->unique()->count(), $g->sum('amount')])
            ->first();

        $days = $best->map(fn (Transaction $t) => (int) $t->created_at->format('j'))->countBy()->sortDesc();

        return [
            'amount' => (int) round($best->avg('amount')),
            'day' => (int) $days->keys()->first(),
            'from' => $best->first()->counterparty['source_name'] ?? null,
        ];
    }

    /** Spending out of Main: payments, not moves between your own wallets. */
    private function spends(Collection $txns, User $user): Collection
    {
        $ownWallets = Wallet::where('user_id', $user->id)->pluck('id')->all();

        return $txns->filter(function (Transaction $t) use ($ownWallets) {
            if ($t->direction !== 'debit' || !in_array($t->type, ['withdrawal', 'transfer_out'], true)) {
                return false;
            }
            if (str_starts_with((string) $t->description, 'Automation:')) {
                return false;
            }

            return !in_array((int) ($t->counterparty['wallet_id'] ?? 0), $ownWallets, true);
        });
    }

    /** Monthly round-up per step, from spending out of Main (not moves between your own wallets). */
    private function roundups(Collection $txns, User $user, int $months): array
    {
        $spends = $this->spends($txns, $user);

        $out = [];
        foreach (\App\Models\SavingsPlan::ROUNDUP_STEPS as $step) {
            $sum = $spends->sum(fn (Transaction $t) => RoundUpService::roundUp((int) $t->amount, $step));
            $out[$step] = intdiv($sum, $months);
        }

        return $out;
    }
}
