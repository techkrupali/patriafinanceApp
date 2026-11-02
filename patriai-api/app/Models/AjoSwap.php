<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** AJO-02 "Allow members to swap turns · Both people must agree". */
class AjoSwap extends Model
{
    protected $fillable = ['circle_id', 'from_member_id', 'to_member_id', 'status', 'responded_at'];

    protected function casts(): array
    {
        return ['responded_at' => 'datetime'];
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(AjoMember::class, 'from_member_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(AjoMember::class, 'to_member_id');
    }
}
