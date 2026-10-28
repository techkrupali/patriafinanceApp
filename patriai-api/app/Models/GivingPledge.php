<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** GIV-05: a promise ("Church building fund, ₦500,000") paid off in parts. */
class GivingPledge extends Model
{
    protected $fillable = ['wallet_id', 'name', 'total', 'paid_before', 'due_date', 'saved_account_id', 'group_id', 'plan', 'status'];

    protected function casts(): array
    {
        return ['total' => 'integer', 'paid_before' => 'integer', 'due_date' => 'date'];
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

    public function schedules(): HasMany
    {
        return $this->hasMany(GivingSchedule::class, 'pledge_id');
    }

    /** Paid so far: before Patriai plus every pledge part that went out. */
    public function paid(): int
    {
        $parts = (int) GivingPayment::whereIn('schedule_id', $this->schedules()->pluck('id'))->where('status', 'paid')->sum('amount');

        return $this->paid_before + $parts;
    }
}
