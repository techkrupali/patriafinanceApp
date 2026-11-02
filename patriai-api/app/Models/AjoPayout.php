<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A round's pot, paid to that round's member on the day. */
class AjoPayout extends Model
{
    protected $fillable = ['circle_id', 'round', 'member_id', 'pay_on', 'amount', 'paid_at'];

    protected function casts(): array
    {
        return ['pay_on' => 'date', 'paid_at' => 'datetime', 'amount' => 'integer', 'round' => 'integer'];
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(AjoMember::class, 'member_id');
    }
}
