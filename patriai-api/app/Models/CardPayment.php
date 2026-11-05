<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ADD-03/04/08/09: one top-up by card, from the checkout or a saved card to "Money added" or not. */
class CardPayment extends Model
{
    protected $fillable = ['user_id', 'wallet_id', 'saved_card_id', 'provider', 'reference', 'amount', 'fee', 'status', 'card_label', 'message', 'otp_tries', 'transaction_id', 'meta'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'fee' => 'integer', 'otp_tries' => 'integer', 'meta' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function savedCard(): BelongsTo
    {
        return $this->belongsTo(SavedCard::class);
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }

    /** What the card is charged: the amount plus the fee. */
    public function total(): int
    {
        return $this->amount + $this->fee;
    }
}
