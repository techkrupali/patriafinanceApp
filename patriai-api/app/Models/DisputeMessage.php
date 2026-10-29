<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * DSP-06 one entry in a dispute's record: a message, the vendor's offer (fix by
 * a date, a partial refund, or disagree), a system note or Patriai's decision.
 */
class DisputeMessage extends Model
{
    protected $fillable = ['dispute_id', 'user_id', 'kind', 'body', 'offer'];

    protected function casts(): array
    {
        return ['offer' => 'array'];
    }

    public function dispute(): BelongsTo
    {
        return $this->belongsTo(Dispute::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
