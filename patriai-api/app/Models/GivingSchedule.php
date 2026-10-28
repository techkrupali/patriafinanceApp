<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

/**
 * GIV-04 a giving date: "Tithe · Our churches · ₦22,500 each · First Sunday",
 * "Sunday offering · every Sunday", "Monthly gift · on the 15th", or a pledge
 * part on one day. Payments go at 7:00 am; a group splits the amount evenly.
 */
class GivingSchedule extends Model
{
    public const FREQUENCIES = ['weekly', 'monthly', 'monthly_weekday', 'once'];

    private const DAYS = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    private const NTH = [1 => 'First', 2 => 'Second', 3 => 'Third', 4 => 'Fourth'];

    protected $fillable = [
        'wallet_id', 'label', 'amount', 'saved_account_id', 'group_id', 'frequency', 'day_of_week', 'day_of_month',
        'week_of_month', 'run_on', 'pledge_id', 'from_wallet_id', 'ask_first', 'enabled', 'last_run_period', 'last_run_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'day_of_week' => 'integer',
            'day_of_month' => 'integer',
            'week_of_month' => 'integer',
            'run_on' => 'date',
            'ask_first' => 'boolean',
            'enabled' => 'boolean',
            'last_run_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function savedAccount(): BelongsTo
    {
        return $this->belongsTo(SavedAccount::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(SavedAccountGroup::class, 'group_id');
    }

    public function pledge(): BelongsTo
    {
        return $this->belongsTo(GivingPledge::class);
    }

    public function fromWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'from_wallet_id');
    }

    /** Who this date pays: the one account, or everyone in the group. */
    public function payees(): Collection
    {
        if ($this->group_id) {
            return $this->group?->accounts ?? collect();
        }

        return collect(array_filter([$this->savedAccount]));
    }

    /** Is $day one of this schedule's giving dates? */
    public function fallsOn(Carbon $day): bool
    {
        return match ($this->frequency) {
            'weekly' => $day->isoWeekday() === (int) $this->day_of_week,
            'monthly' => $day->day === (int) $this->day_of_month,
            'monthly_weekday' => $day->isoWeekday() === (int) $this->day_of_week && (int) ceil($day->day / 7) === (int) $this->week_of_month,
            'once' => $this->run_on !== null && $day->toDateString() === $this->run_on->toDateString(),
            default => false,
        };
    }

    /** The next $count giving dates from $from (today included), skipping one already paid. */
    public function upcoming(Carbon $from, int $count = 1): Collection
    {
        $out = collect();
        if (!$this->enabled) {
            return $out;
        }
        $day = $from->copy()->startOfDay();
        for ($i = 0; $i < 400 && $out->count() < $count; $i++) {
            if ($this->fallsOn($day) && $this->last_run_period !== $day->toDateString()) {
                $out->push($day->copy());
            }
            if ($this->frequency === 'once' && $this->run_on && $day->toDateString() > $this->run_on->toDateString()) {
                break;
            }
            $day->addDay();
        }

        return $out;
    }

    /** "First Sunday", "Every Sunday", "On the 15th", "Wed 25 Nov". */
    public function when(): string
    {
        return match ($this->frequency) {
            'weekly' => 'Every ' . (self::DAYS[$this->day_of_week] ?? 'week'),
            'monthly' => 'On the ' . $this->ordinal((int) $this->day_of_month),
            'monthly_weekday' => (self::NTH[$this->week_of_month] ?? 'First') . ' ' . (self::DAYS[$this->day_of_week] ?? 'Sunday'),
            'once' => $this->run_on?->format('D j M') ?? 'Once',
            default => '',
        };
    }

    private function ordinal(int $n): string
    {
        $suffix = in_array($n % 100, [11, 12, 13], true) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');

        return $n . $suffix;
    }
}
