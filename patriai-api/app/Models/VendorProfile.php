<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's public listing in the vendor directory (Directory-Based Discovery).
 * Families browse/search these profiles, then assign the vendor to a project via
 * the existing ProjectController::assignVendor flow. No money moves through this.
 */
class VendorProfile extends Model
{
    /** Directory categories the app filters by. */
    public const CATEGORIES = [
        'construction',
        'events',
        'catering',
        'education',
        'tech',
        'logistics',
        'fashion',
        'health',
        'other',
    ];

    protected $fillable = [
        'user_id',
        'business_name',
        'category',
        'bio',
        'location',
        'verified',
    ];

    protected function casts(): array
    {
        return [
            'verified' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
