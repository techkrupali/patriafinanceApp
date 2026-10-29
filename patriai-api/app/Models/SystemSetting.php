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
