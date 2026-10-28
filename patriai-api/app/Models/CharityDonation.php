<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The charity's half of an early-break fee (BRK-04 "₦1,250 to Hope Harbour
 * Children's Home"). Owed until Patriai pays the charity; the receipt number
 * goes on the saver's giving statement.
 */
class CharityDonation extends Model
{
    protected $fillable = ['organisation_id', 'user_id', 'wallet_id', 'transaction_id', 'amount', 'receipt_no', 'status', 'paid_at'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'paid_at' => 'datetime'];
    }

    public function organisation(): BelongsTo
    {
        return $this->belongsTo(Organisation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
