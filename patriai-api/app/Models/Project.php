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

    /** Sum of milestone amounts that have been released to the vendor. */
    public function releasedAmount(): int
    {
        return (int) $this->milestones()
            ->where('status', 'released')
            ->sum('amount');
    }

    /** Escrow wallet balance not yet reserved by milestones (kobo). */
    public function availableToAllocate(): int
    {
        return $this->wallet->balance - $this->reservedAmount();
    }

    /** 'owner', 'vendor', a funder's role on the project wallet (PRW-05), or null. */
    public function roleOf(User $user): ?string
    {
        if ($this->owner_id === $user->id) {
            return 'owner';
        }
        if ($this->vendor_id === $user->id) {
            return 'vendor';
        }

        return $this->wallet?->members()->where('user_id', $user->id)->where('status', 'active')->value('role');
    }

    /** Can the given user VIEW this project (owner, assigned vendor, or a funder who joined)? */
    public function isAccessibleBy(User $user): bool
    {
        return $this->owner_id === $user->id || $this->vendor_id === $user->id
            || ($this->wallet && $this->wallet->members()->where('user_id', $user->id)->where('status', 'active')->exists());
    }
}
