<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Wallet extends Model
{
    public const TYPES = ['main', 'shared', 'project'];

    protected $fillable = [
        'user_id',
        'type',
        'name',
        'currency',
        'balance',
        'virtual_account',
        'virtual_account_bank',
        'status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'balance' => 'integer',
            'meta' => 'array',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(WalletMember::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /** Can the given user operate on this wallet (owner or active member)? */
    public function isAccessibleBy(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        return $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }

    /** Naira string, e.g. "1500.00" */
    public function balanceNaira(): string
    {
        return number_format($this->balance / 100, 2, '.', '');
    }
}
