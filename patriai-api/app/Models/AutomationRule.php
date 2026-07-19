<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutomationRule extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'from_wallet_id',
        'to_wallet_id',
        'amount',
        'frequency',
        'day_of_week',
        'day_of_month',
        'min_balance',
        'enabled',
        'last_run_period',
        'last_run_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'day_of_week' => 'integer',
            'day_of_month' => 'integer',
            'min_balance' => 'integer',
            'enabled' => 'boolean',
            'last_run_at' => 'datetime',
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
        if (!$this->enabled) {
            return false;
        }

        if (!$this->scheduleMatches($now)) {
            return false;
        }

        return $this->last_run_period !== $this->currentPeriod($now);
    }

    /** Does the calendar schedule (frequency + day) line up with $now? */
    private function scheduleMatches(Carbon $now): bool
    {
        return match ($this->frequency) {
            // ISO weekday: 1 = Monday ... 7 = Sunday.
            'weekly' => (int) $this->day_of_week === $now->isoWeekday(),
            'monthly' => (int) $this->day_of_month === $now->day,
            // daily fires every day.
            default => true,
        };
    }
}
