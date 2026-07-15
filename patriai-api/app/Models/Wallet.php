<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class Wallet extends Model
{
    public const TYPES = ['main', 'shared', 'project', 'savings', 'goal', 'emergency', 'giving', 'joint', 'child', 'spending'];

    /** Roles that may move money out UNCONDITIONALLY. Others need an explicit can_spend grant. */
    public const SPENDING_ROLES = ['owner', 'co_owner'];

    protected $fillable = [
        'user_id',
        'type',
        'name',
        'description',
        'currency',
        'balance',
        'target_amount',
        'approval_enabled',
        'approval_threshold',
        'required_approvals',
        'virtual_account',
        'virtual_account_bank',
        'status',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'balance' => 'integer',
            'target_amount' => 'integer',
            'approval_enabled' => 'boolean',
            'approval_threshold' => 'integer',
            'required_approvals' => 'integer',
            'meta' => 'array',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(WalletMember::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(WalletInvitation::class);
    }

    public function approvalRequests(): HasMany
    {
        return $this->hasMany(ApprovalRequest::class);
    }

    /** Can the given user VIEW this wallet (owner or any active member)? */
    public function isAccessibleBy(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        return $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }

    /** Can the given user MOVE MONEY out (withdraw/transfer)? Excludes viewers. */
    public function canSpend(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        $member = $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (!$member) {
            return false;
        }

        // owner/co_owner spend unconditionally.
        if (in_array($member->role, self::SPENDING_ROLES, true)) {
            return true;
        }

        // admin/contributor may spend only with an explicit grant; viewer/vendor/child never.
        if (in_array($member->role, ['admin', 'contributor'], true)) {
            return ($member->permissions['can_spend'] ?? false) === true;
        }

        return false;
    }

    /** 'owner' if the wallet owner, else the active member role, else null. */
    public function roleOf(User $user): ?string
    {
        if ($this->user_id === $user->id) {
            return 'owner';
        }

        $member = $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        return $member?->role;
    }

    /** Does a spend of this amount require approval on this wallet? */
    public function approvalRequiredFor(int $amountKobo): bool
    {
        if (!$this->approval_enabled) {
            return false;
        }
        if ($this->approval_threshold === null) {
            return true;
        }

        return $amountKobo >= $this->approval_threshold;
    }

    /** Can the given user APPROVE requests on this wallet? Owner always true. */
    public function canApprove(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        $member = $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (!$member || $member->role === 'viewer') {
            return false;
        }

        return in_array($member->role, ['owner', 'co_owner', 'admin'], true) || $member->can_approve;
    }

    /** User ids that can approve on this wallet, optionally excluding one (the initiator). */
    public function eligibleApprovers(?int $excludeUserId = null): Collection
    {
        $ids = collect();

        // Owner is always an eligible approver.
        $ids->push($this->user_id);

        $members = $this->members()
            ->where('status', 'active')
            ->where('user_id', '!=', $this->user_id)
            ->where('role', '!=', 'viewer')
            ->get();

        foreach ($members as $member) {
            if (in_array($member->role, ['owner', 'co_owner', 'admin'], true) || $member->can_approve) {
                $ids->push($member->user_id);
            }
        }

        return $ids->unique()
            ->when($excludeUserId !== null, fn ($c) => $c->reject(fn ($id) => $id === $excludeUserId))
            ->values();
    }

    /** Sum(amount + fee) of this wallet's still-pending approval requests. */
    public function heldAmount(): int
    {
        return (int) $this->approvalRequests()
            ->where('status', 'pending')
            ->sum(\Illuminate\Support\Facades\DB::raw('amount + fee'));
    }

    /** Alias of heldAmount(): kobo tied up in this wallet's pending approval requests. */
    public function heldForApprovals(): int
    {
        return $this->heldAmount();
    }

    /**
     * Spendable balance right now (kobo): the raw balance minus funds already
     * committed to pending approval requests, and — for project escrow wallets —
     * minus amounts still reserved by unreleased milestones. This is an ADDITIONAL
     * pre-check on top of WalletService's row-locked overdraft guard; it stops a
     * direct spend from over-committing funds that are reserved elsewhere.
     */
    public function availableToSpend(): int
    {
        $available = $this->balance - $this->heldForApprovals();

        if ($this->type === 'project') {
            $project = Project::where('wallet_id', $this->id)->first();
            if ($project) {
                $available -= $project->reservedAmount();
            }
        }

        return $available;
    }

    /** Naira string, e.g. "1500.00" */
    public function balanceNaira(): string
    {
        return number_format($this->balance / 100, 2, '.', '');
    }
}
