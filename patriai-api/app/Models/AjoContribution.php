<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One member's payment into one round's pot (AJO-03 "This round"). */
class AjoContribution extends Model
{
    protected $fillable = ['circle_id', 'member_id', 'round', 'due_on', 'amount', 'fee', 'status', 'late', 'tried_on', 'paid_at', 'reference', 'settled'];

    protected function casts(): array
    {
        return [
            'due_on' => 'date',
            'tried_on' => 'date',
            'paid_at' => 'datetime',
            'late' => 'boolean',
            'settled' => 'boolean',
            'amount' => 'integer',
            'fee' => 'integer',
            'round' => 'integer',
        ];
    }

    public function circle(): BelongsTo
    {
        return $this->belongsTo(AjoCircle::class, 'circle_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(AjoMember::class, 'member_id');
    }

    /** What it takes to pay it now: the contribution, plus the late fee once it applies. */
    public function total(): int
    {
        return $this->amount + $this->fee;
    }
}
