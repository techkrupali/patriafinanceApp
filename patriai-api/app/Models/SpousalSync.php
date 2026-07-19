<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SpousalSync extends Model
{
    protected $fillable = [
        'initiator_id',
        'partner_id',
        'partner_identifier',
        'transparency',
        'status',
        'shared_wallet_ids',
        'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'shared_wallet_ids' => 'array',
            'responded_at' => 'datetime',
        ];
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'partner_id');
    }

    /** Is the given user a party (initiator or partner) to this sync? */
    public function involves(User $user): bool
    {
        return $this->initiator_id === $user->id || $this->partner_id === $user->id;
    }
}
