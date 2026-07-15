<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WalletInvitation extends Model
{
    protected $fillable = [
        'wallet_id',
        'inviter_id',
        'invitee_user_id',
        'invitee_identifier',
        'role',
        'can_approve',
        'status',
        'token',
        'expires_at',
        'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'can_approve' => 'boolean',
            'expires_at' => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inviter_id');
    }

    public function invitee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invitee_user_id');
    }
}
