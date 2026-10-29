<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A file uploaded during business verification (VON-02…08): ID, CAC papers, proof of address… */
class VendorDocument extends Model
{
    protected $fillable = ['vendor_profile_id', 'item', 'url', 'name'];

    public function vendorProfile(): BelongsTo
    {
        return $this->belongsTo(VendorProfile::class);
    }
}
