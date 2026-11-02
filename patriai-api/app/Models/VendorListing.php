<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** VLS-01/02 a finished project on the builder's public profile, once the family agreed. */
class VendorListing extends Model
{
    protected $fillable = ['vendor_profile_id', 'project_id', 'family_user_id', 'title', 'photos', 'cost_min', 'cost_max', 'months', 'location', 'status', 'published_at'];

    protected function casts(): array
    {
        return ['photos' => 'array', 'cost_min' => 'integer', 'cost_max' => 'integer', 'months' => 'integer', 'published_at' => 'datetime'];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(VendorProfile::class, 'vendor_profile_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function family(): BelongsTo
    {
        return $this->belongsTo(User::class, 'family_user_id');
    }
}
