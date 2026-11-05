<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Platform-wide switches the admin sets (SYS-02 minimum app version, SYS-03
 * maintenance, the support phone). Read through get(), which falls back to
 * the default when nothing is stored.
 */
class SystemSetting extends Model
{
    protected $fillable = ['key', 'value', 'updated_by'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }

    public const DEFAULTS = [
        'min_app_version' => '1.0.0',
        'latest_app_version' => '1.0.0',
        'maintenance' => ['on' => false, 'until' => null, 'message' => null],
        'support_phone' => null,
        // PLN-01: hold families on Free to Free's limits (off until the business decides).
        'plans_enforce' => false,
        // PLN-01 "Free · Pro" rows: what each plan gives, as people read it, by plan slug.
        'plan_features' => [
            ['label' => 'Wallets', 'values' => ['free' => 'Up to 3', 'pro' => 'Up to 20']],
            ['label' => 'Shared wallets', 'values' => ['free' => '1', 'pro' => 'Unlimited']],
            ['label' => 'Rules', 'values' => ['free' => '2, simple', 'pro' => 'Unlimited, multi-step']],
            ['label' => 'Steward', 'values' => ['free' => '20 questions a month', 'pro' => 'Unlimited, remembers']],
            ['label' => 'Reports', 'values' => ['free' => 'Basic', 'pro' => 'Full, with forecasts']],
            ['label' => 'Sync', 'values' => ['free' => 'CSV download', 'pro' => 'Sheets, QuickBooks, Drive']],
            ['label' => 'History', 'values' => ['free' => '6 months', 'pro' => 'Everything']],
        ],
    ];

    public static function get(string $key): mixed
    {
        $row = static::where('key', $key)->first();

        return $row ? ($row->value['v'] ?? null) : (self::DEFAULTS[$key] ?? null);
    }

    public static function put(string $key, mixed $value, ?int $by = null): void
    {
        static::updateOrCreate(['key' => $key], ['value' => ['v' => $value], 'updated_by' => $by]);
    }
}
