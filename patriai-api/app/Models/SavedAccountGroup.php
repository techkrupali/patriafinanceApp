<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A named set of saved accounts paid together ("Our churches": split 50/50).
 * BEN-04: split evenly, by percent, or by fixed amounts (share on each item).
 */
class SavedAccountGroup extends Model
{
    public const SPLITS = ['even', 'percent', 'fixed'];

    protected $fillable = ['user_id', 'name', 'split'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function accounts(): BelongsToMany
    {
        return $this->belongsToMany(SavedAccount::class, 'saved_account_group_items', 'group_id', 'saved_account_id')->withPivot('share')->orderBy('saved_accounts.id');
    }

    /**
     * How a payment of $kobo is shared out: [saved_account_id => kobo]. Even and
     * percent splits give any rounding remainder to the first account; fixed
     * amounts are what they say (the total is their sum).
     */
    public function shares(int $kobo): array
    {
        $accounts = $this->accounts;
        if ($accounts->isEmpty()) {
            return [];
        }
        if ($this->split === 'fixed') {
            return $accounts->mapWithKeys(fn ($a) => [$a->id => (int) $a->pivot->share])->all();
        }
        $parts = $this->split === 'percent'
            ? $accounts->mapWithKeys(fn ($a) => [$a->id => intdiv($kobo * (int) $a->pivot->share, 100)])->all()
            : $accounts->mapWithKeys(fn ($a) => [$a->id => intdiv($kobo, $accounts->count())])->all();
        $parts[$accounts->first()->id] += $kobo - array_sum($parts);

        return $parts;
    }

    /** "split 50/50" · "split 70/30" · "₦30,000 + ₦15,000". */
    public function splitLabel(): string
    {
        $accounts = $this->accounts;
        return match ($this->split) {
            'percent' => 'split ' . $accounts->map(fn ($a) => (int) $a->pivot->share)->implode('/'),
            'fixed' => $accounts->map(fn ($a) => '₦' . number_format((int) $a->pivot->share / 100))->implode(' + '),
            default => 'split ' . ($accounts->count() ? implode('/', array_fill(0, $accounts->count(), (string) round(100 / $accounts->count()))) : ''),
        };
    }
}
