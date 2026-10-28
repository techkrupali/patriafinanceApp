<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A bank account someone saved for later (GIV-07, SND-16): checked with the bank
 * when it was added, filed under a category, maybe in groups ("Our churches").
 */
class SavedAccount extends Model
{
    public const CATEGORIES = ['family', 'friends', 'institutions', 'partners'];

    protected $fillable = ['user_id', 'organisation_id', 'nickname', 'account_name', 'account_number', 'bank_code', 'bank_name', 'category', 'listed'];

    protected function casts(): array
    {
        return ['listed' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function organisation(): BelongsTo
    {
        return $this->belongsTo(Organisation::class);
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(SavedAccountGroup::class, 'saved_account_group_items', 'saved_account_id', 'group_id');
    }

    /** "•••• 89" */
    public function maskedNumber(): string
    {
        return '•••• ' . substr($this->account_number, -2);
    }

    public function isVerified(): bool
    {
        return (bool) $this->organisation?->verified;
    }
}
