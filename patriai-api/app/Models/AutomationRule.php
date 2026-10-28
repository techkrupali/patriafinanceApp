<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutomationRule extends Model
{
    /**
     * schedule: on the calendar (frequency + day)
     * salary:   a share (percent) of each salary-sized bank deposit into Main
     * roundup:  spending from Main rounded up to roundup_to; swept daily
     * deposit:  a share (percent) of every bank deposit into from_wallet, any
     *           wallet (client: "percentage of deposits from 1 or more wallets")
     */
    public const TRIGGERS = ['schedule', 'salary', 'roundup', 'deposit'];

    protected $fillable = [
        'user_id',
        'name',
        'from_wallet_id',
        'to_wallet_id',
        'budget_category_id',
        'savings_contribution',
        'trigger',
        'amount',
        'fill_to',
        'percent',
        'roundup_to',
        'pending_amount',
        'frequency',
        'day_of_week',
        'interval_weeks',
        'day_of_month',
        'at_hour',
        'starts_on',
        'min_balance',
        'enabled',
        'last_run_period',
        'last_run_at',
        'retry_count',
        'retry_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'fill_to' => 'boolean',
            'day_of_week' => 'integer',
            'interval_weeks' => 'integer',
            'day_of_month' => 'integer',
            'at_hour' => 'integer',
            'starts_on' => 'date',
            'min_balance' => 'integer',
            'enabled' => 'boolean',
            'savings_contribution' => 'boolean',
            'percent' => 'integer',
            'roundup_to' => 'integer',
            'pending_amount' => 'integer',
            'last_run_at' => 'datetime',
            'retry_count' => 'integer',
            'retry_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function fromWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'from_wallet_id');
    }

    public function toWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'to_wallet_id');
    }

    /**
     * The period key for this rule's frequency at the given moment. This is the
     * idempotency bucket: a rule may move money at most once per distinct key.
     *   daily   => '2026-07-19'
     *   weekly  => '2026-W29'  (ISO year + ISO week)
     *   monthly => '2026-07'
     */
    public function currentPeriod(Carbon $now): string
    {
        return match ($this->frequency) {
            'weekly' => $now->format('o-\WW'),
            'monthly' => $now->format('Y-m'),
            default => $now->format('Y-m-d'),
        };
    }

    /**
     * Is this rule due to fire right now? It is due when it is enabled, its
     * frequency schedule matches $now, AND it has not already run for the current
     * period (last_run_period differs from the current period key). The
     * last_run_period comparison is the double-run guard; the runner re-checks it
     * again under a row lock before moving any money.
     */
    public function isDue(Carbon $now): bool
    {
        // Salary and deposit rules fire when the money lands, never on the calendar.
        if (!$this->enabled || in_array($this->trigger, ['salary', 'deposit'], true)) {
            return false;
        }

        // A missed save trying again (SAV-06 "Try again in 3 days").
        if ($this->isRetryDue($now)) {
            return true;
        }

        if (!$this->scheduleMatches($now)) {
            return false;
        }
        // CHW-02 "Every Monday at 7:00 am" (Lagos time).
        if ($this->at_hour !== null && $now->copy()->setTimezone('Africa/Lagos')->hour < $this->at_hour) {
            return false;
        }

        return $this->last_run_period !== $this->currentPeriod($now);
    }

    /**
     * The next day (from $from's date on) this rule will move money, or null
     * when paused. A day whose period already ran is skipped, the same guard
     * isDue() uses.
     */
    public function nextRunOn(Carbon $from): ?Carbon
    {
        if (!$this->enabled) {
            return null;
        }

        $day = $from->copy()->startOfDay();
        for ($i = 0; $i < 62; $i++) {
            if ($this->scheduleMatches($day) && $this->last_run_period !== $this->currentPeriod($day)) {
                return $day;
            }
            $day = $day->copy()->addDay();
        }

        return null;
    }

    public function isRetryDue(Carbon $now): bool
    {
        return $this->retry_at !== null && $this->retry_at->lte($now);
    }

    /** Does the calendar schedule (frequency + day) line up with $now? */
    private function scheduleMatches(Carbon $now): bool
    {
        // Nothing before the first run (CHW-02 "First payment: Monday, 26 Oct").
        if ($this->starts_on !== null && $now->copy()->startOfDay()->lt($this->starts_on)) {
            return false;
        }

        return match ($this->frequency) {
            // ISO weekday: 1 = Monday ... 7 = Sunday; every N weeks from the first run.
            'weekly' => (int) $this->day_of_week === $now->isoWeekday() && $this->onWeek($now),
            'monthly' => (int) $this->day_of_month === $now->day,
            // daily fires every day.
            default => true,
        };
    }

    /** "Every 2 weeks": only the weeks counted from the first run. */
    private function onWeek(Carbon $now): bool
    {
        $every = max(1, (int) $this->interval_weeks);
        if ($every === 1 || $this->starts_on === null) {
            return true;
        }
        $weeks = intdiv((int) $this->starts_on->copy()->startOfWeek()->diffInDays($now->copy()->startOfWeek()), 7);

        return $weeks % $every === 0;
    }
}
