<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** PLN-02/03 a family's subscription to a paid plan: trial, renewals, cancelling. */
class Subscription extends Model
{
    /** Still giving the plan: on trial, paid, or a payment failed but within the grace days. */
    public const LIVE = ['trialing', 'active', 'past_due'];

    protected $fillable = ['user_id', 'plan_id', 'interval', 'status', 'price', 'trial_ends_at', 'current_period_end', 'cancel_at_period_end', 'next_interval', 'pay_wallet_id', 'reminded_at', 'failed_at', 'failure', 'ended_at'];

    protected function casts(): array
    {
        return [
            'price' => 'integer',
            'trial_ends_at' => 'datetime',
            'current_period_end' => 'datetime',
            'cancel_at_period_end' => 'boolean',
            'reminded_at' => 'datetime',
            'failed_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function payWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'pay_wallet_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }
}
