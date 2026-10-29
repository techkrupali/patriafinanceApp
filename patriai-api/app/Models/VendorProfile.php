<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A user's public listing in the vendor directory (Directory-Based Discovery).
 * Families browse/search these profiles, then assign the vendor to a project via
 * the existing ProjectController::assignVendor flow. No money moves through this.
 */
class VendorProfile extends Model
{
    /** Directory categories the app filters by. */
    public const CATEGORIES = [
        // VDM-01 "What you do" (the directory filters: Builders, Tiling, Electrical…)
        'building',
        'tiling',
        'electrical',
        'plumbing',
        'events',
        'school',
        'catering',
        // Earlier directory categories, still on existing profiles.
        'construction',
        'education',
        'tech',
        'logistics',
        'fashion',
        'health',
        'other',
    ];

    /** VON-01…08 verification items, each approved or sent back by an admin. */
    public const CHECKS = ['owner', 'id_document', 'cac', 'directors', 'address', 'bank'];

    public const ID_TYPES = ['passport', 'drivers_licence', 'voters_card', 'national_id'];

    public const DOCUMENT_ITEMS = ['selfie', 'id_front', 'id_back', 'cac_certificate', 'cac_status_report', 'memorandum', 'address_proof', 'office_photo', 'tin_certificate'];

    protected $fillable = [
        'user_id',
        'business_name',
        'rc_number',
        'since_year',
        'category',
        'services',
        'bio',
        'location',
        'areas',
        'team_size',
        'logo_url',
        'past_work',
        'verified',
        'status',
        'checks',
        'owner_bvn',
        'owner_nin',
        'id_type',
        'address',
        'bank_code',
        'bank_name',
        'account_number',
        'account_name',
        'auto_withdraw',
        'tin',
        'submitted_at',
        'verified_at',
    ];

    protected $hidden = ['owner_bvn', 'owner_nin'];

    protected function casts(): array
    {
        return [
            'verified' => 'boolean',
            'services' => 'array',
            'past_work' => 'array',
            'checks' => 'array',
            'owner_bvn' => 'encrypted',
            'owner_nin' => 'encrypted',
            'auto_withdraw' => 'boolean',
            'submitted_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(VendorDocument::class);
    }

    public function directors(): HasMany
    {
        return $this->hasMany(VendorDirector::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(VendorReview::class);
    }

    public function team(): HasMany
    {
        return $this->hasMany(VendorTeamMember::class);
    }

    /**
     * Families can pay this business (VON-10 "Families can now pay you through
     * milestones"): the verified badge, which only an admin grants.
     */
    public function canBePaid(): bool
    {
        return (bool) $this->verified;
    }
}
