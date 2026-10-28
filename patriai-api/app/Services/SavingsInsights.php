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
     * @return array{main: ?Wallet, months: int, salary: ?array{amount: int, day: int, from: ?string}, roundups: array<int, int>}
     */
    public function forUser(User $user): array
    {
        $main = $user->mainWallet();
        $empty = ['main' => $main, 'months' => 0, 'salary' => null, 'roundups' => array_fill_keys(\App\Models\SavingsPlan::ROUNDUP_STEPS, 0)];
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
        ];
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

    /** Monthly round-up per step, from spending out of Main (not moves between your own wallets). */
    private function roundups(Collection $txns, User $user, int $months): array
    {
        $ownWallets = Wallet::where('user_id', $user->id)->pluck('id')->all();
        $spends = $txns->filter(function (Transaction $t) use ($ownWallets) {
            if ($t->direction !== 'debit' || !in_array($t->type, ['withdrawal', 'transfer_out'], true)) {
                return false;
            }
            if (str_starts_with((string) $t->description, 'Automation:')) {
                return false;
            }

            return !in_array((int) ($t->counterparty['wallet_id'] ?? 0), $ownWallets, true);
        });

        $out = [];
        foreach (\App\Models\SavingsPlan::ROUNDUP_STEPS as $step) {
            $sum = $spends->sum(fn (Transaction $t) => RoundUpService::roundUp((int) $t->amount, $step));
            $out[$step] = intdiv($sum, $months);
        }

        return $out;
    }
}
