<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * FAM-01 "Okafor family circle", FAM-11 "Eze siblings": people and the wallets
 * they share. A wallet with no circle belongs to its owner's home circle.
 */
class Circle extends Model
{
    public const KINDS = ['family', 'extended', 'siblings', 'ajo', 'friends', 'community'];

    protected $fillable = [
        'created_by', 'owner_id', 'name', 'kind', 'purpose', 'is_home',
        'pending_owner_id', 'transfer_requested_at', 'transfer_accepted_at', 'transfer_effective_at',
    ];

    protected function casts(): array
    {
        return [
            'is_home' => 'boolean',
            'transfer_requested_at' => 'datetime',
            'transfer_accepted_at' => 'datetime',
            'transfer_effective_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function pendingOwner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pending_owner_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(CircleMember::class);
    }

    public function wallets(): HasMany
    {
        return $this->hasMany(Wallet::class);
    }
}
