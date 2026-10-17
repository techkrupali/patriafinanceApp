<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmergencyBeneficiary extends Model
{
    public const ROLES = ['beneficiary', 'fallback'];

    public const ACCESS_TYPES = ['immediate', 'delay_7d'];

    protected $fillable = [
        'wallet_id',
        'user_id',
        'position',
        'relationship',
        'role',
        'withdrawal_limit',
        'access_type',
        'withdrawn',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'withdrawal_limit' => 'integer',
            'withdrawn' => 'integer',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** When this beneficiary may start withdrawing, given the wallet's unlock time. */
    public function accessAvailableAt(?Carbon $unlockedAt): ?Carbon
    {
        if ($unlockedAt === null) {
            return null;
        }

        return $this->access_type === 'delay_7d' ? $unlockedAt->copy()->addDays(7) : $unlockedAt->copy();
    }

    /** Kobo still claimable under this beneficiary's limit (null = no cap). */
    public function remainingLimit(): ?int
    {
        if ($this->withdrawal_limit === null) {
            return null;
        }

        return max(0, $this->withdrawal_limit - $this->withdrawn);
    }
}
