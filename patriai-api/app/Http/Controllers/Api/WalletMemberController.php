<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletMemberController extends ApiController
{
    // GET /wallets/{wallet}/members
    public function index(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $members = $wallet->members()->with('user')->where('status', 'active')->get()
            ->map(fn ($m) => $this->serializeMember($m));

        return $this->ok('Members fetched', ['members' => $members]);
    }

    // PATCH /wallets/{wallet}/members/{member}  { role?, can_approve? }
    public function update(Request $request, Wallet $wallet, WalletMember $member): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can manage members', 403);
        }

        if ($member->wallet_id !== $wallet->id) {
            return $this->fail('Member not found in this wallet', 404);
        }
        if ($member->role === 'owner' || $member->user_id === $wallet->user_id) {
            return $this->fail('The wallet owner cannot be modified', 422);
        }

        $data = $request->validate([
            'role' => ['sometimes', 'in:co_owner,admin,contributor,viewer'],
            'can_approve' => ['sometimes', 'boolean'],
            'can_spend' => ['sometimes', 'boolean'],
            // Granular access matrix ("Assign Wallet Access & Roles"): per-member
            // toggles merged into the member's permissions JSON (all optional).
            'permissions' => ['sometimes', 'array'],
            'permissions.view' => ['sometimes', 'boolean'],
            'permissions.fund' => ['sometimes', 'boolean'],
            'permissions.request' => ['sometimes', 'boolean'],
            'permissions.withdraw' => ['sometimes', 'boolean'],
        ]);

        $update = [];
        if ($request->exists('role')) {
            $update['role'] = $data['role'];
        }
        if ($request->exists('can_approve')) {
            $update['can_approve'] = $request->boolean('can_approve');
        }

        $changingSpend = $request->exists('can_spend');
        $changingPermissions = $request->exists('permissions');

        if (!$update && !$changingSpend && !$changingPermissions) {
            return $this->fail('Nothing to update', 422);
        }

        // On approval-enabled wallets, the approver set (who can approve, and
        // roles that confer approval eligibility) is owner-only territory — a
        // co_owner must not be able to manufacture or reshape approvers.
        if ($wallet->approval_enabled === true
            && (array_key_exists('role', $update) || array_key_exists('can_approve', $update))
            && $role !== 'owner') {
            return $this->fail('Only the owner can change approvers on an approval-enabled wallet', 403);
        }

        // Role ceiling: a member may never be promoted to a role that outranks
        // (or equals) the acting user's own role.
        if (array_key_exists('role', $update)) {
            $ranks = ['owner' => 5, 'co_owner' => 4, 'admin' => 3, 'contributor' => 2, 'viewer' => 1];
            if (($ranks[$update['role']] ?? 0) >= ($ranks[$role] ?? 0)) {
                return $this->fail('You cannot set a member to a role at or above your own', 403);
            }
        }

        // A viewer must never be an approver. If the resulting role is viewer,
        // reject an explicit can_approve=true and force the flag off.
        $resultingRole = $update['role'] ?? $member->role;
        if ($resultingRole === 'viewer') {
            if (($update['can_approve'] ?? false) === true) {
                return $this->fail('A viewer cannot be given approval rights', 422);
            }
            $update['can_approve'] = false;
        }

        // Merge the explicit spend grant and the granular access matrix
        // (view/fund/request/withdraw) into the member's permissions JSON,
        // preserving every existing key (incl. can_spend). withdraw is the same
        // gate as spending, so it is mirrored onto can_spend to keep canSpend()
        // and canWithdraw() in agreement — both keys are stored (CONTRACT A).
        if ($changingSpend || $changingPermissions) {
            $permissions = $member->permissions ?? [];

            if ($changingSpend) {
                $permissions['can_spend'] = $request->boolean('can_spend');
            }

            if ($changingPermissions) {
                foreach (['view', 'fund', 'request', 'withdraw'] as $key) {
                    if (array_key_exists($key, $data['permissions'])) {
                        $permissions[$key] = (bool) $data['permissions'][$key];
                    }
                }
                if (array_key_exists('withdraw', $data['permissions'])) {
                    $permissions['can_spend'] = (bool) $data['permissions']['withdraw'];
                }
            }

            $update['permissions'] = $permissions;
        }

        // A role that can never hold a spend grant must not keep a stale can_spend
        // (else demote-then-repromote would silently reactivate spending). Clear the
        // mirrored withdraw switch alongside it so the two never drift.
        if (!in_array($resultingRole, ['admin', 'contributor'], true)) {
            $permissions = $update['permissions'] ?? $member->permissions ?? [];
            if (($permissions['can_spend'] ?? false) !== false || ($permissions['withdraw'] ?? false) !== false) {
                $permissions['can_spend'] = false;
                $permissions['withdraw'] = false;
                $update['permissions'] = $permissions;
            }
        }

        $member->update($update);

        if (array_key_exists('role', $update)) {
            \App\Services\AuditService::make()->log($wallet, $request->user(), 'member_role_changed', ($member->user?->fullName() ?? 'Member') . " role changed to {$member->role}", ['member_id' => $member->id, 'user_id' => $member->user_id, 'role' => $member->role]);
        }
        if ($changingSpend || $changingPermissions) {
            \App\Services\AuditService::make()->log($wallet, $request->user(), 'permissions_changed', 'Permissions updated for ' . ($member->user?->fullName() ?? 'member'), ['member_id' => $member->id, 'user_id' => $member->user_id, 'permissions' => $member->permissions]);
        }

        return $this->ok('Member updated', ['member' => $this->serializeMember($member->fresh('user'))]);
    }

    // DELETE /wallets/{wallet}/members/{member}
    public function destroy(Request $request, Wallet $wallet, WalletMember $member): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can remove members', 403);
        }

        if ($member->wallet_id !== $wallet->id) {
            return $this->fail('Member not found in this wallet', 404);
        }
        if ($member->role === 'owner' || $member->user_id === $wallet->user_id) {
            return $this->fail('The wallet owner cannot be removed', 422);
        }

        // On approval-enabled wallets, removing a member can shrink the approver
        // set, so it is owner-only (a co_owner must not remove approvers).
        if ($wallet->approval_enabled === true && $role !== 'owner') {
            return $this->fail('Only the owner can remove members on an approval-enabled wallet', 403);
        }

        // Removing an approver must not strand required_approvals (the initiator is
        // always excluded, so at most approvers-1 sign-offs are collectable). Block
        // the removal if it would make gated spends permanently unreachable.
        if ($wallet->approval_enabled === true) {
            $remaining = $wallet->eligibleApprovers()->reject(fn ($id) => $id === $member->user_id)->count();
            $required = (int) $wallet->required_approvals;
            if ($required > max(1, $remaining - 1)) {
                return $this->fail("Removing this member would leave too few approvers for the required approvals ({$required}). Lower the required approvals first.", 422);
            }
        }

        $removedUser = $member->user;
        $member->delete();

        \App\Services\AuditService::make()->log($wallet, $request->user(), 'member_removed', ($removedUser ? $removedUser->fullName() : 'A member') . ' was removed from the wallet', ['user_id' => $member->user_id, 'role' => $member->role]);

        if ($removedUser) {
            NotificationService::make()->push(
                $removedUser,
                'wallet_member_removed',
                'Removed from a wallet',
                "You were removed from {$wallet->name}.",
                ['wallet_id' => $wallet->id, 'wallet_name' => $wallet->name],
            );
        }

        return $this->ok('Member removed');
    }
}
