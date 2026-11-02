<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Someone saved for later (GIV-07, SND-16, BEN-01): a bank account checked with
 * the bank when it was added, or a Patriai user ("Emeka · Patriai · @emeka"),
 * filed under a category, maybe in groups ("Our churches").
 */
class SavedAccount extends Model
{
    public const CATEGORIES = ['family', 'friends', 'institutions', 'partners'];

    protected $fillable = ['user_id', 'organisation_id', 'payee_user_id', 'nickname', 'account_name', 'account_number', 'bank_code', 'bank_name', 'category', 'listed'];

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

    /** A Patriai user paid straight into their Main wallet. */
    public function payee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'payee_user_id');
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(SavedAccountGroup::class, 'saved_account_group_items', 'saved_account_id', 'group_id')->withPivot('share');
    }

    public function isPatriai(): bool
    {
        return $this->payee_user_id !== null;
    }

    /** "•••• 89" (a Patriai user has no account number to show). */
    public function maskedNumber(): string
    {
        return $this->account_number ? '•••• ' . substr($this->account_number, -2) : '';
    }

    public function isVerified(): bool
    {
        return (bool) $this->organisation?->verified;
    }
}
