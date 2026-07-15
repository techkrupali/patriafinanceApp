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
        ]);

        $update = [];
        if ($request->exists('role')) {
            $update['role'] = $data['role'];
        }
        if ($request->exists('can_approve')) {
            $update['can_approve'] = $request->boolean('can_approve');
        }

        if (!$update) {
            return $this->fail('Nothing to update', 422);
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

        $member->update($update);

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

        $removedUser = $member->user;
        $member->delete();

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
