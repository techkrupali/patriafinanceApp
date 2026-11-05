<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** PLN-01 a plan (Free, Pro): prices, trial and limits, all set in admin. Prices are kobo. */
class Plan extends Model
{
    public const INTERVALS = ['monthly', 'yearly'];

    /** The limits a plan can set; null means no limit. */
    public const LIMITS = ['wallets', 'shared_wallets', 'rules'];

    protected $fillable = ['slug', 'name', 'covers', 'monthly_price', 'yearly_price', 'trial_days', 'is_free', 'active', 'position', 'limits'];

    protected function casts(): array
    {
        return [
            'monthly_price' => 'integer',
            'yearly_price' => 'integer',
            'trial_days' => 'integer',
            'is_free' => 'boolean',
            'active' => 'boolean',
            'position' => 'integer',
            'limits' => 'array',
        ];
    }

    public function price(string $interval): int
    {
        return $interval === 'yearly' ? $this->yearly_price : $this->monthly_price;
    }

    public function limit(string $feature): ?int
    {
        $v = ($this->limits ?? [])[$feature] ?? null;

        return $v === null ? null : (int) $v;
    }
}
