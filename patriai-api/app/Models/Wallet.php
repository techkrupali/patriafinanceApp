<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Collection;

class Wallet extends Model
{
    public const TYPES = ['main', 'shared', 'project', 'savings', 'goal', 'emergency', 'giving', 'joint', 'child', 'spending'];

    /** Roles that may move money out UNCONDITIONALLY. Others need an explicit can_spend grant. */
    public const SPENDING_ROLES = ['owner', 'co_owner'];

    /**
     * Who decides a spend that needs approval (WCR-09 / WAL-08): the first yes
     * from any approver, every approver, or more than half of them.
     */
    public const APPROVAL_MODES = ['any', 'all', 'majority'];

    /** How long an approval request waits for answers. */
    public const APPROVAL_EXPIRY_HOURS = [24, 48, 72];

    /** SAV-01 wallet colours: emerald, mint, gold, deep, clay, violet. */
    public const COLOURS = ['emerald', 'mint', 'gold', 'deep', 'clay', 'violet'];

    protected $fillable = [
        'user_id',
        'type',
        'name',
        'description',
        'currency',
        'balance',
        'target_amount',
        'target_date',
        'approval_enabled',
        'approval_threshold',
        'required_approvals',
        'virtual_account',
        'virtual_account_bank',
        'status',
        'meta',
        'access_schedule',
    ];

    protected function casts(): array
    {
        return [
            'balance' => 'integer',
            'target_amount' => 'integer',
            'target_date' => 'date',
            'approval_enabled' => 'boolean',
            'approval_threshold' => 'integer',
            'required_approvals' => 'integer',
            'meta' => 'array',
            'access_schedule' => 'array',
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

    public function emergencySetting(): HasOne
    {
        return $this->hasOne(EmergencySetting::class);
    }

    public function emergencyBeneficiaries(): HasMany
    {
        return $this->hasMany(EmergencyBeneficiary::class)->orderBy('position');
    }

    public function emergencyUnlockRequests(): HasMany
    {
        return $this->hasMany(EmergencyUnlockRequest::class);
    }

    /** The savings rule every contributor follows (savings/goal wallets). */
    public function savingsPlan(): HasOne
    {
        return $this->hasOne(SavingsPlan::class);
    }

    public function savingsMilestones(): HasMany
    {
        return $this->hasMany(SavingsMilestone::class)->orderBy('position');
    }

    /**
     * Is this an emergency wallet whose access rules still hold it locked? Only
     * wallets set up through the guided emergency journey carry rules; a bare
     * emergency wallet (no settings row) behaves like any other wallet.
     */
    public function isEmergencyLocked(): bool
    {
        if ($this->type !== 'emergency') {
            return false;
        }

        return (bool) $this->emergencySetting?->isLocked();
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

    /** Is this wallet frozen (spending blocked for everyone)? */
    public function isFrozen(): bool
    {
        return $this->status === 'frozen';
    }

    /** Does this wallet have a weekly scheduled-access window configured? */
    public function hasAccessSchedule(): bool
    {
        $schedule = $this->access_schedule;

        return is_array($schedule)
            && !empty($schedule['days'])
            && !empty($schedule['start'])
            && !empty($schedule['end']);
    }

    /**
     * Is "now" inside this wallet's weekly spend-allowed window? True when there is
     * no schedule (always spendable). Otherwise the current weekday (ISO 1=Mon..7=Sun,
     * in the schedule tz) must be in `days` AND the current time must fall within
     * [start, end] in that same tz. An overnight window (end <= start) wraps midnight.
     */
    public function withinAccessWindow(?\Carbon\Carbon $now = null): bool
    {
        if (!$this->hasAccessSchedule()) {
            return true;
        }

        $schedule = $this->access_schedule;
        $tz = $schedule['tz'] ?? config('app.timezone', 'UTC');

        $now = $now ? $now->copy() : \Illuminate\Support\Carbon::now();
        $now = $now->setTimezone($tz);

        $days = array_map('intval', (array) $schedule['days']);
        if (!in_array($now->isoWeekday(), $days, true)) {
            return false;
        }

        $current = $now->format('H:i');
        $start = (string) $schedule['start'];
        $end = (string) $schedule['end'];

        // Overnight window (e.g. 20:00 -> 06:00) wraps past midnight.
        if ($end <= $start) {
            return $current >= $start || $current <= $end;
        }

        return $current >= $start && $current <= $end;
    }

    /** Can the given user MOVE MONEY out (withdraw/transfer)? Excludes viewers. */
    public function canSpend(User $user): bool
    {
        // Money can never leave a frozen wallet, a locked emergency wallet, or one that
        // is currently outside its scheduled-access window — this blocks EVERYONE,
        // including the owner/co_owner.
        if ($this->isFrozen()) {
            return false;
        }
        if ($this->isEmergencyLocked()) {
            return false;
        }
        // Locked savings with no early break: it opens on its date or at its target.
        if ($this->isHardLocked()) {
            return false;
        }
        if (!$this->withinAccessWindow()) {
            return false;
        }

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

        // A keyholder (the dual-approval approver, e.g. a spouse) may withdraw from
        // an unlocked emergency wallet on the owner's behalf (client video 2026-10-17).
        if ($member->role === 'emergency_approver') {
            $setting = $this->emergencySetting;

            return $this->type === 'emergency' && $setting && !$setting->isLocked()
                && $setting->dual_approval && in_array($user->id, $setting->keyholders($this->user_id), true);
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

    /** The active membership row for a user, or null (never matches the owner). */
    private function activeMemberFor(User $user): ?WalletMember
    {
        return $this->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();
    }

    /**
     * Can the given user VIEW this wallet? Owner/co_owner always; every other
     * active member by default (viewers exist to view), unless their permissions
     * matrix explicitly turns 'view' off. Non-members: false.
     */
    public function canView(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        $member = $this->activeMemberFor($user);
        if (!$member) {
            return false;
        }
        if (in_array($member->role, self::SPENDING_ROLES, true)) {
            return true;
        }

        return ($member->permissions['view'] ?? true) !== false;
    }

    /**
     * Can the given user FUND (pay money INTO) this wallet? Owner/co_owner always;
     * every other active member by default (anyone in the wallet can fund), unless
     * their permissions matrix explicitly turns 'fund' off. Non-members: false.
     */
    public function canFund(User $user): bool
    {
        if ($this->user_id === $user->id) {
            return true;
        }

        $member = $this->activeMemberFor($user);
        if (!$member) {
            return false;
        }
        if (in_array($member->role, self::SPENDING_ROLES, true)) {
            return true;
        }

        return ($member->permissions['fund'] ?? true) !== false;
    }

    /**
     * Can the given user REQUEST money / raise a spend request on this wallet?
     * Owner/co_owner always; every other active member by default, unless their
     * permissions matrix explicitly turns 'request' off. Non-members: false.
     */
    public function canRequest(User $user): bool
    {
        if ($this->isHardLocked()) {
            return false;
        }
        if ($this->user_id === $user->id) {
            return true;
        }

        $member = $this->activeMemberFor($user);
        if (!$member) {
            return false;
        }
        if (in_array($member->role, self::SPENDING_ROLES, true)) {
            return true;
        }

        return ($member->permissions['request'] ?? true) !== false;
    }

    /**
     * Can the given user WITHDRAW / move money OUT of this wallet? This is the
     * spend gate (canSpend) with an ADDITIONAL, opt-in withdraw switch: owner/
     * co_owner keep their unconditional spend, admin/contributor still need the
     * can_spend grant, and either may be further blocked by an explicit
     * permissions['withdraw'] === false. Never loosens canSpend.
     */
    public function canWithdraw(User $user): bool
    {
        if (!$this->canSpend($user)) {
            return false;
        }

        // Owner/co_owner spend unconditionally — never gated by the matrix.
        if ($this->user_id === $user->id) {
            return true;
        }
        $member = $this->activeMemberFor($user);
        if ($member && in_array($member->role, self::SPENDING_ROLES, true)) {
            return true;
        }

        return ($member?->permissions['withdraw'] ?? true) !== false;
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

    /** The chosen "who decides" rule, or null for a fixed required_approvals count. */
    public function approvalMode(): ?string
    {
        $mode = $this->meta['approval_mode'] ?? null;

        return in_array($mode, self::APPROVAL_MODES, true) ? $mode : null;
    }

    /**
     * The savings lock (SAV-05, WCR-09): until a date or until the target is
     * reached. early_break: money may still leave before then; approval: and only
     * with every approver's yes. "Lock until goal is reached" from goal creation
     * is a target lock with early break by approval.
     *
     * @return array{mode: string, until: ?string, early_break: bool, approval: bool}|null
     */
    public function savingsLock(): ?array
    {
        $lock = $this->meta['lock'] ?? null;
        if (is_array($lock) && in_array($lock['mode'] ?? null, ['date', 'target'], true)) {
            return [
                'mode' => $lock['mode'],
                'until' => $lock['until'] ?? null,
                'early_break' => (bool) ($lock['early_break'] ?? true),
                'approval' => (bool) ($lock['approval'] ?? true),
            ];
        }
        if (($this->meta['lock_until_goal'] ?? false) === true) {
            return ['mode' => 'target', 'until' => null, 'early_break' => true, 'approval' => true];
        }

        return null;
    }

    /** Locked right now: before the lock date, or below the target. */
    public function isGoalLocked(): bool
    {
        $lock = $this->savingsLock();
        if (!$lock) {
            return false;
        }
        if ($lock['mode'] === 'date') {
            return $lock['until'] !== null && now()->lt(\Illuminate\Support\Carbon::parse($lock['until'])->startOfDay());
        }

        return $this->target_amount !== null && $this->target_amount > 0 && $this->balance < $this->target_amount;
    }

    /** Locked with no early break: nothing leaves until it opens. */
    public function isHardLocked(): bool
    {
        return $this->isGoalLocked() && !$this->savingsLock()['early_break'];
    }

    public function approvalExpiryHours(): int
    {
        $hours = (int) ($this->meta['approval_expiry_hours'] ?? 48);

        return in_array($hours, self::APPROVAL_EXPIRY_HOURS, true) ? $hours : 48;
    }

    /** Day of the month members are reminded to save (1–28), or null. */
    public function reminderDay(): ?int
    {
        $day = $this->meta['reminder_day'] ?? null;

        return is_int($day) && $day >= 1 && $day <= 28 ? $day : null;
    }

    /**
     * Yeses a spend started by $initiator needs. The initiator's own request
     * counts as their yes, so "everyone" means every OTHER approver.
     */
    public function requiredApprovalsFor(User $initiator): int
    {
        $mode = $this->isGoalLocked() && $this->savingsLock()['approval'] ? 'all' : $this->approvalMode();
        if ($mode === null) {
            return max(1, (int) $this->required_approvals);
        }

        $approvers = $this->eligibleApprovers();
        $others = $approvers->reject(fn ($id) => $id === $initiator->id)->count();

        return match ($mode) {
            'any' => 1,
            'all' => max(1, $others),
            'majority' => max(1, intdiv($approvers->count(), 2) + 1 - ($approvers->contains($initiator->id) ? 1 : 0)),
        };
    }

    /** Does a spend of this amount require approval on this wallet? */
    public function approvalRequiredFor(int $amountKobo): bool
    {
        if ($this->isGoalLocked() && $this->savingsLock()['approval']) {
            return true;
        }
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
