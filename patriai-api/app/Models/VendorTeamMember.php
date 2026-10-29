<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * VDM-10/11 someone on a vendor's team, on the projects they were given:
 *  - site_manager: adds milestones, submits work for payment, talks to families
 *  - foreman: uploads photos and ticks deliverables; can't submit for payment
 *  - accounts: sees payouts and statements; can't withdraw
 */
class VendorTeamMember extends Model
{
    public const ROLES = ['site_manager', 'foreman', 'accounts'];

    protected $fillable = ['vendor_profile_id', 'user_id', 'phone', 'role', 'project_ids', 'status', 'accepted_at'];

    protected function casts(): array
    {
        return ['project_ids' => 'array', 'accepted_at' => 'datetime'];
    }

    public function vendorProfile(): BelongsTo
    {
        return $this->belongsTo(VendorProfile::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function covers(int $projectId): bool
    {
        return in_array($projectId, array_map('intval', $this->project_ids ?? []), true);
    }
}
