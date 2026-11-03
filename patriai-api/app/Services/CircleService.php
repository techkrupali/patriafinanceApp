<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\Circle;
use App\Models\CircleMember;
use App\Models\EmergencySetting;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Family circles (FAM-01/02/07…12, HOM-06).
 *
 * Everyone has a home circle, "{Surname} family", made the first time it is
 * needed. A wallet with no circle belongs to its owner's home circle; moving
 * a wallet into another circle ("Eze siblings") shares it there instead.
 * People are in a circle because they are in one of its wallets, or because
 * they were given a circle role (FAM-08).
 */
class CircleService
{
    /** FAM-12: the new owner has a week to accept; it takes effect a day later. */
    public const ACCEPT_DAYS = 7;
    public const EFFECT_HOURS = 24;

    /** FAM-09: how long the owner has to pick a new keyholder. */
    public const KEYHOLDER_DAYS = 7;

    public const KIND_LABELS = [
        'family' => 'Family', 'extended' => 'Extended family', 'siblings' => 'Siblings',
        'ajo' => 'Ajo group', 'friends' => 'Friends', 'community' => 'Church or community',
    ];

    private const ROLE_RANK = ['owner' => 5, 'co_owner' => 4, 'admin' => 3, 'contributor' => 2, 'viewer' => 1];

    public static function make(): self
    {
        return new self();
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    // ------------------------------------------------------------------ circles

    /** "Okafor family": made the first time it's needed. */
    public function home(User $user): Circle
    {
        $circle = Circle::where('created_by', $user->id)->where('is_home', true)->first();
        if ($circle) {
            return $this->settle($circle);
        }
        $surname = trim((string) ($user->last_name ?: $user->first_name ?: 'My'));

        return Circle::create([
            'created_by' => $user->id,
            'owner_id' => $user->id,
            'name' => "{$surname} family",
            'kind' => 'family',
            'is_home' => true,
        ]);
    }

    /** The circle a request asks for (or the viewer's home), if they may see it. */
    public function resolve(User $viewer, ?int $circleId): Circle
    {
        if (!$circleId) {
            return $this->home($viewer);
        }
        $circle = Circle::find($circleId);
        if (!$circle || !$this->canSee($circle, $viewer)) {
            throw ValidationException::withMessages(['circle' => 'That circle is not one of yours.']);
        }

        return $this->settle($circle);
    }

    public function canSee(Circle $circle, User $viewer): bool
    {
        if (in_array($viewer->id, [$circle->owner_id, $circle->created_by, $circle->pending_owner_id], true)) {
            return true;
        }
        if ($circle->members()->where('user_id', $viewer->id)->exists()) {
            return true;
        }

        return $this->universe($circle)->contains(fn (Wallet $w) => $w->isAccessibleBy($viewer));
    }

    /** FAM-11 "New circle: a separate group with its own wallets". */
    public function create(User $owner, string $name, string $kind, ?string $purpose): Circle
    {
        if (Circle::where('owner_id', $owner->id)->where('is_home', false)->count() >= 10) {
            throw ValidationException::withMessages(['name' => 'You can have up to 10 circles. Close one you no longer use first.']);
        }
        $this->home($owner);
        if (Circle::where('owner_id', $owner->id)->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($name))])->exists()) {
            throw ValidationException::withMessages(['name' => 'You already have a circle with that name.']);
        }

        return Circle::create([
            'created_by' => $owner->id,
            'owner_id' => $owner->id,
            'name' => trim($name),
            'kind' => $kind,
            'purpose' => $purpose ? trim($purpose) : null,
            'is_home' => false,
        ]);
    }

    /** Move one of your wallets into a circle (null = back to your home circle). */
    public function moveWallet(Wallet $wallet, User $actor, ?int $circleId): Wallet
    {
        if ($wallet->user_id !== $actor->id) {
            throw ValidationException::withMessages(['wallet' => 'Only the wallet owner can move it to another circle.']);
        }
        if (in_array($wallet->type, ['main', 'ajo'], true)) {
            throw ValidationException::withMessages(['wallet' => $wallet->type === 'main' ? 'Your Main wallet stays in your own family circle.' : 'An ajo pot is its own circle.']);
        }
        $circle = $circleId ? Circle::find($circleId) : null;
        if ($circleId && (!$circle || !in_array($actor->id, [$circle->owner_id, $circle->created_by], true))) {
            throw ValidationException::withMessages(['circle_id' => 'Move it into a circle you own.']);
        }
        $from = $wallet->circle_id ? Circle::find($wallet->circle_id)?->name : $this->home($actor)->name;
        $wallet->update(['circle_id' => $circle && !$circle->is_home ? $circle->id : null]);
        $to = $circle?->name ?? $this->home($actor)->name;
        AuditService::make()->log($wallet, $actor, 'settings_changed', "Moved from {$from} to {$to}", ['circle_id' => $wallet->circle_id]);

        return $wallet;
    }

    /**
     * The wallets a circle shares. A home circle has its maker's wallets with
     * no other circle (and, for the maker, wallets others shared with them that
     * aren't in a circle); ajo pots are their own circles.
     *
     * @return Collection<int, Wallet>
     */
    public function universe(Circle $circle, ?User $viewer = null): Collection
    {
        if ($circle->is_home) {
            $maker = $circle->created_by;
            $ids = Wallet::where('user_id', $maker)
                ->where(fn ($q) => $q->whereNull('circle_id')->orWhere('circle_id', $circle->id))
                ->pluck('id');
            if ($viewer && $viewer->id === $maker) {
                $ids = $ids->merge(
                    Wallet::whereNull('circle_id')
                        ->whereIn('id', WalletMember::where('user_id', $maker)->where('status', 'active')->pluck('wallet_id'))
                        ->pluck('id'),
                );
            }
            $query = Wallet::whereIn('id', $ids->unique());
        } else {
            $query = Wallet::where('circle_id', $circle->id);
        }

        return $query->where('type', '!=', 'ajo')->whereNotIn('status', ['closed', 'deleted'])
            ->with(['owner', 'members' => fn ($q) => $q->where('status', 'active')->with('user')])
            ->orderBy('id')->get();
    }

    /** What the viewer may see of the circle: everything for its owners, otherwise their own wallets. */
    public function visibleWallets(Circle $circle, User $viewer): Collection
    {
        $all = $this->universe($circle, $viewer);
        if ($this->seesAll($circle, $viewer)) {
            return $all;
        }

        return $all->filter(fn (Wallet $w) => $w->user_id === $viewer->id || $w->members->contains('user_id', $viewer->id))->values();
    }

    private function seesAll(Circle $circle, User $viewer): bool
    {
        if (in_array($viewer->id, [$circle->owner_id, $circle->created_by], true)) {
            return true;
        }

        return (bool) ($this->membership($circle, $viewer)?->perms()['balances'] ?? false);
    }

    public function membership(Circle $circle, User $user): ?CircleMember
    {
        return $circle->members()->where('user_id', $user->id)->first();
    }

    /** owner · co_owner · admin · contributor, at circle level. */
    public function roleIn(Circle $circle, User $user, ?Collection $wallets = null): ?string
    {
        if ($circle->owner_id === $user->id) {
            return 'owner';
        }
        if ($m = $this->membership($circle, $user)) {
            return $m->role;
        }
        $top = null;
        foreach ($wallets ?? $this->universe($circle) as $w) {
            $role = $w->user_id === $user->id ? 'co_owner' : $w->members->firstWhere('user_id', $user->id)?->role;
            if ($role && (self::ROLE_RANK[$role] ?? 0) > ($top ? (self::ROLE_RANK[$top] ?? 0) : 0)) {
                $top = $role;
            }
        }

        return $top;
    }

    /** May this person invite and remove people (FAM-08 "Invite and remove people")? */
    public function canManage(Circle $circle, User $user): bool
    {
        if ($circle->owner_id === $user->id) {
            return true;
        }
        $m = $this->membership($circle, $user);

        return $m && $m->role === 'co_owner' && $m->perms()['invite'];
    }

    // ------------------------------------------------------------------ switcher

    /**
     * HOM-06 "Your circles": your family first, then circles you own or are in,
     * then ajo groups.
     *
     * @return list<array<string, mixed>>
     */
    public function forUser(User $user): array
    {
        $home = $this->home($user);
        $ids = collect([$home->id])
            ->merge(Circle::where('owner_id', $user->id)->orWhere('created_by', $user->id)->orWhere('pending_owner_id', $user->id)->pluck('id'))
            ->merge(CircleMember::where('user_id', $user->id)->pluck('circle_id'))
            ->merge(Wallet::whereNotNull('circle_id')->whereIn('id', WalletMember::where('user_id', $user->id)->where('status', 'active')->pluck('wallet_id'))->pluck('circle_id'))
            ->unique();
        $circles = Circle::whereIn('id', $ids)->get()->map(fn (Circle $c) => $this->settle($c))
            ->sortBy(fn (Circle $c) => [$c->id === $home->id ? 0 : 1, $c->created_at?->timestamp ?? 0])->values();

        $rows = $circles->map(fn (Circle $c) => $this->summary($c, $user))->all();

        // Ajo groups (AJO-03): each pot is its own circle.
        $ajo = AjoService::make();
        $pots = Wallet::where('type', 'ajo')->whereNotIn('status', ['closed', 'deleted'])
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('id', WalletMember::where('user_id', $user->id)->where('status', 'active')->pluck('wallet_id')))
            ->get();
        foreach ($pots as $pot) {
            $row = $ajo->rowSummary($pot, $user);
            $circle = $ajo->forWallet($pot);
            if (!$row || !$circle || $circle->status === 'cancelled') {
                continue;
            }
            $rows[] = [
                'id' => null,
                'ajo_wallet_id' => $pot->id,
                'name' => $pot->name,
                'kind' => 'ajo',
                'is_home' => false,
                'my_role' => $row['role'] === 'organiser' ? 'organiser' : 'member',
                'role_label' => $row['role'] === 'organiser' ? 'Organiser' : 'Member',
                'members' => (int) $circle->size,
                'wallets' => 1,
                'subtitle' => ($row['role'] === 'organiser' ? 'Organiser' : 'Member') . " · {$circle->size} people · " . lcfirst($row['line']),
                'waiting' => 0,
            ];
        }

        return $rows;
    }

    /** One circle as a row: "Owner · 5 members · 6 wallets". */
    public function summary(Circle $circle, User $viewer): array
    {
        $wallets = $this->universe($circle, $viewer);
        $people = $this->people($circle, $viewer, $wallets);
        $role = $this->roleIn($circle, $viewer, $wallets) ?? 'contributor';
        $label = $this->roleLabel($role);
        $waiting = $this->waitingFor($viewer, $wallets);
        $count = count($people) + 1;
        $subtitle = $circle->purpose
            ? "{$label} · {$circle->purpose}"
            : "{$label} · {$count} member" . ($count === 1 ? '' : 's') . " · {$wallets->count()} wallet" . ($wallets->count() === 1 ? '' : 's');

        return [
            'id' => $circle->id,
            'ajo_wallet_id' => null,
            'name' => $circle->name,
            'kind' => $circle->kind,
            'is_home' => $circle->is_home && $circle->created_by === $viewer->id,
            'my_role' => $role,
            'role_label' => $label,
            'members' => $count,
            'wallets' => $wallets->count(),
            'subtitle' => $subtitle,
            'waiting' => $waiting,
        ];
    }

    /** Payments in these wallets waiting for this person's yes. */
    private function waitingFor(User $user, Collection $wallets): int
    {
        $ids = $wallets->filter(fn (Wallet $w) => $w->canApprove($user))->pluck('id');
        if ($ids->isEmpty()) {
            return 0;
        }

        return ApprovalRequest::whereIn('wallet_id', $ids)->where('status', 'pending')
            ->where('initiator_id', '!=', $user->id)
            ->whereDoesntHave('responses', fn ($q) => $q->where('approver_id', $user->id))
            ->count();
    }

    public function roleLabel(?string $role): string
    {
        return match ($role) {
            'owner' => 'Owner',
            'co_owner' => 'Co-owner',
            'admin' => 'Admin',
            'viewer' => 'Viewer',
            'organiser' => 'Organiser',
            default => 'Contributor',
        };
    }

    /** The circle as FAM-01 shows it. */
    public function describe(Circle $circle, User $viewer): array
    {
        $wallets = $this->universe($circle, $viewer);
        $transfer = null;
        if ($circle->pending_owner_id) {
            $to = $circle->pendingOwner;
            $transfer = [
                'to' => ['id' => $to?->id, 'name' => $to?->fullName()],
                'requested_at' => $circle->transfer_requested_at?->toIso8601String(),
                'accept_by' => $circle->transfer_requested_at?->copy()->addDays(self::ACCEPT_DAYS)->toIso8601String(),
                'accepted_at' => $circle->transfer_accepted_at?->toIso8601String(),
                'effective_at' => $circle->transfer_effective_at?->toIso8601String(),
                'for_you' => $circle->pending_owner_id === $viewer->id,
            ];
        }

        return [
            'id' => $circle->id,
            'name' => $circle->name,
            'kind' => $circle->kind,
            'kind_label' => self::KIND_LABELS[$circle->kind] ?? 'Family',
            'purpose' => $circle->purpose,
            'is_home' => $circle->is_home && $circle->created_by === $viewer->id,
            'owner' => ['id' => $circle->owner_id, 'name' => $circle->owner?->fullName(), 'first_name' => $circle->owner?->first_name],
            'my_role' => $this->roleIn($circle, $viewer, $wallets) ?? 'contributor',
            'can_manage' => $this->canManage($circle, $viewer),
            'sees_all' => $this->seesAll($circle, $viewer),
            'wallet_ids' => $wallets->pluck('id')->all(),
            'transfer' => $transfer,
        ];
    }

    // ------------------------------------------------------------------ people

    /**
     * Everyone in the circle but the viewer, with their wallets.
     *
     * @return array<int, array{user: User, memberships: list<array<string, mixed>>}>
     */
    public function people(Circle $circle, User $viewer, ?Collection $wallets = null): array
    {
        $wallets ??= $this->universe($circle, $viewer);
        $people = [];
        $add = function (?User $person, string $role, bool $canApprove, ?Wallet $wallet, ?WalletMember $row = null) use (&$people, $viewer) {
            if (!$person || $person->id === $viewer->id) {
                return;
            }
            $people[$person->id] ??= ['user' => $person, 'memberships' => []];
            if (!$wallet || collect($people[$person->id]['memberships'])->contains('wallet_id', $wallet->id)) {
                return;
            }
            $people[$person->id]['memberships'][] = [
                'wallet_id' => $wallet->id,
                'wallet_name' => $wallet->name,
                'wallet_type' => $wallet->type,
                'role' => $role,
                'can_approve' => $canApprove,
                'permissions' => $row?->permissions ?? [],
                'member_row_id' => $row?->id,
            ];
        };
        foreach ($wallets as $w) {
            $add($w->owner, 'owner', true, $w);
            foreach ($w->members as $m) {
                $add($m->user, $m->role, $m->role !== 'viewer' && (in_array($m->role, ['owner', 'co_owner', 'admin'], true) || $m->can_approve), $w, $m);
            }
        }
        $add($circle->owner, 'owner', true, null);
        foreach ($circle->members()->with('user')->get() as $cm) {
            $add($cm->user, $cm->role, false, null);
        }

        return $people;
    }

    /**
     * FAM-07 "Emeka Okafor · Co-owner · joined 12 Mar 2026": their wallets and
     * roles, what they put in, and what they did lately.
     */
    public function member(Circle $circle, User $viewer, User $person): array
    {
        $wallets = $this->visibleWallets($circle, $viewer);
        $people = $this->people($circle, $viewer, $this->universe($circle, $viewer));
        if (!isset($people[$person->id])) {
            throw ValidationException::withMessages(['member' => 'They are not in this circle.']);
        }
        $visibleIds = $wallets->pluck('id');
        $manage = WalletManageService::make();
        $lines = [];
        foreach ($wallets as $w) {
            $isOwner = $w->user_id === $person->id;
            $row = $isOwner ? null : $w->members->firstWhere('user_id', $person->id);
            if (!$isOwner && !$row) {
                continue;
            }
            $put = (int) ($manage->contributions($w)['by_user'][$person->id] ?? 0);
            $lines[] = [
                'wallet_id' => $w->id,
                'wallet_name' => $w->name,
                'wallet_type' => $w->type,
                'role' => $isOwner ? 'owner' : $row->role,
                'line' => $this->walletLine($w, $person, $isOwner ? null : $row),
                'put_in' => $put > 0 ? 'Put in ' . $this->naira($put) : null,
                'member_row_id' => $row?->id,
            ];
        }

        // When they first came into the circle: their first shared wallet, else their circle role.
        $joined = WalletMember::where('user_id', $person->id)->whereIn('wallet_id', $visibleIds)->min('created_at')
            ?? $circle->members()->where('user_id', $person->id)->value('created_at')
            ?? $person->created_at;
        $role = $this->roleIn($circle, $person) ?? 'contributor';
        $cm = $this->membership($circle, $person);
        $digits = preg_replace('/\D/', '', (string) $person->phone);
        $local = str_starts_with($digits, '234') ? '0' . substr($digits, 3) : ($digits ? '+' . $digits : '');

        return [
            'person' => [
                'id' => $person->id,
                'name' => $person->fullName(),
                'first_name' => $person->first_name,
                'initials' => $this->initials($person),
                'avatar_url' => $person->avatar_url ?? null,
                'is_child' => $person->isChild(),
            ],
            'role' => $role,
            'role_label' => $person->isChild() ? 'Child' : $this->roleLabel($role),
            'joined' => Carbon::parse($joined)->format('j M Y'),
            'identity' => implode(' · ', array_filter([
                (int) $person->kyc_tier >= 1 ? 'Verified' : 'Not verified',
                'Tier ' . (int) $person->kyc_tier,
                strlen($local) >= 7 ? substr($local, 0, 4) . ' •••• ' . substr($local, -3) : null,
            ])),
            'tier' => (int) $person->kyc_tier,
            'wallets' => $lines,
            'permissions' => ($cm ?? new CircleMember(['role' => in_array($role, ['co_owner', 'admin'], true) ? $role : 'contributor']))->perms(),
            'circle_role_set' => (bool) $cm,
            'recent' => $this->activity($circle, $viewer, 'everyone', $person->id, 10),
            'can_manage' => $this->canManage($circle, $viewer) && $person->id !== $circle->owner_id,
            'can_edit_role' => $circle->owner_id === $viewer->id && $person->id !== $viewer->id,
            'is_circle_owner' => $person->id === $circle->owner_id,
        ];
    }

    /** "Co-owner · approves over ₦100,000", "Spender · no daily limit", "Keyholder · 2 of 3". */
    private function walletLine(Wallet $w, User $person, ?WalletMember $row): string
    {
        if ($w->type === 'emergency') {
            $setting = EmergencySetting::where('wallet_id', $w->id)->first();
            if ($setting) {
                $keys = $setting->keyholders($w->user_id);
                if (in_array($person->id, $keys, true)) {
                    return 'Keyholder · ' . $setting->requiredYeses($w->user_id) . ' of ' . count($keys);
                }
            }
        }
        if ($row === null) {
            return 'Owner';
        }
        $role = $this->roleLabel($row->role);
        $perms = $row->permissions ?? [];
        if (!empty($perms['accountant'])) {
            return 'Accountant · read only';
        }
        $approves = $row->role !== 'viewer' && (in_array($row->role, ['co_owner', 'admin'], true) || $row->can_approve);
        if ($approves) {
            return $w->approval_enabled && $w->approval_threshold
                ? "{$role} · approves over {$this->naira((int) $w->approval_threshold)}"
                : "{$role} · approves";
        }
        if (($perms['withdraw'] ?? $perms['can_spend'] ?? false) === true) {
            $limit = $perms['daily_limit'] ?? $perms['request_limit'] ?? null;

            return 'Spender · ' . ($limit ? $this->naira((int) $limit) . ' a day' : 'no daily limit');
        }

        return $role;
    }

    private function initials(User $user): string
    {
        $parts = preg_split('/\s+/', trim($user->fullName()), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return mb_strtoupper(implode('', array_map(fn ($p) => mb_substr($p, 0, 1), array_slice($parts, 0, 2)))) ?: '?';
    }

    // ------------------------------------------------------------------ FAM-08

    /**
     * FAM-08 "Edit role": the circle role and what it allows, carried into each
     * wallet the actor owns. A joint partner's role only changes with their
     * agreement, so joint wallets are left as they are.
     *
     * @param  array<string, bool>  $perms
     * @return array{updated: list<string>, skipped: list<array{wallet: string, reason: string}>}
     */
    public function setRole(Circle $circle, User $actor, User $person, string $role, array $perms): array
    {
        if ($circle->owner_id !== $actor->id) {
            throw ValidationException::withMessages(['role' => 'Only the circle owner can change roles.']);
        }
        if ($person->id === $actor->id) {
            throw ValidationException::withMessages(['role' => "You're the owner. Hand the circle to someone else to change your own role."]);
        }
        if ($person->isChild()) {
            throw ValidationException::withMessages(['role' => "A child's wallet has its own settings."]);
        }
        $people = $this->people($circle, $actor);
        if (!isset($people[$person->id])) {
            throw ValidationException::withMessages(['member' => 'They are not in this circle.']);
        }
        $perms = array_map('boolval', array_intersect_key($perms + CircleMember::DEFAULTS[$role], CircleMember::DEFAULTS[$role]));

        $updated = [];
        $skipped = [];
        DB::transaction(function () use ($circle, $actor, $person, $role, $perms, &$updated, &$skipped) {
            CircleMember::updateOrCreate(['circle_id' => $circle->id, 'user_id' => $person->id], ['role' => $role, 'permissions' => $perms]);

            foreach ($this->universe($circle, $actor) as $w) {
                if ($w->user_id !== $actor->id || in_array($w->type, ['ajo', 'child'], true)) {
                    continue;
                }
                $row = $w->members->firstWhere('user_id', $person->id);
                if (!$row || !empty(($row->permissions ?? [])['accountant'])) {
                    continue;
                }
                // Approving is what makes a co-owner or admin on a wallet.
                $walletRole = $perms['approve'] ? $role : 'contributor';
                if ($walletRole === 'contributor' && $role !== 'contributor' && $row->role === 'viewer') {
                    $walletRole = 'viewer';
                }
                if ($w->type === 'joint' && $row->role === 'co_owner' && $walletRole !== 'co_owner') {
                    $skipped[] = ['wallet' => $w->name, 'reason' => "Joint wallet: {$person->first_name} has to agree."];
                    continue;
                }
                $canApprove = $walletRole !== 'viewer' && $perms['approve'];
                $losingApproval = $w->canApprove($person) && !$canApprove && !in_array($walletRole, ['co_owner', 'admin'], true);
                if ($losingApproval && $w->approval_enabled) {
                    $remaining = $w->eligibleApprovers()->reject(fn ($id) => $id === $person->id)->count();
                    if ((int) $w->required_approvals > max(1, $remaining - 1)) {
                        $skipped[] = ['wallet' => $w->name, 'reason' => "It needs {$w->required_approvals} approvers. Lower that first."];
                        continue;
                    }
                }
                $p = $row->permissions ?? [];
                $p['withdraw'] = $perms['send'] && in_array($walletRole, ['admin', 'contributor'], true);
                $p['can_spend'] = $p['withdraw'];
                $before = $row->role;
                $row->update(['role' => $walletRole, 'can_approve' => $canApprove, 'permissions' => $p]);
                if ($before !== $walletRole) {
                    AuditService::make()->log($w, $actor, 'member_role_changed', "{$person->fullName()} role changed to {$walletRole}", ['user_id' => $person->id, 'role' => $walletRole]);
                }
                AuditService::make()->log($w, $actor, 'permissions_changed', "Permissions updated for {$person->fullName()}", ['user_id' => $person->id]);
                $updated[] = $w->name;
            }
        });

        NotificationService::make()->push($person, 'circle_role_changed', "You're now {$this->article($role)} in {$circle->name}",
            "{$actor->first_name} changed what you can do in {$circle->name}.", ['circle_id' => $circle->id]);

        return ['updated' => $updated, 'skipped' => $skipped];
    }

    private function article(string $role): string
    {
        $label = strtolower($this->roleLabel($role));

        return (in_array($label[0], ['a', 'e', 'i', 'o', 'u'], true) ? 'an ' : 'a ') . $label;
    }

    // ------------------------------------------------------------------ FAM-09

    /** FAM-09 "Remove Aunty Ada?": what stays, which wallets, the emergency fund. */
    public function removePreview(Circle $circle, User $actor, User $person): array
    {
        $this->guardRemove($circle, $actor, $person);
        $manage = WalletManageService::make();
        $affected = [];
        $put = [];
        $keyholder = [];
        $kept = [];
        foreach ($this->universe($circle, $actor) as $w) {
            $row = $w->members->firstWhere('user_id', $person->id);
            if ($w->user_id === $person->id) {
                $kept[] = ['wallet' => $w->name, 'reason' => "It's {$person->first_name}'s own wallet."];
                continue;
            }
            if (!$row) {
                continue;
            }
            if ($w->type === 'joint' && $row->role === 'co_owner') {
                $kept[] = ['wallet' => $w->name, 'reason' => 'A joint partner gives notice to leave.'];
                continue;
            }
            $affected[] = $w->name;
            $in = (int) ($manage->contributions($w)['by_user'][$person->id] ?? 0);
            if ($in > 0) {
                $put[] = ['wallet' => $w->name, 'amount' => $in];
            }
            $setting = $w->type === 'emergency' ? EmergencySetting::where('wallet_id', $w->id)->first() : null;
            if ($setting && in_array($person->id, array_map('intval', $setting->keyholder_ids ?? []), true)) {
                $keyholder[] = $w->name;
            }
        }
        $total = array_sum(array_column($put, 'amount'));
        $short = fn (string $name) => preg_replace('/\s+(\d{4}|fund|wallet)$/i', '', $name);

        return [
            'name' => $person->fullName(),
            'first_name' => $person->first_name,
            'circle' => $circle->name,
            'contributions' => $total > 0 ? [
                'total' => $this->naira($total) . ' stay in the wallets',
                'detail' => implode(' · ', array_map(fn ($p) => $short($p['wallet']) . ' ' . $this->naira($p['amount']), $put)),
            ] : null,
            'wallets' => $affected,
            'keyholder' => $keyholder ? ['wallets' => $keyholder, 'days' => self::KEYHOLDER_DAYS] : null,
            'kept' => $kept,
        ];
    }

    private function guardRemove(Circle $circle, User $actor, User $person): void
    {
        if (!$this->canManage($circle, $actor)) {
            throw ValidationException::withMessages(['member' => 'Only the circle owner, or a co-owner allowed to, can remove people.']);
        }
        if ($person->id === $circle->owner_id) {
            throw ValidationException::withMessages(['member' => "The circle's owner can't be removed."]);
        }
        if ($person->id === $actor->id) {
            throw ValidationException::withMessages(['member' => 'To leave, ask the owner to remove you.']);
        }
        if (!isset($this->people($circle, $actor)[$person->id])) {
            throw ValidationException::withMessages(['member' => 'They are not in this circle.']);
        }
    }

    /** FAM-09: out of every wallet in the circle; what they put in stays. */
    public function remove(Circle $circle, User $actor, User $person): array
    {
        $preview = $this->removePreview($circle, $actor, $person);
        $removed = [];
        DB::transaction(function () use ($circle, $actor, $person, &$removed) {
            foreach ($this->universe($circle, $actor) as $w) {
                $row = $w->members->firstWhere('user_id', $person->id);
                if (!$row || $w->user_id === $person->id || ($w->type === 'joint' && $row->role === 'co_owner')) {
                    continue;
                }
                if ($w->approval_enabled && $w->canApprove($person)) {
                    $remaining = $w->eligibleApprovers()->reject(fn ($id) => $id === $person->id)->count();
                    if ((int) $w->required_approvals > max(1, $remaining - 1)) {
                        throw ValidationException::withMessages(['member' => "{$w->name} needs {$w->required_approvals} approvers. Lower that first, then remove {$person->first_name}."]);
                    }
                }
                $setting = $w->type === 'emergency' ? EmergencySetting::where('wallet_id', $w->id)->first() : null;
                if ($setting && in_array($person->id, array_map('intval', $setting->keyholder_ids ?? []), true)) {
                    $setting->update(['keyholder_ids' => array_values(array_diff(array_map('intval', $setting->keyholder_ids), [$person->id]))]);
                    $meta = $w->meta ?? [];
                    $meta['keyholder_needed_by'] = now()->addDays(self::KEYHOLDER_DAYS)->toDateString();
                    $w->update(['meta' => $meta]);
                }
                $row->delete();
                AuditService::make()->log($w, $actor, 'member_removed', "{$person->fullName()} was removed from the circle", ['user_id' => $person->id, 'role' => $row->role, 'circle_id' => $circle->id]);
                $removed[] = $w->name;
            }
            $circle->members()->where('user_id', $person->id)->delete();
            WalletInvitation::where('status', 'pending')->where('invitee_user_id', $person->id)
                ->whereIn('wallet_id', $this->universe($circle, $actor)->pluck('id'))->update(['status' => 'cancelled']);
        });

        NotificationService::make()->push($person, 'circle_removed', "You've left {$circle->name}",
            "{$actor->first_name} removed you. You no longer see the {$circle->name} wallets. What you put in stays in them.", ['circle_id' => $circle->id]);
        if ($preview['keyholder']) {
            NotificationService::make()->push($circle->owner, 'keyholder_needed', 'Pick a new keyholder',
                implode(', ', $preview['keyholder']['wallets']) . " needs a new keyholder within " . self::KEYHOLDER_DAYS . ' days.',
                ['wallet_id' => Wallet::where('name', $preview['keyholder']['wallets'][0])->where('user_id', $circle->owner_id)->value('id')]);
        }

        return ['removed' => $removed, 'kept' => $preview['kept']];
    }

    // ------------------------------------------------------------------ FAM-10

    /**
     * FAM-10 "Family activity": money in and out, requests and answers, people
     * joining and leaving, and rule changes, across the circle's wallets.
     *
     * @return list<array<string, mixed>>
     */
    public function activity(Circle $circle, User $viewer, string $filter = 'everyone', ?int $personId = null, int $limit = 60, ?string $before = null): array
    {
        $wallets = $this->visibleWallets($circle, $viewer);
        $ids = $wallets->pluck('id');
        $names = $wallets->pluck('name', 'id');
        if ($ids->isEmpty()) {
            return [];
        }
        $until = $before ? Carbon::parse($before) : null;
        $items = collect();
        $first = fn (?User $u) => $u ? ($u->id === $viewer->id ? 'You' : ($u->first_name ?: $u->fullName())) : 'Someone';
        $who = fn (?User $u) => $u ? ['id' => $u->id, 'name' => $u->fullName(), 'initials' => $this->initials($u)] : null;

        if (in_array($filter, ['everyone', 'money'], true)) {
            Transaction::with('user')->whereIn('wallet_id', $ids)->where('status', 'successful')
                ->where(fn ($q) => $q->where(fn ($q) => $q->where('direction', 'credit')->whereIn('type', WalletManageService::PUT_IN_TYPES))
                    ->orWhere(fn ($q) => $q->where('direction', 'debit')->whereIn('type', ['withdrawal', 'payment', 'bill'])))
                ->whereNotNull('user_id')
                ->when($personId, fn ($q) => $q->where('user_id', $personId))
                ->when($until, fn ($q) => $q->where('created_at', '<', $until))
                ->latest('id')->limit($limit)->get()
                ->each(function (Transaction $t) use ($items, $names, $first, $who) {
                    $wallet = $names[$t->wallet_id] ?? 'a wallet';
                    $to = $t->counterparty['account_name'] ?? $t->counterparty['name'] ?? null;
                    $items->push([
                        'id' => 't' . $t->id,
                        'kind' => 'money',
                        'at' => $t->created_at->toIso8601String(),
                        'actor' => $who($t->user),
                        'text' => $t->direction === 'credit'
                            ? "{$first($t->user)} added {$this->naira((int) $t->amount)} to {$wallet}"
                            : "{$first($t->user)} paid {$this->naira((int) $t->amount)} from {$wallet}" . ($to ? ' to ' . ucwords(strtolower($to)) : ''),
                        'amount' => ($t->direction === 'credit' ? '+' : '-') . $this->naira((int) $t->amount),
                        'direction' => $t->direction,
                        'wallet_id' => $t->wallet_id,
                    ]);
                });
        }

        if (in_array($filter, ['everyone', 'approvals'], true)) {
            ApprovalRequest::with('initiator')->whereIn('wallet_id', $ids)
                ->when($personId, fn ($q) => $q->where('initiator_id', $personId))
                ->when($until, fn ($q) => $q->where('created_at', '<', $until))
                ->latest('id')->limit($limit)->get()
                ->each(function (ApprovalRequest $r) use ($items, $first, $who) {
                    $for = trim((string) ($r->description ?? ''));
                    $items->push([
                        'id' => 'r' . $r->id,
                        'kind' => 'approvals',
                        'at' => $r->created_at->toIso8601String(),
                        'actor' => $who($r->initiator),
                        'text' => "{$first($r->initiator)} asked for {$this->naira((int) $r->amount)}" . ($for !== '' ? ' for ' . lcfirst($for) : ''),
                        'amount' => null,
                        'direction' => null,
                        'wallet_id' => $r->wallet_id,
                        'request_id' => $r->id,
                    ]);
                });
        }

        $events = match ($filter) {
            'approvals' => ['approval_approved', 'approval_rejected'],
            'people' => ['member_added', 'member_removed', 'member_role_changed'],
            'money' => [],
            default => ['approval_approved', 'approval_rejected', 'member_added', 'member_removed', 'member_role_changed', 'rules_changed', 'rule_added', 'settings_changed', 'lock_set', 'lock_removed', 'wallet_created', 'wallet_frozen', 'wallet_unfrozen'],
        };
        if ($events) {
            WalletAuditLog::with('actor')->whereIn('wallet_id', $ids)->whereIn('event', $events)
                ->when($personId, fn ($q) => $q->where(fn ($q) => $q->where('actor_id', $personId)->orWhere('meta->user_id', $personId)))
                ->when($until, fn ($q) => $q->where('created_at', '<', $until))
                ->latest('id')->limit($limit)->get()
                ->each(function (WalletAuditLog $log) use ($items, $names, $first, $who) {
                    $wallet = $names[$log->wallet_id] ?? 'a wallet';
                    $desc = (string) $log->description;
                    $text = match ($log->event) {
                        'member_added' => preg_replace('/ joined (as \w+|the circle)$/', '', $desc) . " joined {$wallet}",
                        'member_removed' => preg_replace('/ was removed from the (wallet|circle)$/', '', $desc) . " left {$wallet}",
                        'wallet_created' => "{$first($log->actor)} made {$wallet}",
                        'member_role_changed' => "{$first($log->actor)} changed " . preg_replace('/ role changed to (\w+)$/', "'s role on {$wallet}", $desc),
                        default => "{$first($log->actor)} " . lcfirst($desc) . ($log->event === 'approval_approved' || $log->event === 'approval_rejected' ? '' : " · {$wallet}"),
                    };
                    // "Kemi Adebayo joined" → "Kemi joined": first names read better in a feed.
                    if (in_array($log->event, ['member_added', 'member_removed'], true)) {
                        $text = preg_replace('/^(\S+)\s+\S+(?= (joined|left))/u', '$1', $text);
                    }
                    $items->push([
                        'id' => 'a' . $log->id,
                        'kind' => in_array($log->event, ['approval_approved', 'approval_rejected'], true) ? 'approvals' : (str_starts_with($log->event, 'member_') ? 'people' : 'rules'),
                        'at' => $log->created_at->toIso8601String(),
                        'actor' => in_array($log->event, ['member_added', 'member_removed'], true) && ($uid = $log->meta['user_id'] ?? null)
                            ? $who(User::find($uid)) ?? $who($log->actor)
                            : $who($log->actor),
                        'text' => $text,
                        'amount' => null,
                        'direction' => null,
                        'wallet_id' => $log->wallet_id,
                    ]);
                });
        }

        return $items->sortByDesc('at')->take($limit)->values()->all();
    }

    // ------------------------------------------------------------------ FAM-12

    /** FAM-12: who can take the circle over, and what they'd need. */
    public function transferCandidates(Circle $circle, User $owner): array
    {
        return collect($this->people($circle, $owner))
            ->reject(fn ($p) => $p['user']->isChild())
            ->map(function ($p) use ($circle) {
                $u = $p['user'];
                $role = $this->roleLabel($this->roleIn($circle, $u) ?? 'contributor');
                $ok = (int) $u->kyc_tier >= 3;

                return [
                    'id' => $u->id,
                    'name' => $u->fullName(),
                    'line' => $role . ' · ' . ($ok ? 'verified Tier 3' : 'would need Tier 3'),
                    'eligible' => $ok,
                ];
            })
            ->sortByDesc('eligible')->values()->all();
    }

    /** "Continue with PIN": the new owner has 7 days to accept. */
    public function requestTransfer(Circle $circle, User $owner, User $to, string $pin): Circle
    {
        if ($circle->owner_id !== $owner->id) {
            throw ValidationException::withMessages(['circle' => 'Only the owner can hand the circle over.']);
        }
        if ($circle->pending_owner_id && $circle->pending_owner_id !== $to->id) {
            throw ValidationException::withMessages(['to_user_id' => 'You already asked someone. Cancel that first.']);
        }
        $candidate = collect($this->transferCandidates($circle, $owner))->firstWhere('id', $to->id);
        if (!$candidate) {
            throw ValidationException::withMessages(['to_user_id' => 'Pick someone in this circle.']);
        }
        if (!$candidate['eligible']) {
            throw ValidationException::withMessages(['to_user_id' => "{$to->first_name} needs to be verified to Tier 3 to own a circle."]);
        }
        app(PinService::class)->verify($owner, $pin);
        $circle->update([
            'pending_owner_id' => $to->id,
            'transfer_requested_at' => now(),
            'transfer_accepted_at' => null,
            'transfer_effective_at' => null,
        ]);
        NotificationService::make()->push($to, 'circle_transfer', "{$owner->first_name} wants to hand you {$circle->name}",
            "Accept within " . self::ACCEPT_DAYS . " days. You'd own the circle; {$owner->first_name} becomes a co-owner.", ['circle_id' => $circle->id]);

        return $circle->fresh();
    }

    public function acceptTransfer(Circle $circle, User $to): Circle
    {
        $this->settle($circle);
        if ($circle->pending_owner_id !== $to->id || $circle->transfer_accepted_at) {
            throw ValidationException::withMessages(['circle' => 'There is nothing to accept.']);
        }
        $circle->update(['transfer_accepted_at' => now(), 'transfer_effective_at' => now()->addHours(self::EFFECT_HOURS)]);
        NotificationService::make()->push($circle->owner, 'circle_transfer_accepted', "{$to->first_name} accepted {$circle->name}",
            "It's theirs from " . $circle->transfer_effective_at->timezone('Africa/Lagos')->format('D j M, g:i a') . '. You can cancel until then.', ['circle_id' => $circle->id]);

        return $circle->fresh();
    }

    /** The owner changes their mind, or the person asked says no. */
    public function cancelTransfer(Circle $circle, User $actor): Circle
    {
        $this->settle($circle);
        if (!$circle->pending_owner_id || !in_array($actor->id, [$circle->owner_id, $circle->pending_owner_id], true)) {
            throw ValidationException::withMessages(['circle' => 'There is no hand-over to cancel.']);
        }
        $other = $actor->id === $circle->owner_id ? $circle->pendingOwner : $circle->owner;
        $circle->update(['pending_owner_id' => null, 'transfer_requested_at' => null, 'transfer_accepted_at' => null, 'transfer_effective_at' => null]);
        if ($other) {
            NotificationService::make()->push($other, 'circle_transfer_cancelled', "{$circle->name} stays with " . ($actor->id === $circle->owner_id ? $actor->first_name : $other->first_name),
                $actor->id === $circle->owner_id ? "{$actor->first_name} cancelled the hand-over." : "{$actor->first_name} said no to owning it.", ['circle_id' => $circle->id]);
        }

        return $circle->fresh();
    }

    /** Apply a hand-over whose 24 hours are up; drop one nobody accepted in 7 days. */
    public function settle(Circle $circle): Circle
    {
        if (!$circle->pending_owner_id) {
            return $circle;
        }
        if (!$circle->transfer_accepted_at && $circle->transfer_requested_at?->lt(now()->subDays(self::ACCEPT_DAYS))) {
            $circle->update(['pending_owner_id' => null, 'transfer_requested_at' => null]);

            return $circle;
        }
        if ($circle->transfer_effective_at && $circle->transfer_effective_at->lte(now())) {
            DB::transaction(function () use ($circle) {
                $old = $circle->owner_id;
                $new = $circle->pending_owner_id;
                $circle->update(['owner_id' => $new, 'pending_owner_id' => null, 'transfer_requested_at' => null, 'transfer_accepted_at' => null, 'transfer_effective_at' => null]);
                $circle->members()->where('user_id', $new)->delete();
                CircleMember::updateOrCreate(['circle_id' => $circle->id, 'user_id' => $old], ['role' => 'co_owner', 'permissions' => CircleMember::DEFAULTS['co_owner']]);
            });
            $circle->refresh();
            foreach ([$circle->owner, User::find($circle->members()->where('role', 'co_owner')->latest('updated_at')->value('user_id'))] as $u) {
                if ($u) {
                    NotificationService::make()->push($u, 'circle_transfer_done', "{$circle->owner->first_name} now owns {$circle->name}", 'The hand-over is complete.', ['circle_id' => $circle->id]);
                }
            }
        }

        return $circle;
    }

    public function settleAll(): int
    {
        $n = 0;
        Circle::whereNotNull('pending_owner_id')->get()->each(function (Circle $c) use (&$n) {
            $before = $c->owner_id;
            if ($this->settle($c)->owner_id !== $before) {
                $n++;
            }
        });

        return $n;
    }
}
