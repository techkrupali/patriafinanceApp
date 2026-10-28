<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmergencySetting extends Model
{
    public const PURPOSES = ['medical', 'funeral', 'travel', 'legal', 'other'];

    /** EMG-03 "Requests expire after". */
    public const EXPIRY_HOURS = [6, 24, 48, 72];

    /** EMG-04 "How often": one fast release every N days. */
    public const FAST_RELEASE_DAYS = [7, 14, 30, 60];

    protected $fillable = [
        'wallet_id',
        'purpose',
        'purposes',
        'dual_approval',
        'approver_user_id',
        'keyholder_ids',
        'required_keyholders',
        'request_expiry_hours',
        'fast_release_limit',
        'fast_release_every_days',
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
            'purposes' => 'array',
            'keyholder_ids' => 'array',
            'required_keyholders' => 'integer',
            'request_expiry_hours' => 'integer',
            'fast_release_limit' => 'integer',
            'fast_release_every_days' => 'integer',
        ];
    }

    /**
     * Everyone who holds a key (EMG-03): the owner plus the people chosen. Rules
     * made before keyholders had one approver, the original dual approval.
     *
     * @return list<int>
     */
    public function keyholders(int $ownerId): array
    {
        $others = $this->keyholder_ids ?? ($this->dual_approval && $this->approver_user_id ? [$this->approver_user_id] : []);

        return array_values(array_unique([$ownerId, ...array_map('intval', $others)]));
    }

    /** Yeses a release needs; the request itself counts as the asker's yes. */
    public function requiredYeses(int $ownerId): int
    {
        $count = count($this->keyholders($ownerId));

        return max(1, min($count, $this->required_keyholders ?? 2));
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
