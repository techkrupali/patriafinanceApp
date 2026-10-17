<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmergencySetting extends Model
{
    public const PURPOSES = ['medical', 'funeral', 'travel', 'legal', 'other'];

    protected $fillable = [
        'wallet_id',
        'purpose',
        'dual_approval',
        'approver_user_id',
        'unlock_on_document',
        'manual_unlock',
        'unlock_reason',
        'emergency_pin',
        'override_national_crisis',
        'override_high_balance',
        'override_balance_threshold',
        'beneficiary_note',
        'unlocked_at',
        'unlocked_via',
        'unlocked_by',
    ];

    protected $hidden = ['emergency_pin'];

    protected function casts(): array
    {
        return [
            'dual_approval' => 'boolean',
            'unlock_on_document' => 'boolean',
            'manual_unlock' => 'boolean',
            'override_national_crisis' => 'boolean',
            'override_high_balance' => 'boolean',
            'override_balance_threshold' => 'integer',
            'unlocked_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }

    public function isLocked(): bool
    {
        return $this->unlocked_at === null;
    }
}
