<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One payment on a giving date to one recipient: paid, failed, skipped, or
 * awaiting the giver's yes ("Ask me before each payment").
 */
class GivingPayment extends Model
{
    protected $fillable = ['wallet_id', 'schedule_id', 'saved_account_id', 'amount', 'status', 'period', 'transaction_id', 'receipt_no', 'note'];

    protected function casts(): array
    {
        return ['amount' => 'integer'];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(GivingSchedule::class);
    }

    public function savedAccount(): BelongsTo
    {
        return $this->belongsTo(SavedAccount::class);
    }
}
