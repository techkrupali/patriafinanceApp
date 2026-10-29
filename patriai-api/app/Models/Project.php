<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An escrow-backed milestone project. Every project is backed by a dedicated
 * 'project'-type Wallet (the escrow container the owner funds). Milestone amounts
 * are reservations against that wallet balance; approving a milestone RELEASES
 * its amount to the vendor's main wallet via WalletService.
 */
class Project extends Model
{
    /** Milestone statuses whose amounts are still reserved (allocated, not yet released). */
    public const RESERVED_MILESTONE_STATUSES = ['funded', 'submitted', 'approved'];

    protected $fillable = [
        'wallet_id',
        'owner_id',
        'vendor_id',
        'vendor_status',
        'vendor_responded_at',
        'title',
        'description',
        'budget',
        'status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'budget' => 'integer',
            'meta' => 'array',
            'vendor_responded_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendor_id');
    }

    public function milestones(): HasMany
    {
        return $this->hasMany(Milestone::class);
    }

    /**
     * Sum of milestone amounts still reserved (funded/submitted/approved) — allocated,
     * not yet released — plus retention held back after release (PRW-06).
     */
    public function reservedAmount(): int
    {
        return (int) $this->milestones()
            ->whereIn('status', self::RESERVED_MILESTONE_STATUSES)
            ->sum('amount')
            + $this->heldBack();
    }

    /** PRW-06 "10% until 3 months after handover": retention not yet paid to the builder. */
    public function heldBack(): int
    {
        return (int) $this->milestones()->where('status', 'released')->whereNull('retention_released_at')->sum('retention');
    }

    /** Sum of milestone amounts released to the vendor (less any refund a dispute kept back). */
    public function releasedAmount(): int
    {
        return (int) $this->milestones()->where('status', 'released')->get()
            ->sum(fn (Milestone $m) => $m->amount - (int) ($m->meta['refunded'] ?? 0));
    }

    /** Escrow wallet balance not yet reserved by milestones (kobo). */
    public function availableToAllocate(): int
    {
        return $this->wallet->balance - $this->reservedAmount();
    }

    /**
     * 'owner', 'vendor', a funder's role on the project wallet (PRW-05), the
     * builder's team role on a project they were given (VDM-11: site_manager,
     * foreman, accounts), or null.
     */
    public function roleOf(User $user): ?string
    {
        if ($this->owner_id === $user->id) {
            return 'owner';
        }
        if ($this->vendor_id === $user->id) {
            return 'vendor';
        }
        $walletRole = $this->wallet?->members()->where('user_id', $user->id)->where('status', 'active')->value('role');
        if ($walletRole) {
            return $walletRole;
        }

        return $this->teamMemberFor($user)?->role;
    }

    /** The builder's team member this user is, on this project (VDM-10/11). */
    public function teamMemberFor(User $user): ?VendorTeamMember
    {
        if (!$this->vendor_id || !in_array($this->vendor_status, ['accepted', null], true)) {
            return null;
        }
        $profileId = VendorProfile::where('user_id', $this->vendor_id)->value('id');
        if (!$profileId) {
            return null;
        }

        return VendorTeamMember::where('vendor_profile_id', $profileId)->where('user_id', $user->id)->where('status', 'active')->get()
            ->first(fn (VendorTeamMember $m) => $m->covers($this->id));
    }

    /** Can the given user VIEW this project (owner, the builder, a funder who joined, or the builder's team on it)? */
    public function isAccessibleBy(User $user): bool
    {
        return $this->roleOf($user) !== null;
    }

    /** The builder's side: the vendor or a team member who may act for them ($can: submit | upload). */
    public function actsForVendor(User $user, string $can = 'submit'): bool
    {
        if ($this->vendor_id === $user->id) {
            return true;
        }
        $role = $this->teamMemberFor($user)?->role;

        return match ($can) {
            'submit' => $role === 'site_manager',
            'upload' => in_array($role, ['site_manager', 'foreman'], true),
            default => false,
        };
    }

    /** The family's side: the owner, or a co-owner on the project wallet. */
    public function isFamilyApprover(User $user): bool
    {
        return $this->owner_id === $user->id || in_array($this->wallet?->roleOf($user), ['owner', 'co_owner'], true);
    }
}
