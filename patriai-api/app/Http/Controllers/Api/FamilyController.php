<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FamilyController extends ApiController
{
    /** Role precedence for deriving a person's top-level label across wallets. */
    private const ROLE_RANK = ['owner' => 5, 'co_owner' => 4, 'admin' => 3, 'contributor' => 2, 'viewer' => 1];

    /** Wallet types that represent a shared/collaborative wallet. */
    private const SHARED_TYPES = ['shared', 'joint', 'child', 'project'];

    // GET /family
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // FAM-01 for one circle (HOM-06): your own family unless ?circle= says otherwise.
        $circles = \App\Services\CircleService::make();
        $circle = $circles->resolve($user, $request->integer('circle') ?: null);
        $wallets = $circles->universe($circle, $user);
        $walletIds = $wallets->pluck('id')->all();
        $people = [];
        foreach ($circles->people($circle, $user, $wallets) as $id => $p) {
            $people[$id] = $p + [
                'wallet_ids' => array_column($p['memberships'], 'wallet_id'),
                'types' => array_column($p['memberships'], 'wallet_type'),
            ];
        }

        $members = [];
        foreach ($people as $person) {
            $u = $person['user'];

            $topRole = null;
            $topRank = -1;
            foreach ($person['memberships'] as $m) {
                $rank = self::ROLE_RANK[$m['role']] ?? 0;
                if ($rank > $topRank) {
                    $topRank = $rank;
                    $topRole = $m['role'];
                }
            }

            // A circle role (FAM-08) or ownership of the circle wins over wallet roles.
            $circleRole = $circles->roleIn($circle, $u, $wallets);
            if ($circleRole && ($circleRole === 'owner' || $circles->membership($circle, $u))) {
                $topRole = $circleRole;
            } elseif ($topRole === 'owner') {
                $topRole = 'co_owner';
            }

            $members[] = [
                'id' => $u->id,
                'name' => $u->fullName(),
                'email' => $u->email,
                'avatar' => $this->initials($u),
                'role' => $topRole,
                'status' => 'active',
                // JNT-01 "Co-owner · verified": BVN checked (a joint wallet needs both).
                'verified' => (int) $u->kyc_tier >= 1,
                // A child's own sign-in (CHW-06): family, but never a keyholder, co-owner or invitee.
                'is_child' => $u->isChild(),
                'memberships' => $person['memberships'],
            ];
        }

        // ---- Pending invitations (sent + received) ----
        $sent = WalletInvitation::with('wallet')
            ->where('inviter_id', $user->id)
            ->where('status', 'pending')
            ->when(!$circle->is_home, fn ($q) => $q->whereIn('wallet_id', $walletIds))
            ->latest()
            ->get()
            ->map(fn ($i) => $this->serializeFamilyInvitation($i, 'sent'));

        $email = strtolower((string) $user->email);
        $phone = $user->phone;

        $received = WalletInvitation::with(['wallet', 'inviter'])
            ->where('status', 'pending')
            // Invites to you show in your own family; another circle shows only its own.
            ->when(!$circle->is_home || $circle->created_by !== $user->id, fn ($q) => $q->whereIn('wallet_id', $walletIds))
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->where(function ($q) use ($user, $email, $phone) {
                $q->where('invitee_user_id', $user->id)
                    ->orWhereRaw('LOWER(invitee_identifier) = ?', [$email]);
                if (!empty($phone)) {
                    $q->orWhere('invitee_identifier', $phone);
                }
            })
            ->latest()
            ->get()
            ->map(fn ($i) => $this->serializeFamilyInvitation($i, 'received'));

        // ---- Stats (only cleanly derivable values) ----
        // "4 shared wallets": wallets with someone besides their owner in them.
        $sharedWallets = $wallets->filter(fn ($w) => $w->members->contains(fn ($m) => $m->user_id !== $w->user_id))->count();
        $childWallets = $wallets->where('type', 'child')->count();

        $vendorMembers = 0;
        foreach ($people as $person) {
            $isVendor = false;
            foreach ($person['memberships'] as $m) {
                if ($m['role'] === 'vendor') {
                    $isVendor = true;
                    break;
                }
            }
            if (!$isVendor && in_array('project', $person['types'], true)) {
                $isVendor = true;
            }
            if ($isVendor) {
                $vendorMembers++;
            }
        }

        $stats = [
            'total_members' => count($members),
            'shared_wallets' => $sharedWallets,
            'pending_invites' => $sent->count(),
            'child_wallets' => $childWallets,
            'vendor_members' => $vendorMembers,
        ];

        return $this->ok('Family fetched', [
            'circle' => $circles->describe($circle, $user) + ['circles_count' => count($circles->forUser($user))],
            'members' => array_values($members),
            'pending_invitations' => [
                'sent' => $sent->values(),
                'received' => $received->values(),
            ],
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

    private function serializeFamilyInvitation(WalletInvitation $invitation, string $direction): array
    {
        return [
            'id' => $invitation->id,
            'direction' => $direction,
            'wallet_id' => $invitation->wallet_id,
            'wallet_name' => $invitation->wallet?->name,
            'invited_identifier' => $invitation->invitee_identifier,
            'role' => $invitation->role,
            'status' => $invitation->status,
            'inviter' => $direction === 'received' && $invitation->relationLoaded('inviter') && $invitation->inviter ? [
                'id' => $invitation->inviter->id,
                'name' => $invitation->inviter->fullName(),
            ] : null,
            'expires_at' => $invitation->expires_at?->toIso8601String(),
            'created_at' => $invitation->created_at?->toIso8601String(),
        ];
    }
}
