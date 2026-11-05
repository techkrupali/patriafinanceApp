<?php

namespace App\Services;

use App\Models\AjoContribution;
use App\Models\ApprovalRequest;
use App\Models\AutomationRun;
use App\Models\BudgetCategory;
use App\Models\Circle;
use App\Models\SavingsPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Insights (client prototype INS-01…06): what came into and went out of the
 * wallets a person can see, where it went, each budget against what was spent,
 * where each goal will land and who put in what.
 *
 * "In" and "out" count only money crossing the edge of those wallets: moving
 * ₦50,000 from Main to School fees is neither. Amounts are kobo inside and
 * naira strings ("615000.00") out; months are Lagos months.
 */
class InsightsService
{
    public const TZ = 'Africa/Lagos';

    /** INS-02 categories, keyed as the app colours them. */
    public const CATEGORIES = [
        'food' => 'Food and market',
        'school' => 'School',
        'transport' => 'Fuel and transport',
        'bills' => 'Bills and power',
        'home' => 'Rent and building',
        'health' => 'Health and emergencies',
        'giving' => 'Giving',
        'family' => 'Family support',
        'ajo' => 'Ajo',
        'other' => 'Other',
    ];

    /**
     * Words in a payment's note (or its budget category) that say what it was
     * for. Checked in this order, so "School runs and lunch" is School and
     * "Mama's birthday dinner" is Family support.
     */
    private const WORDS = [
        'school' => ['school', 'tuition', 'term fee', 'uniform', 'textbook', 'exam', 'waec', 'jamb', 'neco', 'university', 'lesson', 'pta'],
        'health' => ['hospital', 'clinic', 'drug', 'pharmac', 'medic', 'doctor', 'health', 'lab test', 'surgery', 'dental', 'nhis'],
        'giving' => ['church', 'tithe', 'offering', 'thanksgiving', 'mosque', 'zakat', 'sadaqah', 'charity', 'donation', 'pledge', 'harvest', 'seed sowing'],
        'bills' => ['electric', 'power', 'nepa', 'phcn', 'prepaid', 'light bill', 'water', 'dstv', 'gotv', 'startimes', 'internet', 'wifi', 'data', 'airtime', 'mtn', 'glo', 'airtel', '9mobile', 'bill'],
        'transport' => ['fuel', 'petrol', 'diesel', 'gas', 'transport', 'uber', 'bolt', 'taxi', 'bus', 'keke', 'okada', 'mechanic', 'flight', 'ticket', 'school run'],
        'home' => ['rent', 'landlord', 'house', 'building', 'cement', 'block', 'lintel', 'roof', 'foundation', 'tiler', 'plumber', 'builder', 'milestone', 'contractor', 'furniture'],
        'ajo' => ['ajo', 'esusu', 'adashi'],
        'family' => ['mama', 'papa', 'mum', 'dad', 'aunty', 'auntie', 'uncle', 'sister', 'brother', 'birthday', 'wedding', 'upkeep', 'allowance', 'pocket money', 'in-law', 'naming'],
        'food' => ['food', 'market', 'rice', 'oil', 'grocer', 'provision', 'supermarket', 'shoprite', 'meat', 'fish', 'yam', 'beans', 'garri', 'bread', 'restaurant', 'chop', 'lunch', 'dinner', 'kitchen', 'foodstuff'],
    ];

    /** A wallet's own kind says what its payments were for, when the note doesn't. */
    private const WALLET_CATEGORY = ['project' => 'home', 'emergency' => 'health', 'giving' => 'giving', 'ajo' => 'ajo'];

    /** Goals: wallets with a target that money is saved towards (a project's budget is paid out, not saved). */
    private const GOAL_TYPES = ['savings', 'goal', 'emergency', 'child', 'shared', 'joint'];

    public static function make(): self
    {
        return new self;
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    private function money(int $kobo): string
    {
        return ($kobo < 0 ? '-₦' : '₦') . number_format(abs($kobo) / 100);
    }

    private function now(): Carbon
    {
        return now(self::TZ);
    }

    // ---------------------------------------------------------------- scope

    /** Wallets this person can see the money of: their own, and the ones they're an active member of. */
    public function wallets(User $user): Collection
    {
        return Wallet::where('user_id', $user->id)
            ->orWhereHas('members', fn ($q) => $q->where('user_id', $user->id)->where('status', 'active'))
            ->orderByRaw("CASE WHEN type = 'main' THEN 0 ELSE 1 END")
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->filter(fn (Wallet $w) => $w->canView($user) && !$w->hidesSpendingFrom($user))
            ->values();
    }

    /** "Okafor family", or what the person sees when they have no home circle. */
    public function scopeName(User $user): string
    {
        $home = Circle::where('is_home', true)
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id)))
            ->value('name');

        return $home ?: 'All your wallets';
    }

    /** When the first of these wallets opened: insights don't go back further. */
    private function firstDay(Collection $wallets): Carbon
    {
        $first = $wallets->min('created_at');

        return ($first ? Carbon::parse($first) : now())->setTimezone(self::TZ)->startOfDay();
    }

    /** Did this money move between two of the wallets in view? Then it's neither in nor out. */
    private function internal(Transaction $t, array $ids): bool
    {
        $cp = $t->counterparty ?? [];

        return ($cp['kind'] ?? null) === 'wallet' && in_array((int) ($cp['wallet_id'] ?? 0), $ids, true);
    }

    /** Money that came in or went out of these wallets between two moments. */
    private function moves(Collection $wallets, Carbon $from, Carbon $to): Collection
    {
        $ids = $wallets->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (!$ids) {
            return collect();
        }

        return Transaction::with('budgetCategory:id,name', 'wallet:id,type')
            ->whereIn('wallet_id', $ids)
            ->where('status', 'successful')
            ->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->get()
            ->reject(fn (Transaction $t) => $this->internal($t, $ids))
            ->values();
    }

    private function out(Transaction $t): int
    {
        return (int) $t->amount + (int) $t->fee;
    }

    /** INS-02: what a payment out was for. */
    public function category(Transaction $t): string
    {
        foreach ([(string) $t->description, (string) $t->budgetCategory?->name] as $text) {
            if (($key = $this->match($text)) !== null) {
                return $key;
            }
        }
        if ($t->type === 'fee') {
            return 'other';
        }
        if (isset(self::WALLET_CATEGORY[$t->wallet?->type])) {
            return self::WALLET_CATEGORY[$t->wallet->type];
        }

        // Sent to someone else's Patriai wallet: family and friends.
        return ($t->counterparty['kind'] ?? null) === 'wallet' ? 'family' : 'other';
    }

    private function match(string $text): ?string
    {
        $text = strtolower(preg_replace('/^Automation: /', '', $text));
        if (trim($text) === '') {
            return null;
        }
        foreach (self::WORDS as $key => $words) {
            $pattern = '/\b(?:' . implode('|', array_map(fn ($w) => preg_quote($w, '/'), $words)) . ')/';
            if (preg_match($pattern, $text)) {
                return $key;
            }
        }

        return null;
    }

    /** INS-01 "Salaries and gifts": where money in came from. */
    private function source(Transaction $t): string
    {
        return match (true) {
            $t->type === 'refund' => 'refunds',
            in_array($t->type, ['fund', 'funding'], true) && preg_match('/salar|payroll|wage|stipend/i', (string) $t->description) === 1 => 'salaries',
            in_array($t->type, ['fund', 'funding'], true) => 'bank transfers',
            ($t->counterparty['kind'] ?? null) === 'wallet' => 'gifts from family',
            default => 'other money',
        };
    }

    // ---------------------------------------------------------------- INS-01

    /** INS-01: money in and out by month (or week), and a line for each insight below. */
    public function overview(User $user, string $range): array
    {
        $wallets = $this->wallets($user);
        $now = $this->now();
        $buckets = match ($range) {
            'month' => $this->weeks($now),
            'year' => $this->months($now->copy()->startOfYear(), $now),
            default => $this->months($now->copy()->startOfMonth()->subMonthsNoOverflow(5), $now),
        };
        $from = $buckets[0]['from'];
        $moves = $this->moves($wallets, $from, $now->copy()->endOfDay());

        $bars = array_map(function (array $b) use ($moves) {
            $in = $moves->filter(fn ($t) => $t->direction === 'credit' && $this->within($t, $b['from'], $b['to']));
            $out = $moves->filter(fn ($t) => $t->direction === 'debit' && $this->within($t, $b['from'], $b['to']));

            return [
                'key' => $b['key'],
                'label' => $b['label'],
                'in' => $this->naira((int) $in->sum('amount')),
                'out' => $this->naira((int) $out->sum(fn ($t) => $this->out($t))),
            ];
        }, $buckets);

        $in = (int) $moves->where('direction', 'credit')->sum('amount');
        $out = (int) $moves->where('direction', 'debit')->sum(fn ($t) => $this->out($t));
        $sources = $moves->where('direction', 'credit')
            ->groupBy(fn ($t) => $this->source($t))
            ->map(fn ($g) => (int) $g->sum('amount'))
            ->sortDesc()
            ->keys()
            ->take(2)
            ->all();

        return [
            'scope' => $this->scopeName($user),
            'range' => $range,
            'period' => match ($range) {
                'month' => 'this month',
                'year' => 'in ' . $now->year,
                default => 'last 6 months',
            },
            'in' => $this->naira($in),
            'in_note' => $sources ? ucfirst(implode(' and ', $sources)) : 'Nothing came in yet',
            'out' => $this->naira($out),
            'left' => $this->naira($in - $out),
            'bars' => $bars,
            'lines' => [
                'categories' => $this->categoriesLine($wallets, $now),
                'budget' => $this->budgetLine($wallets),
                'forecast' => $this->forecastLine($wallets, $user),
                'contributions' => $this->contributionsLine($wallets, $user, $now),
            ],
            'wallets' => $wallets->count(),
        ];
    }

    private function within(Transaction $t, Carbon $from, Carbon $to): bool
    {
        return $t->created_at->between($from->copy()->utc(), $to->copy()->utc());
    }

    /** Calendar months from $start to the month of $now, each "May"…"Oct". */
    private function months(Carbon $start, Carbon $now): array
    {
        $out = [];
        for ($m = $start->copy()->startOfMonth(); $m->lte($now); $m->addMonthNoOverflow()) {
            $out[] = ['key' => $m->format('Y-m'), 'label' => $m->format('M'), 'from' => $m->copy(), 'to' => $m->copy()->endOfMonth()];
        }

        return $out;
    }

    /** This month in weeks: 1–7, 8–14, 15–21, 22–28, 29–31. */
    private function weeks(Carbon $now): array
    {
        $out = [];
        $start = $now->copy()->startOfMonth();
        $last = $now->copy()->endOfMonth()->day;
        for ($day = 1; $day <= $last; $day += 7) {
            $end = min($last, $day + 6);
            $out[] = [
                'key' => $start->format('Y-m') . '-w' . (intdiv($day, 7) + 1),
                'label' => $day === $end ? (string) $day : "{$day}–{$end}",
                'from' => $start->copy()->day($day)->startOfDay(),
                'to' => $start->copy()->day($end)->endOfDay(),
            ];
        }

        return $out;
    }

    private function categoriesLine(Collection $wallets, Carbon $now): string
    {
        $this_ = $this->byCategory($wallets, $now->copy()->startOfMonth(), $now->copy()->endOfDay());
        if (!$this_) {
            return 'Nothing spent this month yet';
        }
        $before = $now->copy()->startOfMonth()->subMonthNoOverflow();
        $last = $this->byCategory($wallets, $before, $before->copy()->endOfMonth());
        // A rise worth a line: a category that's at least 5% of the month, up 5% or more.
        $total = array_sum($this_);
        $rises = collect($this_)
            ->filter(fn ($kobo, $key) => $key !== 'other' && ($last[$key] ?? 0) > 0 && $kobo * 20 >= $total)
            ->map(fn ($kobo, $key) => (int) round(($kobo - $last[$key]) * 100 / $last[$key]))
            ->filter(fn ($pct) => $pct >= 5)
            ->sortDesc();
        if ($rises->isNotEmpty()) {
            return self::CATEGORIES[$rises->keys()->first()] . " is up {$rises->first()}% since " . $before->format('F');
        }

        return 'Most went to ' . self::CATEGORIES[array_key_first($this_)];
    }

    /** @return array<string, int> kobo by category key, biggest first */
    private function byCategory(Collection $wallets, Carbon $from, Carbon $to): array
    {
        return $this->moves($wallets, $from, $to)
            ->where('direction', 'debit')
            ->groupBy(fn (Transaction $t) => $this->category($t))
            ->map(fn ($g) => (int) $g->sum(fn ($t) => $this->out($t)))
            ->sortDesc()
            ->all();
    }

    // ---------------------------------------------------------------- INS-02

    /** INS-02: a month's spending by category, with the change from the month before. */
    public function categories(User $user, ?string $month): array
    {
        $wallets = $this->wallets($user);
        $now = $this->now();
        $first = $this->firstDay($wallets)->startOfMonth();
        $start = $month && preg_match('/^\d{4}-\d{2}$/', $month) ? Carbon::createFromFormat('Y-m-d', "{$month}-01", self::TZ)->startOfDay() : $now->copy()->startOfMonth();
        if ($start->gt($now)) {
            $start = $now->copy()->startOfMonth();
        }
        if ($start->lt($first)) {
            $start = $first->copy();
        }
        $end = $start->copy()->endOfMonth();
        $current = $this->byCategory($wallets, $start, $end);
        $prevStart = $start->copy()->subMonthNoOverflow();
        $prev = $this->byCategory($wallets, $prevStart, $prevStart->copy()->endOfMonth());
        $total = array_sum($current);

        // Biggest first; "Other" always last.
        uksort($current, fn ($a, $b) => [$a === 'other', $current[$b]] <=> [$b === 'other', $current[$a]]);
        $rows = [];
        foreach ($current as $key => $kobo) {
            $before = $prev[$key] ?? 0;
            $change = $before > 0 ? (int) round(($kobo - $before) * 100 / $before) : null;
            $rows[] = [
                'key' => $key,
                'name' => self::CATEGORIES[$key],
                'amount' => $this->naira($kobo),
                'percent' => $total ? (int) round($kobo * 100 / $total) : 0,
                'change' => $change,
            ];
        }

        return [
            'scope' => $wallets->count() > 1 ? 'all wallets' : ($wallets->first()?->name ?? 'your wallets'),
            'month' => $start->format('Y-m'),
            'label' => $start->format('F'),
            'year' => (int) $start->year,
            'total' => $this->naira($total),
            'previous' => $start->gt($first) ? $prevStart->format('Y-m') : null,
            'next' => $start->copy()->addMonthNoOverflow()->lte($now) ? $start->copy()->addMonthNoOverflow()->format('Y-m') : null,
            'categories' => $rows,
        ];
    }

    // ---------------------------------------------------------------- INS-03

    /** INS-03: one wallet since it opened — balance, put in, paid out, who put in most, approvals. */
    public function walletReport(Wallet $wallet, User $user): array
    {
        $tz = self::TZ;
        $since = collect([$wallet->created_at, Transaction::where('wallet_id', $wallet->id)->min('created_at')])
            ->filter()->map(fn ($d) => Carbon::parse($d))->min()->setTimezone($tz);
        $txns = Transaction::where('wallet_id', $wallet->id)->where('status', 'successful')->get();
        $credits = $txns->where('direction', 'credit');
        $debits = $txns->where('direction', 'debit');
        $months = max(1, (int) $since->copy()->startOfMonth()->diffInMonths($this->now()->startOfMonth()) + 1);
        $biggestOut = $debits->sortByDesc('amount')->first();

        $manage = WalletManageService::make();
        $biggest = null;
        if ($manage->canSeeContributions($wallet, $user) && $wallet->members()->where('status', 'active')->count() > 1) {
            $c = $manage->contributions($wallet);
            if ($c['by_user'] && $c['total'] > 0) {
                arsort($c['by_user']);
                $id = array_key_first($c['by_user']);
                $person = User::find($id);
                $biggest = [
                    'name' => $person?->first_name ?: $person?->fullName(),
                    'percent' => (int) round($c['by_user'][$id] * 100 / $c['total']),
                ];
            }
        }

        $requests = ApprovalRequest::where('wallet_id', $wallet->id)->where('status', '!=', 'cancelled')->get(['status', 'created_at', 'updated_at']);
        $decided = $requests->whereIn('status', ['approved', 'executed', 'rejected', 'failed']);
        $hours = $decided->isNotEmpty() ? (int) round($decided->avg(fn ($r) => $r->created_at->diffInMinutes($r->updated_at)) / 60) : null;

        $note = match (true) {
            $wallet->target_amount > 0 && $wallet->balance >= $wallet->target_amount => 'Goal reached',
            $wallet->target_amount > 0 => 'Goal ' . $this->money((int) $wallet->target_amount) . ($wallet->target_date ? ' by ' . $wallet->target_date->format('j M Y') : ''),
            default => $wallet->description ?: ucfirst($wallet->type) . ' wallet',
        };

        return [
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'type' => $wallet->type],
            'since' => $since->toDateString(),
            'since_label' => $since->year === $this->now()->year ? $since->format('F') : $since->format('F Y'),
            'balance' => $this->naira((int) $wallet->balance),
            'balance_note' => $note,
            'put_in' => $this->naira((int) $credits->sum('amount')),
            'put_in_count' => $credits->count(),
            'months' => $months,
            'paid_out' => $this->naira((int) $debits->sum(fn ($t) => $this->out($t))),
            'paid_out_count' => $debits->count(),
            'biggest_out' => $biggestOut ? ['description' => $biggestOut->description ?: 'Payment', 'amount' => $this->naira((int) $biggestOut->amount)] : null,
            'biggest_contributor' => $biggest,
            'approvals' => $requests->isNotEmpty() ? [
                'count' => $requests->count(),
                'approved' => $requests->whereIn('status', ['approved', 'executed'])->count(),
                'declined' => $requests->where('status', 'rejected')->count(),
                'waiting' => $requests->where('status', 'pending')->count(),
                'avg_hours' => $hours,
            ] : null,
        ];
    }

    // ---------------------------------------------------------------- INS-04

    /** INS-04: each spending wallet's budget this period, against the days gone. */
    public function budgets(User $user): array
    {
        $budgets = BudgetService::make();

        return $this->wallets($user)
            ->filter(fn (Wallet $w) => $w->budget() !== null && $w->status !== 'closed')
            ->map(function (Wallet $w) use ($budgets) {
                $b = $w->budget();
                $start = $budgets->periodStart($w);
                $next = $budgets->nextPeriodStart($w);
                $today = now()->startOfDay();
                $daysTotal = $next ? max(1, (int) $start->diffInDays($next)) : null;
                $daysGone = $next ? min($daysTotal, (int) $start->diffInDays($today) + 1) : null;
                $amount = (int) $b['amount'];
                $spent = $budgets->spent($w, $start);
                $usedPct = $amount > 0 ? (int) round($spent * 100 / $amount) : 0;
                $timePct = $daysTotal ? (int) round($daysGone * 100 / $daysTotal) : null;
                $unit = $b['period'] === 'weekly' ? 'week' : 'month';
                $pace = match (true) {
                    $timePct === null => $spent >= $amount ? 'The budget is used up' : $this->money($amount - $spent) . ' left to spend',
                    $usedPct <= $timePct - 15 => "{$timePct}% of the {$unit} has passed, so you're well ahead",
                    $usedPct <= $timePct => "{$timePct}% of the {$unit} has passed, so you're slightly ahead",
                    $usedPct <= $timePct + 10 => "{$timePct}% of the {$unit} has passed, so you're slightly behind",
                    default => "{$timePct}% of the {$unit} has passed, so you're spending faster than planned",
                };

                return [
                    'wallet_id' => $w->id,
                    'name' => $w->name,
                    'period' => $b['period'],
                    'days_gone' => $daysGone,
                    'days_total' => $daysTotal,
                    'amount' => $this->naira($amount),
                    'spent' => $this->naira($spent),
                    'percent' => $usedPct,
                    'time_percent' => $timePct,
                    'pace' => $pace,
                    'categories' => $w->budgetCategories()->get()->map(function (BudgetCategory $c) use ($budgets, $w, $start) {
                        $spent = $budgets->spent($w, $start, $c->id);

                        return [
                            'id' => $c->id,
                            'name' => $c->name,
                            'limit' => $this->naira((int) $c->limit),
                            'spent' => $this->naira($spent),
                            'state' => $spent >= $c->limit ? 'used' : ($spent * 100 >= $c->limit * 80 ? 'close' : 'within'),
                        ];
                    })->values()->all(),
                ];
            })
            ->values()
            ->all();
    }

    private function budgetLine(Collection $wallets): ?string
    {
        $w = $wallets->first(fn (Wallet $w) => $w->budget() !== null && $w->status !== 'closed');
        if (!$w) {
            return null;
        }
        $budgets = BudgetService::make();
        $amount = (int) $w->budget()['amount'];
        $spent = $budgets->spent($w, $budgets->periodStart($w));

        return "{$w->name} " . ($amount > 0 ? (int) round($spent * 100 / $amount) : 0) . '% used';
    }

    // ---------------------------------------------------------------- INS-05

    /** INS-05: if saving carries on like this, where each goal lands by its date. */
    public function forecast(User $user): array
    {
        $goals = $this->goals($this->wallets($user));
        $short = collect($goals)->first(fn ($g) => $g['status'] === 'short');
        $tip = null;
        if ($short) {
            $by = Carbon::parse($short['target_date'], self::TZ);
            $tip = 'To reach ' . $short['name'] . ' by ' . $by->format('F Y') . ', save about ' . $this->money((int) round((float) $short['per_month_more'] * 100)) . ' more each month'
                . ($short['reach_date'] ? ', or move the date to ' . Carbon::parse($short['reach_date'], self::TZ)->format('F Y') : '') . '.';
        }

        return ['goals' => $goals, 'tip' => $tip, 'short_wallet_id' => $short['wallet_id'] ?? null];
    }

    private function goals(Collection $wallets): array
    {
        $today = $this->now()->startOfDay();

        return $wallets
            ->filter(fn (Wallet $w) => in_array($w->type, self::GOAL_TYPES, true) && $w->target_amount > 0 && $w->status !== 'closed')
            ->sortBy(fn (Wallet $w) => $w->target_date?->timestamp ?? PHP_INT_MAX)
            ->map(function (Wallet $w) use ($today) {
                $target = (int) $w->target_amount;
                $balance = (int) $w->balance;
                $perMonth = $this->monthlyRate($w);
                $perDay = $perMonth / 30.44;
                $date = $w->target_date ? Carbon::parse($w->target_date->toDateString(), self::TZ) : null;
                $reach = match (true) {
                    $balance >= $target => null,
                    $perDay > 0 => $today->copy()->addDays((int) ceil(($target - $balance) / $perDay)),
                    default => null,
                };
                $daysLeft = $date ? max(0, (int) $today->diffInDays($date, false)) : null;
                $projected = $daysLeft !== null ? (int) round($balance + max(0, $perDay) * $daysLeft) : null;
                $status = match (true) {
                    $balance >= $target => 'reached',
                    $date === null => $reach ? 'no_date' : 'stalled',
                    $projected >= $target => 'on_track',
                    default => 'short',
                };
                $shortBy = $status === 'short' ? $target - $projected : null;
                $monthsLeft = $daysLeft !== null ? max(1, (int) ceil($daysLeft / 30.44)) : 1;
                $more = $shortBy !== null ? (int) (ceil($shortBy / $monthsLeft / 100_000) * 100_000) : null;

                $by = $date ? ' by ' . $this->shortDate($date) : '';
                $line = $this->money($target) . $by . ' · ' . match ($status) {
                    'reached' => 'Reached',
                    'on_track' => $reach && $date && $reach->lt($date) ? 'Reach it ' . $this->shortDate($reach) : 'Reach ' . $this->money($projected),
                    'short' => $this->money($projected) . ' by then',
                    'no_date' => 'Reach it ' . $this->shortDate($reach),
                    default => $balance > 0 ? $this->money($balance) . ' saved, nothing added lately' : 'Not saving into it yet',
                };

                return [
                    'wallet_id' => $w->id,
                    'name' => $w->name,
                    'target' => $this->naira($target),
                    'target_date' => $date?->toDateString(),
                    'balance' => $this->naira($balance),
                    'per_month' => $this->naira(max(0, $perMonth)),
                    'projected' => $projected !== null ? $this->naira($projected) : null,
                    'reach_date' => $reach?->toDateString(),
                    'status' => $status,
                    'short' => $shortBy !== null ? $this->naira($shortBy) : null,
                    'per_month_more' => $more !== null ? $this->naira($more) : null,
                    'line' => $line,
                ];
            })
            ->values()
            ->all();
    }

    /** "8 Jan" in the next few months, "Jun 2027" further out (as INS-05 writes them). */
    private function shortDate(Carbon $date): string
    {
        return $date->lte($this->now()->addMonthsNoOverflow(5)) ? $date->format('j M') : $date->format('M Y');
    }

    /**
     * Saving per month into a goal: its auto-save plan when one is on, else
     * what came in less what went out over the last three months (a new
     * wallet's opening deposit left out, so it doesn't read as a monthly pace).
     */
    private function monthlyRate(Wallet $w): int
    {
        $plan = SavingsPlan::where('wallet_id', $w->id)->where('auto_save', true)->where('amount', '>', 0)->first();
        if ($plan) {
            return (int) round(match ($plan->frequency) {
                'daily' => $plan->amount * 30.44,
                'weekly' => $plan->amount * 30.44 / 7,
                default => $plan->amount,
            });
        }
        $opened = Carbon::parse($w->created_at);
        $start = $opened->gt(now()->subDays(90)) ? $opened : now()->subDays(90);
        $txns = Transaction::where('wallet_id', $w->id)->where('status', 'successful')->where('created_at', '>=', $start)->get();
        if ($opened->gt(now()->subDays(30))) {
            $txns = $txns->reject(fn ($t) => $t->direction === 'credit' && $t->created_at->lt($opened->copy()->addDay()));
        }
        $net = (int) $txns->where('direction', 'credit')->sum('amount') - (int) $txns->where('direction', 'debit')->sum(fn ($t) => $this->out($t));
        $days = max(30, (int) $start->diffInDays(now()));

        return (int) round($net * 30.44 / $days);
    }

    private function forecastLine(Collection $wallets, User $user): string
    {
        $goals = collect($this->goals($wallets))->whereIn('status', ['on_track', 'short', 'reached']);
        if ($goals->isEmpty()) {
            return 'No goals with a date yet';
        }
        $short = $goals->where('status', 'short')->count();

        return $short === 0 ? ($goals->count() === 1 ? 'Your goal is on track' : 'All goals on track') : ($short === 1 ? '1 goal is behind' : "{$short} goals are behind");
    }

    // ---------------------------------------------------------------- INS-06

    /**
     * INS-06 "Who put in what": money each person put into the shared wallets
     * this year, and how often scheduled payments came on time. Owners and
     * co-owners see everyone; elsewhere a person sees only their own.
     */
    public function contributions(User $user, ?int $year = null): array
    {
        $now = $this->now();
        $year = $year && $year >= 2020 && $year <= $now->year ? $year : $now->year;
        $from = Carbon::create($year, 1, 1, 0, 0, 0, self::TZ);
        $to = $from->copy()->endOfYear();
        $manage = WalletManageService::make();
        $shared = $this->wallets($user)->filter(fn (Wallet $w) => $w->members()->where('status', 'active')->where('user_id', '!=', $w->user_id)->exists() && $w->type !== 'main');

        $people = [];
        $others = 0;
        $full = false;
        foreach ($shared as $w) {
            $all = in_array($w->roleOf($user), Wallet::SPENDING_ROLES, true);
            $full = $full || $all;
            $c = $manage->contributions($w, $from->copy()->utc(), $to->copy()->utc());
            foreach ($c['by_user'] as $id => $kobo) {
                if (!$all && $id !== $user->id) {
                    continue;
                }
                $people[$id] ??= ['amount' => 0, 'wallets' => []];
                $people[$id]['amount'] += $kobo;
                $people[$id]['wallets'][$w->id] = $w->name;
            }
            if ($all) {
                $others += $c['others'];
            }
        }

        $ids = $shared->pluck('id')->all();
        $onTime = $this->onTime(array_keys($people), $ids, $from, $to);
        $users = User::whereIn('id', array_keys($people))->get()->keyBy('id');
        $rows = collect($people)->map(function ($p, $id) use ($users, $onTime, $user) {
            $u = $users[$id] ?? null;
            [$done, $of] = $onTime[$id] ?? [0, 0];
            $names = array_values($p['wallets']);

            return [
                'user_id' => (int) $id,
                'name' => $id === $user->id ? 'You' : ($u?->first_name ?: $u?->fullName() ?: 'Member'),
                'full_name' => $u?->fullName(),
                'amount' => $this->naira($p['amount']),
                'on_time' => $done,
                'due' => $of,
                'note' => $of > 0 ? "{$done} of {$of} on time" : (count($names) === 1 ? $names[0] : count($names) . ' wallets'),
                'is_me' => $id === $user->id,
            ];
        })->sortByDesc(fn ($r) => (float) $r['amount'])->values();

        $done = $rows->sum('on_time');
        $of = $rows->sum('due');
        $total = (int) round($rows->sum(fn ($r) => (float) $r['amount']) * 100) + $others;

        return [
            'year' => $year,
            'wallets' => $shared->count(),
            'total' => $this->naira($total),
            'people_count' => $rows->count(),
            'on_time' => ['done' => $done, 'of' => $of, 'percent' => $of > 0 ? (int) round($done * 100 / $of) : null],
            'people' => $rows->all(),
            'others' => $others > 0 ? $this->naira($others) : null,
            'owner_view' => $full,
        ];
    }

    /**
     * Scheduled money into these wallets: each rule run (on time when it ran)
     * and each ajo round (on time when paid, not late).
     *
     * @return array<int, array{0: int, 1: int}> [on time, due] by user id
     */
    private function onTime(array $userIds, array $walletIds, Carbon $from, Carbon $to): array
    {
        $out = [];
        if (!$userIds || !$walletIds) {
            return $out;
        }
        AutomationRun::whereIn('user_id', $userIds)
            ->whereIn('status', ['ran', 'failed', 'missed', 'partial'])
            ->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->utc()])
            ->whereHas('rule', fn ($q) => $q->whereIn('to_wallet_id', $walletIds))
            ->get(['user_id', 'status'])
            ->each(function ($run) use (&$out) {
                $out[$run->user_id] ??= [0, 0];
                $out[$run->user_id][1]++;
                if ($run->status === 'ran') {
                    $out[$run->user_id][0]++;
                }
            });

        $today = $this->now()->toDateString();
        AjoContribution::query()
            ->join('ajo_members', 'ajo_members.id', '=', 'ajo_contributions.member_id')
            ->join('ajo_circles', 'ajo_circles.id', '=', 'ajo_contributions.circle_id')
            ->whereIn('ajo_circles.wallet_id', $walletIds)
            ->whereIn('ajo_members.user_id', $userIds)
            ->whereBetween('ajo_contributions.due_on', [$from->toDateString(), $to->toDateString()])
            ->get(['ajo_members.user_id as uid', 'ajo_contributions.status as st', 'ajo_contributions.late as late', 'ajo_contributions.due_on as due'])
            ->each(function ($k) use (&$out, $today) {
                $paid = $k->st === 'paid';
                if (!$paid && Carbon::parse($k->due)->toDateString() >= $today) {
                    return; // not due yet
                }
                $out[$k->uid] ??= [0, 0];
                $out[$k->uid][1]++;
                if ($paid && !$k->late) {
                    $out[$k->uid][0]++;
                }
            });

        return $out;
    }

    private function contributionsLine(Collection $wallets, User $user, Carbon $now): ?string
    {
        $c = $this->contributions($user, $now->year);
        if ($c['wallets'] === 0) {
            return null;
        }
        $n = $c['people_count'];

        return $n === 0 ? 'Nothing put in this year yet' : ($n === 1 ? '1 person this year' : "{$n} people this year");
    }
}
