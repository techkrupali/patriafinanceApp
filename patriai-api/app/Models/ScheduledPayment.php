<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/** SND-14/15: a payment out on a date, once or on repeat. */
class ScheduledPayment extends Model
{
    public const FREQUENCIES = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

    public const TIMEZONE = 'Africa/Lagos';

    protected $fillable = [
        'user_id', 'from_wallet_id', 'destination', 'to_name', 'amount', 'note', 'budget_category_id', 'skip_if_over',
        'frequency', 'starts_at', 'ends_after', 'runs', 'next_run_at', 'status', 'last_run_at', 'last_result', 'last_reason', 'last_reference',
        'name', 'week_of_month', 'weekday', 'ends_on', 'confirm', 'short_policy', 'confirmed_for', 'confirmed_by', 'warned',
    ];

    protected $attributes = ['runs' => 0, 'status' => 'active', 'skip_if_over' => false];

    protected function casts(): array
    {
        return [
            'destination' => 'array',
            'amount' => 'integer',
            'skip_if_over' => 'boolean',
            'starts_at' => 'datetime',
            'next_run_at' => 'datetime',
            'last_run_at' => 'datetime',
            'ends_after' => 'integer',
            'runs' => 'integer',
            'week_of_month' => 'integer',
            'weekday' => 'integer',
            'ends_on' => 'date',
            'confirm' => 'array',
            'short_policy' => 'array',
            'confirmed_for' => 'datetime',
            'confirmed_by' => 'array',
            'warned' => 'array',
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

    /**
     * The n-th date (0 = the first), counted from the first so a monthly payment
     * on the 31st stays on the last day of shorter months rather than drifting.
     */
    public function occurrence(int $n): ?Carbon
    {
        $start = $this->starts_at->copy();
        // RUL-03 "First Sunday of the month, 7:00 am".
        if ($this->week_of_month && $this->weekday && in_array($this->frequency, ['monthly', 'quarterly', 'yearly'], true)) {
            $months = match ($this->frequency) { 'quarterly' => 3 * $n, 'yearly' => 12 * $n, default => $n };
            $local = $start->copy()->setTimezone(self::TIMEZONE);
            $at = $this->nthWeekday($local->copy()->startOfMonth()->addMonthsNoOverflow($months), $local->hour, $local->minute);
            // The first one is never before the start.
            if ($n === 0 && $at->lt($local)) {
                $at = $this->nthWeekday($local->copy()->startOfMonth()->addMonthNoOverflow(), $local->hour, $local->minute);
            }

            return $this->beforeEnd($at->utc());
        }

        return $this->beforeEnd(match ($this->frequency) {
            'once' => $n === 0 ? $start : null,
            'weekly' => $start->addWeeks($n),
            'biweekly' => $start->addWeeks(2 * $n),
            'monthly' => $start->addMonthsNoOverflow($n),
            'quarterly' => $start->addMonthsNoOverflow(3 * $n),
            'yearly' => $start->addYearsNoOverflow($n),
            default => null,
        });
    }

    /** RUL-03 "Ends: on a date". */
    private function beforeEnd(?Carbon $at): ?Carbon
    {
        return $at && $this->ends_on && $at->copy()->setTimezone(self::TIMEZONE)->startOfDay()->gt($this->ends_on) ? null : $at;
    }

    /** The first/second/…/last weekday of $month, at the time given (Lagos). */
    private function nthWeekday(Carbon $month, int $hour, int $minute): Carbon
    {
        $day = $month->copy()->startOfMonth();
        if ($this->week_of_month >= 5) {
            $day = $month->copy()->endOfMonth()->startOfDay();
            while ($day->isoWeekday() !== $this->weekday) {
                $day->subDay();
            }
        } else {
            while ($day->isoWeekday() !== $this->weekday) {
                $day->addDay();
            }
            $day->addWeeks($this->week_of_month - 1);
        }

        return $day->setTime($hour, $minute);
    }

    /** The dates between $from and $to it will still pay on (SND-15 "goes out in the next 30 days"). */
    public function datesBetween(Carbon $from, Carbon $to): array
    {
        if ($this->status !== 'active' || !$this->next_run_at) {
            return [];
        }
        $out = [];
        for ($n = $this->runs; count($out) < 60; $n++) {
            if ($this->ends_after !== null && $n >= $this->ends_after) {
                break;
            }
            $at = $this->occurrence($n);
            if (!$at || $at->gt($to)) {
                break;
            }
            if ($at->gte($from)) {
                $out[] = $at;
            }
        }

        return $out;
    }

    /** "Every Saturday" · "Every 2 weeks, Saturday" · "Monthly, 1st" · "Quarterly, 15th" · "Yearly, 6 Jan" · "6 Jan 2027, once". */
    public function when(): string
    {
        $at = $this->starts_at->copy()->setTimezone(self::TIMEZONE);

        if ($this->week_of_month && $this->weekday) {
            $which = [1 => 'First', 2 => 'Second', 3 => 'Third', 4 => 'Fourth', 5 => 'Last'][$this->week_of_month] ?? 'First';
            $day = Carbon::create(2026, 1, 4 + $this->weekday)->format('l');

            return "{$which} {$day} of the " . ($this->frequency === 'quarterly' ? 'quarter' : ($this->frequency === 'yearly' ? 'year' : 'month')) . ', ' . strtolower($at->format('g:i a'));
        }

        return match ($this->frequency) {
            'weekly' => 'Every ' . $at->format('l'),
            'biweekly' => 'Every 2 weeks, ' . $at->format('l'),
            'monthly' => 'Monthly, ' . $at->format('jS'),
            'quarterly' => 'Quarterly, ' . $at->format('jS'),
            'yearly' => 'Yearly, ' . $at->format('j M'),
            default => $at->format('j M Y') . ', once',
        };
    }
}
