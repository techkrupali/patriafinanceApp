<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** VND-04 a family's rating of a vendor after a milestone or a project. */
class VendorReview extends Model
{
    public const TAGS = ['on_time', 'good_photos', 'clean_site', 'fair_price', 'easy_to_reach'];

    protected $fillable = ['vendor_profile_id', 'user_id', 'project_id', 'milestone_id', 'rating', 'tags', 'body', 'first_name_only'];

    protected function casts(): array
    {
        return ['tags' => 'array', 'rating' => 'integer', 'first_name_only' => 'boolean'];
    }

    public function vendorProfile(): BelongsTo
    {
        return $this->belongsTo(VendorProfile::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function milestone(): BelongsTo
    {
        return $this->belongsTo(Milestone::class);
    }
}
