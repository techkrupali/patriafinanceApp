<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** An ajo circle (AJO-01): rotating savings with a pot Patriai holds. Amounts are kobo. */
class AjoCircle extends Model
{
    public const FREQUENCIES = ['weekly', 'monthly'];

    public const MIN_SIZE = 2;

    public const MAX_SIZE = 30;

    /** AJO-04 "Miss 3 rounds and you lose your turn." */
    public const MISSES_TO_LOSE_TURN = 3;

    protected $fillable = [
        'wallet_id', 'organiser_id', 'contribution', 'frequency', 'size', 'starts_on', 'late_fee', 'late_after_days',
        'payout_after_days', 'order_mode', 'allow_swaps', 'status', 'code', 'conversation_id', 'started_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'allow_swaps' => 'boolean',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'contribution' => 'integer',
            'late_fee' => 'integer',
            'size' => 'integer',
            'late_after_days' => 'integer',
            'payout_after_days' => 'integer',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function organiser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'organiser_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(AjoMember::class, 'circle_id');
    }

    public function contributions(): HasMany
    {
        return $this->hasMany(AjoContribution::class, 'circle_id');
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(AjoPayout::class, 'circle_id');
    }

    public function swaps(): HasMany
    {
        return $this->hasMany(AjoSwap::class, 'circle_id');
    }

    /** Members still in the circle (a member who lost their turn still pays). */
    public function activeMembers(): HasMany
    {
        return $this->members()->whereIn('status', ['active', 'lost_turn']);
    }

    /** "12 × ₦50,000": what each turn receives. */
    public function payoutAmount(?int $size = null): int
    {
        return $this->contribution * ($size ?? $this->size);
    }

    /** The day round $round's contributions are due ("On the 1st of every month"). */
    public function dueOn(int $round): Carbon
    {
        $start = $this->starts_on->copy()->startOfDay();

        return $this->frequency === 'weekly' ? $start->addWeeks($round - 1) : $start->addMonthsNoOverflow($round - 1);
    }

    /** "goes to Mama Chioma on 5 Nov": a few days after the due date. */
    public function payOn(int $round): Carbon
    {
        return $this->dueOn($round)->addDays($this->payout_after_days);
    }

    public function endsOn(): Carbon
    {
        return $this->dueOn($this->size);
    }

    /** The round whose due date has come (0 before the first; never past the last). */
    public function roundOn(Carbon $day): int
    {
        if (!in_array($this->status, ['active', 'completed'], true) || $day->lt($this->starts_on->copy()->startOfDay())) {
            return 0;
        }
        $round = 0;
        for ($r = 1; $r <= $this->size; $r++) {
            if ($this->dueOn($r)->lte($day)) {
                $round = $r;
            }
        }

        return $round;
    }
}
