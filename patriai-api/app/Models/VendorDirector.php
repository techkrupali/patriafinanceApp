<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * VON-05 a director or owner with 25% or more. The owner who signs up is
 * verified with their own BVN; others get an SMS link to verify (BVN + selfie).
 */
class VendorDirector extends Model
{
    protected $fillable = ['vendor_profile_id', 'user_id', 'name', 'phone', 'share_percent', 'status', 'token', 'bvn', 'selfie_url'];

    protected $hidden = ['token', 'bvn'];

    protected function casts(): array
    {
        return ['bvn' => 'encrypted', 'share_percent' => 'integer'];
    }

    public function vendorProfile(): BelongsTo
    {
        return $this->belongsTo(VendorProfile::class);
    }
}
