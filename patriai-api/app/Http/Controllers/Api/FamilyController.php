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

        // Wallets the user owns, plus wallets where they are an active member.
        $ownedIds = $user->wallets()->pluck('id')->all();
        $memberIds = WalletMember::where('user_id', $user->id)
            ->where('status', 'active')
            ->pluck('wallet_id')
            ->all();
        $walletIds = array_values(array_unique(array_merge($ownedIds, $memberIds)));

        $wallets = Wallet::whereIn('id', $walletIds)
            ->with([
                'owner',
                'members' => fn ($q) => $q->where('status', 'active')->with('user'),
            ])
            ->get();

        // Aggregate distinct people (by user_id) across those wallets, excluding the
        // authed user. $people[user_id] => ['user' => User, 'memberships' => [...], 'types' => [...]].
        $people = [];

        $addPerson = function (?User $person, string $role, bool $canApprove, Wallet $wallet) use (&$people, $user) {
            if (!$person || $person->id === $user->id) {
                return;
            }

            if (!isset($people[$person->id])) {
                $people[$person->id] = ['user' => $person, 'memberships' => [], 'wallet_ids' => [], 'types' => []];
            }

            // One membership entry per wallet per person (the owner entry wins over a
            // stray member row for the same wallet).
            if (in_array($wallet->id, $people[$person->id]['wallet_ids'], true)) {
                return;
            }

            $people[$person->id]['wallet_ids'][] = $wallet->id;
            $people[$person->id]['types'][] = $wallet->type;
            $people[$person->id]['memberships'][] = [
                'wallet_id' => $wallet->id,
                'wallet_name' => $wallet->name,
                'role' => $role,
                'can_approve' => $canApprove,
            ];
        };

        foreach ($wallets as $wallet) {
            // The wallet owner is a person even when they hold no member row.
            $addPerson($wallet->owner, 'owner', true, $wallet);

            foreach ($wallet->members as $member) {
                $addPerson($member->user, $member->role, $this->memberCanApprove($member->role, (bool) $member->can_approve), $wallet);
            }
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

            $members[] = [
                'id' => $u->id,
                'name' => $u->fullName(),
                'email' => $u->email,
                'avatar' => $this->initials($u),
                'role' => $topRole,
                'status' => 'active',
                'memberships' => $person['memberships'],
            ];
        }

        // ---- Pending invitations (sent + received) ----
        $sent = WalletInvitation::with('wallet')
            ->where('inviter_id', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->get()
            ->map(fn ($i) => $this->serializeFamilyInvitation($i, 'sent'));

        $email = strtolower((string) $user->email);
        $phone = $user->phone;

        $received = WalletInvitation::with(['wallet', 'inviter'])
            ->where('status', 'pending')
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
        $sharedWallets = $wallets->whereIn('type', self::SHARED_TYPES)->count();
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
