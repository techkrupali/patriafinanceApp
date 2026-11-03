<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

/**
 * A verification tier and its limits (ME-11, ME-23). Tiers 1–3 have their own
 * forms in the app (BVN; NIN and selfie; ID and address); a tier added by an
 * admin (Tier 4 …) is asked for with a note and documents and checked by the
 * team. Money in kobo; null means no limit.
 */
class KycTier extends Model
{
    /** The tiers with their own forms in the app; they can't be removed. */
    public const BASE_LEVELS = [1, 2, 3];

    private const CACHE_KEY = 'kyc_tiers.v1';

    protected $fillable = ['level', 'name', 'needs', 'description', 'daily', 'single', 'max_balance', 'max_wallets', 'shared_wallets', 'loan_cap', 'updated_by'];

    protected function casts(): array
    {
        return [
            'level' => 'integer',
            'daily' => 'integer',
            'single' => 'integer',
            'max_balance' => 'integer',
            'max_wallets' => 'integer',
            'shared_wallets' => 'boolean',
            'loan_cap' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn () => self::forget());
        static::deleted(fn () => self::forget());
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * Every tier, lowest first, as plain arrays (cached; empty before the
     * table exists so code defaults still work).
     *
     * @return Collection<int, array<string, mixed>>
     */
    public static function catalogue(): Collection
    {
        $rows = Cache::remember(self::CACHE_KEY, 600, function () {
            if (!Schema::hasTable('kyc_tiers')) {
                return [];
            }

            return self::orderBy('level')->get()->map(fn (self $t) => $t->only(['level', 'name', 'needs', 'description', 'daily', 'single', 'max_balance', 'max_wallets', 'shared_wallets', 'loan_cap']))->all();
        });

        return collect($rows);
    }

    /** The highest tier there is (3 until an admin adds one). */
    public static function maxLevel(): int
    {
        return (int) (self::catalogue()->max('level') ?? 3);
    }
}
