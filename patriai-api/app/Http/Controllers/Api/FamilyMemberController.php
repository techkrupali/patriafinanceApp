<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FamilyMemberController extends ApiController
{
    /** Role precedence for deriving a person's top-level label across wallets (mirrors FamilyController). */
    private const ROLE_RANK = ['owner' => 5, 'co_owner' => 4, 'admin' => 3, 'contributor' => 2, 'viewer' => 1];

    // GET /family/{member}
    public function show(Request $request, User $member): JsonResponse
    {
        $user = $request->user();

        // Self is not a family member.
        if ($member->id === $user->id) {
            return $this->fail('Family member not found', 404);
        }

        // Same wallet universe as FamilyController::index — wallets the user owns,
        // plus wallets where they are an active member — so every person listed by
        // GET /family is always resolvable here.
        $ownedIds = $user->wallets()->pluck('id')->all();
        $memberIds = WalletMember::where('user_id', $user->id)
            ->where('status', 'active')
            ->pluck('wallet_id')
            ->all();
        $walletIds = array_values(array_unique(array_merge($ownedIds, $memberIds)));

        $wallets = Wallet::whereIn('id', $walletIds)
            ->with(['members' => fn ($q) => $q->where('status', 'active')])
            ->get();

        // Shared wallets: from that universe, ones where the target person is the
        // owner or an active member.
        $shared = $wallets->filter(
            fn (Wallet $wallet) => $wallet->user_id === $member->id
                || $wallet->members->firstWhere('user_id', $member->id) !== null
        )->values();

        if ($shared->isEmpty()) {
            return $this->fail('Family member not found', 404);
        }

        // ---- Memberships (one entry per shared wallet; owner wins over a stray member row) ----
        $memberships = [];
        $topRole = null;
        $topRank = -1;

        foreach ($shared as $wallet) {
            $isOwner = $wallet->user_id === $member->id;
            $row = $isOwner ? null : $wallet->members->firstWhere('user_id', $member->id);
            $role = $isOwner ? 'owner' : $row->role;

            $rank = self::ROLE_RANK[$role] ?? 0;
            if ($rank > $topRank) {
                $topRank = $rank;
                $topRole = $role;
            }

            $memberships[] = [
                'wallet_id' => $wallet->id,
                'wallet_name' => $wallet->name,
                'wallet_type' => $wallet->type,
                'role' => $role,
                'can_approve' => $isOwner ? true : $this->memberCanApprove($row->role, (bool) $row->can_approve),
                'permissions' => $isOwner
                    ? ['view' => true, 'fund' => true, 'request' => true, 'withdraw' => true, 'request_limit' => null]
                    : $this->serializeMemberPermissions($row),
                // WalletMember row id (null for the owner) — the app PATCHes
                // wallets/{wallet}/members/{member} with it.
                'member_row_id' => $row?->id,
            ];
        }

        // ---- Recent spend requests (only on shared wallets the viewer can manage) ----
        $manageableIds = $shared
            ->filter(fn (Wallet $w) => in_array($w->roleOf($user), ['owner', 'co_owner'], true))
            ->pluck('id')
            ->all();

        $requests = ApprovalRequest::where('initiator_id', $member->id)
            ->whereIn('wallet_id', $manageableIds);

        $recent = (clone $requests)
            ->with(['wallet', 'initiator'])
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($req) => $this->serializeApprovalRequest($req, $user));

        $stats = [
            'shared_wallets' => $shared->count(),
            'pending_requests' => (clone $requests)->where('status', 'pending')->count(),
            'approved_requests_30d' => (clone $requests)
                ->whereIn('status', ['approved', 'executed'])
                ->where('created_at', '>=', now()->subDays(30))
                ->count(),
        ];

        return $this->ok('Family member fetched', [
            'person' => [
                'id' => $member->id,
                'name' => $member->fullName(),
                'email' => $member->email,
                'avatar' => $this->initials($member),
                'role' => $topRole,
                'member_since' => $member->created_at?->toIso8601String(),
            ],
            'memberships' => $memberships,
            'recent_requests' => $recent->values(),
            'stats' => $stats,
        ]);
    }

    /** Effective approval eligibility for a member row (mirrors Wallet::canApprove). */
    private function memberCanApprove(string $role, bool $canApprove): bool
    {
        if ($role === 'viewer') {
            return false;
        }

        return in_array($role, ['owner', 'co_owner', 'admin'], true) || $canApprove;
    }

    /** Uppercase initials from a user's name, falling back to their email. */
    private function initials(User $user): string
    {
        $parts = preg_split('/\s+/', trim($user->fullName()), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $initials = '';
        foreach (array_slice($parts, 0, 2) as $part) {
            $initials .= mb_strtoupper(mb_substr($part, 0, 1));
        }
        if ($initials === '') {
            $initials = mb_strtoupper(mb_substr((string) $user->email, 0, 1)) ?: '?';
        }

        return $initials;
    }
}
