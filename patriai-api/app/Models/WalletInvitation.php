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
        'permissions',
        'pledge_amount',
        'pledge_kind',
        'keyholder',
        'status',
        'token',
        'code',
        'expires_at',
        'responded_at',
        'opened_at',
        'decline_reason',
        'message',
        'access_until',
        'group_key',
    ];

    /** "a co-owner", "a contributor", "an approver" — for messages. */
    public function roleName(): string
    {
        $name = str_replace('_', '-', (string) $this->role);

        return (preg_match('/^[aeiou]/i', $name) ? 'an ' : 'a ') . $name;
    }

    protected function casts(): array
    {
        return [
            'can_approve' => 'boolean',
            'permissions' => 'array',
            'pledge_amount' => 'integer',
            'keyholder' => 'boolean',
            'expires_at' => 'datetime',
            'responded_at' => 'datetime',
            'opened_at' => 'datetime',
            'access_until' => 'date',
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

    /** INV-04 "This invite has expired": pending but past its date. */
    public function isExpired(): bool
    {
        return $this->status === 'expired' || ($this->status === 'pending' && $this->expires_at && $this->expires_at->isPast());
    }

    /** INV-01 "patriai.app/i/K7Q2": the invite's own link. */
    public function link(): ?string
    {
        return $this->code ? rtrim((string) config('app.url'), '/') . '/i/' . $this->code : null;
    }
}
