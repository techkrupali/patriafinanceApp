<?php

namespace App\Services;

use App\Models\BudgetCategory;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Spending wallets (client prototype SPD-01…06, WAL-09): a budget for a week, a
 * month (from a chosen day — "lines up with salary day") or one event, split
 * into categories with limits. Payments are tagged with their category; each
 * spender may be limited to some categories and a daily amount; going over
 * either asks an owner to approve or stops the payment. Owners hear at half
 * spent, 80% spent and when a category runs out, and get a Sunday summary. At
 * each new month what's left stays, goes back to Main, or moves to another
 * wallet. Amounts are kobo.
 */
class BudgetService
{
    public const PERIODS = ['weekly', 'monthly', 'one_off'];

    public const FUNDING = ['topup', 'split', 'manual'];

    public const OVER_LIMIT = ['approve', 'stop'];

    public const MAX_CATEGORIES = 12;

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
        return '₦' . number_format($kobo / 100);
    }

    // ------------------------------------------------------------------ setup

    /**
     * SPD-02…06 on a new spending wallet. $budget: amount, period, start_day,
     * leftover {mode, wallet_id?}, funding, my_share (kobo, split funding), alerts
     * {half, eighty, category_out, weekly}, over_limit, categories [{name, limit}].
     * Runs inside the caller's transaction. Returns category ids by name.
     *
     * @return array<string, int>
     */
    public function configure(Wallet $wallet, User $owner, array $budget, ?Wallet $source): array
    {
        $amount = (int) ($budget['amount'] ?? 0);
        $period = $budget['period'] ?? 'monthly';
        if ($amount <= 0) {
            throw ValidationException::withMessages(['budget.amount' => 'Enter how much the budget is.']);
        }
        if (!in_array($period, self::PERIODS, true)) {
            throw ValidationException::withMessages(['budget.period' => 'Choose weekly, monthly or one-off.']);
        }
        $startDay = $period === 'weekly'
            ? max(1, min(7, (int) ($budget['start_day'] ?? 1)))
            : max(1, min(28, (int) ($budget['start_day'] ?? 1)));

        $leftover = $budget['leftover'] ?? ['mode' => 'keep'];
        $mode = in_array($leftover['mode'] ?? 'keep', ['keep', 'main', 'wallet'], true) ? $leftover['mode'] : 'keep';
        $leftoverWallet = null;
        if ($mode === 'wallet') {
            $leftoverWallet = Wallet::where('id', (int) ($leftover['wallet_id'] ?? 0))->where('user_id', $owner->id)->where('status', 'active')->first();
            if (!$leftoverWallet || $leftoverWallet->id === $wallet->id) {
                throw ValidationException::withMessages(['budget.leftover.wallet_id' => 'Choose one of your wallets for what is left.']);
            }
        }

        $categories = array_values($budget['categories'] ?? []);
        if (count($categories) > self::MAX_CATEGORIES) {
            throw ValidationException::withMessages(['budget.categories' => 'You can have up to ' . self::MAX_CATEGORIES . ' categories.']);
        }
        $total = 0;
        $seen = [];
        foreach ($categories as $i => $c) {
            $name = trim((string) ($c['name'] ?? ''));
            $limit = (int) ($c['limit'] ?? 0);
            if ($name === '' || $limit <= 0) {
                throw ValidationException::withMessages(["budget.categories.{$i}" => 'Give each category a name and a limit.']);
            }
            if (isset($seen[strtolower($name)])) {
                throw ValidationException::withMessages(["budget.categories.{$i}.name" => "{$name} is already a category."]);
            }
            $seen[strtolower($name)] = true;
            $total += $limit;
        }
        if ($total > $amount) {
            throw ValidationException::withMessages(['budget.categories' => 'The categories add up to ' . $this->naira($total) . ', more than the ' . $this->naira($amount) . ' budget.']);
        }

        $funding = in_array($budget['funding'] ?? 'manual', self::FUNDING, true) ? $budget['funding'] : 'manual';
        $alerts = $budget['alerts'] ?? [];
        $wallet->update(['meta' => array_merge($wallet->meta ?? [], [
            'budget' => [
                'amount' => $amount,
                'period' => $period,
                'start_day' => $startDay,
                'leftover' => ['mode' => $mode, 'wallet_id' => $leftoverWallet?->id],
                'funding' => $funding,
                'alerts' => [
                    'half' => (bool) ($alerts['half'] ?? true),
                    'eighty' => (bool) ($alerts['eighty'] ?? true),
                    'category_out' => (bool) ($alerts['category_out'] ?? true),
                    'weekly' => (bool) ($alerts['weekly'] ?? false),
                ],
                'over_limit' => in_array($budget['over_limit'] ?? 'approve', self::OVER_LIMIT, true) ? $budget['over_limit'] : 'approve',
                'period_key' => $this->periodKey($period, $startDay, now(), $wallet),
            ],
        ])]);

        $ids = [];
        foreach ($categories as $i => $c) {
            $row = BudgetCategory::create([
                'wallet_id' => $wallet->id,
                'name' => trim((string) $c['name']),
                'limit' => (int) $c['limit'],
                'position' => $i + 1,
            ]);
            $ids[strtolower($row->name)] = $row->id;
        }

        // SPD-04: who fills it, and when.
        if ($funding !== 'manual' && $period !== 'one_off') {
            if (!$source) {
                throw ValidationException::withMessages(['source_wallet_id' => 'Choose the wallet the budget comes from.']);
            }
            $frequency = $period === 'weekly' ? 'weekly' : 'monthly';
            $automations = AutomationService::make();
            if ($funding === 'topup') {
                $automations->createTopUpRule($owner, $source, $wallet, $amount, $frequency, $startDay);
            } elseif (($share = (int) ($budget['my_share'] ?? 0)) > 0) {
                $automations->createContributionRule($owner, $source, $wallet, [
                    'name' => "My share into {$wallet->name}",
                    'amount' => $share,
                    'frequency' => $frequency,
                    'day_of_week' => $startDay,
                    'day_of_month' => $startDay,
                ]);
            }
        }

        return $ids;
    }

    // --------------------------------------------------------------- periods

    /** When the current budget period began. */
    public function periodStart(Wallet $wallet, ?Carbon $now = null): Carbon
    {
        $budget = $wallet->budget() ?? [];
        $now = ($now ?? now())->copy()->startOfDay();
        $day = (int) ($budget['start_day'] ?? 1);

        return match ($budget['period'] ?? 'monthly') {
            'weekly' => $now->isoWeekday() >= $day ? $now->copy()->subDays($now->isoWeekday() - $day) : $now->copy()->subDays($now->isoWeekday() + 7 - $day),
            'one_off' => $wallet->created_at->copy()->startOfDay(),
            default => $now->day >= $day ? $now->copy()->day($day) : $now->copy()->subMonthNoOverflow()->day($day),
        };
    }

    /** When the next one begins (null for a one-off budget). */
    public function nextPeriodStart(Wallet $wallet, ?Carbon $now = null): ?Carbon
    {
        $budget = $wallet->budget() ?? [];
        $start = $this->periodStart($wallet, $now);

        return match ($budget['period'] ?? 'monthly') {
            'weekly' => $start->copy()->addWeek(),
            'one_off' => null,
            default => $start->copy()->addMonthNoOverflow(),
        };
    }

    private function periodKey(string $period, int $startDay, Carbon $now, Wallet $wallet): string
    {
        if ($period === 'one_off') {
            return 'once';
        }
        $probe = clone $wallet;
        $probe->meta = array_merge($wallet->meta ?? [], ['budget' => ['period' => $period, 'start_day' => $startDay, 'amount' => 1]]);

        return $this->periodStart($probe, $now)->toDateString();
    }

    // ---------------------------------------------------------------- spending

    /** Money that left as spending since $since: payments only, not the wallet's own moves. */
    public function spent(Wallet $wallet, Carbon $since, ?int $categoryId = null, ?int $userId = null): int
    {
        return (int) Transaction::where('wallet_id', $wallet->id)
            ->where('direction', 'debit')
            ->whereIn('type', ['transfer_out', 'withdrawal'])
            ->whereIn('status', ['successful', 'pending'])
            ->where('created_at', '>=', $since)
            ->whereNull('meta->budget_internal') // the leftover moving out at month end
            ->when($categoryId !== null, fn ($q) => $q->where('budget_category_id', $categoryId))
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->sum('amount');
    }

    private function member(Wallet $wallet, User $user): ?WalletMember
    {
        if ($wallet->user_id === $user->id) {
            return null;
        }

        return $wallet->members()->where('user_id', $user->id)->where('status', 'active')->first();
    }

    /**
     * Before money leaves a spending wallet: is this spender allowed this category,
     * and does it fit their daily limit, the category's limit and the budget? Over
     * a limit, the wallet's rule decides — an owner approves, or it stops.
     *
     * @return array{category_id: ?int, over: ?string}
     */
    public function check(Wallet $wallet, User $user, int $amount, ?int $categoryId, bool $approved = false): array
    {
        $budget = $wallet->budget();
        if (!$budget) {
            return ['category_id' => null, 'over' => null];
        }

        $category = $categoryId ? BudgetCategory::where('wallet_id', $wallet->id)->find($categoryId) : null;
        if ($categoryId && !$category) {
            throw ValidationException::withMessages(['budget_category_id' => 'Choose one of this wallet\'s categories.']);
        }

        $member = $this->member($wallet, $user);
        $allowed = $member?->permissions['categories'] ?? null;
        if (is_array($allowed)) {
            $names = BudgetCategory::whereIn('id', $allowed)->pluck('name')->join(', ', ' and ');
            if (!$category) {
                throw ValidationException::withMessages(['budget_category_id' => "Choose what this is for — you can spend on {$names}."]);
            }
            if (!in_array($category->id, $allowed, true)) {
                throw ValidationException::withMessages(['budget_category_id' => "You can only spend on {$names} from {$wallet->name}."]);
            }
        }
        if ($approved) {
            return ['category_id' => $category?->id, 'over' => null];
        }

        $over = null;
        $daily = $member?->permissions['daily_limit'] ?? null;
        $since = $this->periodStart($wallet);
        if ($daily !== null && $this->spent($wallet, now()->startOfDay(), null, $user->id) + $amount > (int) $daily) {
            $over = "over your {$this->naira((int) $daily)} a day";
        } elseif ($category && $this->spent($wallet, $since, $category->id) + $amount > $category->limit) {
            $left = max(0, $category->limit - $this->spent($wallet, $since, $category->id));
            $over = "over the {$category->name} limit — {$this->naira($left)} left";
        } elseif ($this->spent($wallet, $since) + $amount > (int) $budget['amount']) {
            $over = 'over the ' . $this->naira((int) $budget['amount']) . ' budget';
        }

        if ($over && ($budget['over_limit'] ?? 'approve') === 'stop') {
            throw ValidationException::withMessages(['amount' => "That's {$over}. Nothing goes over the limit."]);
        }

        return ['category_id' => $category?->id, 'over' => $over];
    }

    /** After a payment left: tag it with its category and tell the owners what crossed a line. */
    public function recorded(Wallet $wallet, ?string $reference, ?int $categoryId): void
    {
        if (!$wallet->budget()) {
            return;
        }
        if ($reference && $categoryId) {
            Transaction::where('wallet_id', $wallet->id)->where('reference', $reference)->update(['budget_category_id' => $categoryId]);
        }
        $this->alerts($wallet->fresh(), $categoryId);
    }

    /** SPD-06: half spent, 80% spent, a category runs out — each once a period. */
    private function alerts(Wallet $wallet, ?int $categoryId): void
    {
        $budget = $wallet->budget();
        $alerts = $budget['alerts'] ?? [];
        $start = $this->periodStart($wallet);
        $key = $start->toDateString();
        $sent = ($budget['alerts_sent']['period'] ?? null) === $key ? ($budget['alerts_sent']['keys'] ?? []) : [];
        $spent = $this->spent($wallet, $start);
        $amount = (int) $budget['amount'];
        $new = [];

        foreach (['eighty' => 80, 'half' => 50] as $alert => $pct) {
            if (!empty($alerts[$alert]) && !in_array($alert, $sent, true) && $spent * 100 >= $amount * $pct) {
                $new[] = $alert;
                $this->tellOwners($wallet, "{$pct}% of {$wallet->name} is spent", "{$this->naira($spent)} of {$this->naira($amount)} is gone this " . ($budget['period'] === 'weekly' ? 'week' : 'month') . '.');
                if ($alert === 'eighty') {
                    $new[] = 'half'; // no "half spent" after "80% spent"
                }
                break;
            }
        }
        if ($categoryId && !empty($alerts['category_out']) && !in_array("cat:{$categoryId}", $sent, true)) {
            $category = BudgetCategory::find($categoryId);
            if ($category && $this->spent($wallet, $start, $category->id) >= $category->limit) {
                $new[] = "cat:{$categoryId}";
                $this->tellOwners($wallet, "{$category->name} has run out", "All {$this->naira($category->limit)} for {$category->name} in {$wallet->name} is spent.");
            }
        }

        if ($new) {
            $meta = $wallet->meta;
            $meta['budget']['alerts_sent'] = ['period' => $key, 'keys' => array_values(array_unique([...$sent, ...$new]))];
            $wallet->update(['meta' => $meta]);
        }
    }

    private function owners(Wallet $wallet): Collection
    {
        $ids = $wallet->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id')->push($wallet->user_id)->unique();

        return User::whereIn('id', $ids)->get();
    }

    private function tellOwners(Wallet $wallet, string $title, string $body): void
    {
        foreach ($this->owners($wallet) as $user) {
            $this->notifications->push($user, 'budget_alert', $title, $body, ['wallet_id' => $wallet->id]);
        }
    }

    // ------------------------------------------------------------- scheduled

    /**
     * A new period began: what's left stays, goes back to Main or moves to the
     * chosen wallet (SPD-02 "Leftover at month end"). Runs before the top-up rule
     * on the same day. Idempotent per period.
     */
    public function roll(?Carbon $now = null): array
    {
        $now = $now ?? now();
        $results = [];
        Wallet::where('type', 'spending')->where('status', 'active')->get()->each(function (Wallet $wallet) use ($now, &$results) {
            $budget = $wallet->budget();
            if (!$budget || $budget['period'] === 'one_off') {
                return;
            }
            $key = $this->periodStart($wallet, $now)->toDateString();
            if (($budget['period_key'] ?? null) === $key) {
                return;
            }

            $moved = null;
            $leftover = $budget['leftover'] ?? ['mode' => 'keep'];
            $to = match ($leftover['mode'] ?? 'keep') {
                'main' => $wallet->owner?->mainWallet(),
                'wallet' => Wallet::where('id', (int) ($leftover['wallet_id'] ?? 0))->where('user_id', $wallet->user_id)->where('status', 'active')->first(),
                default => null,
            };
            $available = $wallet->availableToSpend();
            if ($to && $wallet->owner && $available > 0) {
                try {
                    $result = $this->wallets->transferBetweenWallets($wallet, $to, $available, $wallet->owner, "Left over from {$wallet->name}");
                    Transaction::where('wallet_id', $wallet->id)->where('reference', $result['reference'])->update(['meta' => ['budget_internal' => true]]);
                    $moved = $available;
                    $this->tellOwners($wallet, "{$this->naira($available)} left over in {$wallet->name}", "It moved to {$to->name}. A new budget starts today.");
                } catch (\Throwable $e) {
                    report($e);
                }
            }

            $meta = $wallet->fresh()->meta;
            $meta['budget']['period_key'] = $key;
            $wallet->update(['meta' => $meta]);
            $results[] = ['wallet_id' => $wallet->id, 'period' => $key, 'moved' => $moved];
        });

        return $results;
    }

    /** SPD-06 "Weekly summary — Sunday evening". */
    public function weeklySummary(): int
    {
        $sent = 0;
        Wallet::where('type', 'spending')->where('status', 'active')->get()->each(function (Wallet $wallet) use (&$sent) {
            $budget = $wallet->budget();
            if (!$budget || empty($budget['alerts']['weekly'])) {
                return;
            }
            $start = $this->periodStart($wallet);
            $spent = $this->spent($wallet, $start);
            $week = $this->spent($wallet, now()->subDays(6)->startOfDay());
            $low = $wallet->budgetCategories()->get()
                ->map(fn (BudgetCategory $c) => [$c, $c->limit - $this->spent($wallet, $start, $c->id)])
                ->sortBy(fn ($pair) => $pair[1] / max(1, $pair[0]->limit))
                ->first();
            $body = "{$this->naira($week)} spent this week, {$this->naira($spent)} of {$this->naira((int) $budget['amount'])} so far."
                . ($low ? " {$low[0]->name} has {$this->naira(max(0, $low[1]))} left." : '');
            $this->tellOwners($wallet, "{$wallet->name} this week", $body);
            $sent++;
        });

        return $sent;
    }

    // ----------------------------------------------------------------- detail

    /** WAL-09 "Spending limits": the period, what's spent per category, who has what limit. */
    public function detail(Wallet $wallet, User $viewer): ?array
    {
        $budget = $wallet->budget();
        if (!$budget) {
            return null;
        }
        $start = $this->periodStart($wallet);
        $members = $wallet->members()->with('user')->where('status', 'active')->get();
        $categories = $wallet->budgetCategories()->get();
        $names = $categories->pluck('name', 'id');

        $limits = fn (?array $permissions) => [
            'categories' => is_array($permissions['categories'] ?? null) ? collect($permissions['categories'])->map(fn ($id) => $names[$id] ?? null)->filter()->values() : null,
            'daily_limit' => isset($permissions['daily_limit']) ? number_format($permissions['daily_limit'] / 100, 2, '.', '') : null,
        ];
        $spenders = $members->filter(fn (WalletMember $m) => !in_array($m->role, ['viewer', 'owner'], true) && $m->user_id !== $wallet->user_id)
            ->map(fn (WalletMember $m) => [
                'user_id' => $m->user_id,
                'name' => $m->user?->fullName(),
                'role' => $m->role,
                'can_spend' => $wallet->canSpend($m->user),
                'pending' => false,
            ] + $limits($m->permissions))
            ->values();
        // Invited but not joined yet: their limits are already set.
        $invited = $wallet->invitations()->with('invitee')->where('status', 'pending')->where('role', '!=', 'viewer')->get()
            ->map(fn ($i) => [
                'user_id' => $i->invitee_user_id,
                'name' => $i->invitee?->fullName() ?? $i->invitee_identifier,
                'role' => $i->role,
                'can_spend' => false,
                'pending' => true,
            ] + $limits($i->permissions));

        return [
            'amount' => number_format($budget['amount'] / 100, 2, '.', ''),
            'period' => $budget['period'],
            'start_day' => $budget['start_day'],
            'period_start' => $start->toDateString(),
            'next_period_start' => $this->nextPeriodStart($wallet)?->toDateString(),
            'leftover' => $budget['leftover'] + ['wallet_name' => isset($budget['leftover']['wallet_id']) ? Wallet::find($budget['leftover']['wallet_id'])?->name : null],
            'funding' => $budget['funding'],
            'alerts' => $budget['alerts'],
            'over_limit' => $budget['over_limit'],
            'spent' => number_format($this->spent($wallet, $start) / 100, 2, '.', ''),
            'categories' => $categories->map(fn (BudgetCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'limit' => number_format($c->limit / 100, 2, '.', ''),
                'spent' => number_format($this->spent($wallet, $start, $c->id) / 100, 2, '.', ''),
            ])->values(),
            'spenders' => $spenders->concat($invited)->values(),
            'viewers' => $members->where('role', 'viewer')->map(fn (WalletMember $m) => $m->user?->fullName())->values(),
            'me' => [
                'categories' => $this->member($wallet, $viewer)?->permissions['categories'] ?? null,
                'daily_limit' => ($d = $this->member($wallet, $viewer)?->permissions['daily_limit'] ?? null) !== null ? number_format($d / 100, 2, '.', '') : null,
            ],
        ];
    }
}
