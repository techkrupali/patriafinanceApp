<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One payment for a subscription (the receipt), or a failed try. */
class SubscriptionPayment extends Model
{
    protected $fillable = ['subscription_id', 'user_id', 'amount', 'interval', 'status', 'reference', 'transaction_id', 'failure', 'period_start', 'period_end'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'period_start' => 'datetime', 'period_end' => 'datetime'];
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
