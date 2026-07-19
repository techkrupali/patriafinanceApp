<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class InvitationController extends ApiController
{
    // POST /wallets/{wallet}/invitations  { identifier, role?, can_approve? }
    public function store(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner', 'admin'], true)) {
            return $this->fail('You do not have permission to invite members to this wallet', 403);
        }

        if ($wallet->type === 'main') {
            return $this->fail('Your main wallet cannot be shared', 422);
        }

        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:150'],
            'role' => ['sometimes', 'in:co_owner,admin,contributor,viewer'],
            'can_approve' => ['sometimes', 'boolean'],
        ]);

        $identifier = trim($data['identifier']);
        $inviteRole = $data['role'] ?? 'contributor';
        $canApprove = $request->boolean('can_approve');

        // Role ceiling: an inviter may never grant a role that outranks (or
        // equals) their own. The owner sits above every invitable role, so this
        // only ever constrains co_owner/admin inviters.
        $ranks = ['owner' => 5, 'co_owner' => 4, 'admin' => 3, 'contributor' => 2, 'viewer' => 1];
        if (($ranks[$inviteRole] ?? 0) >= ($ranks[$role] ?? 0)) {
            return $this->fail('You cannot invite someone at or above your own role', 403);
        }

        // A viewer is read-only and must never be granted approval rights.
        if ($inviteRole === 'viewer' && $canApprove) {
            return $this->fail('A viewer cannot be given approval rights', 422);
        }

        $invitee = str_contains($identifier, '@')
            ? User::where('email', strtolower($identifier))->first()
            : User::where('phone', $identifier)->first();

        if ($invitee && $invitee->id === $request->user()->id) {
            return $this->fail('You cannot invite yourself', 422);
        }

        if ($invitee) {
            $alreadyMember = $wallet->members()
                ->where('user_id', $invitee->id)
                ->where('status', 'active')
                ->exists();
            if ($alreadyMember || $invitee->id === $wallet->user_id) {
                return $this->fail('This person is already a member of the wallet', 422);
            }
        }

        $duplicate = $wallet->invitations()
            ->where('status', 'pending')
            ->where(function ($q) use ($identifier, $invitee) {
                $q->where('invitee_identifier', $identifier);
                if ($invitee) {
                    $q->orWhere('invitee_user_id', $invitee->id);
                }
            })
            ->exists();
        if ($duplicate) {
            return $this->fail('A pending invitation already exists for this person', 422);
        }

        $invitation = WalletInvitation::create([
            'wallet_id' => $wallet->id,
            'inviter_id' => $request->user()->id,
            'invitee_user_id' => $invitee?->id,
            'invitee_identifier' => $identifier,
            'role' => $inviteRole,
            'can_approve' => $canApprove,
            'status' => 'pending',
            'token' => Str::random(40),
            'expires_at' => now()->addDays(7),
        ]);

        if ($invitee) {
            NotificationService::make()->push(
                $invitee,
                'invitation_received',
                "Invitation to join {$wallet->name}",
                "{$request->user()->fullName()} invited you to join {$wallet->name} as {$inviteRole}.",
                [
                    'invitation_id' => $invitation->id,
                    'wallet_id' => $wallet->id,
                    'wallet_name' => $wallet->name,
                    'role' => $inviteRole,
                ],
            );
        }

        return $this->ok('Invitation sent', [
            'invitation' => $this->serializeInvitation($invitation->load(['wallet', 'inviter'])),
        ], 201);
    }

    // GET /wallets/{wallet}/invitations
    public function walletIndex(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if (!in_array($role, ['owner', 'co_owner', 'admin'], true)) {
            return $this->fail('You do not have permission to view invitations for this wallet', 403);
        }

        $invitations = $wallet->invitations()
            ->with(['wallet', 'inviter'])
            ->where('status', 'pending')
            ->latest()
            ->get()
            ->map(fn ($i) => $this->serializeInvitation($i));

        return $this->ok('Invitations fetched', ['invitations' => $invitations]);
    }

    // GET /invitations  (my pending invitations)
    public function myIndex(Request $request): JsonResponse
    {
        $invitations = WalletInvitation::with(['wallet', 'inviter'])
            ->where('invitee_user_id', $request->user()->id)
            ->where('status', 'pending')
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest()
            ->get()
            ->map(fn ($i) => $this->serializeInvitation($i));

        return $this->ok('Invitations fetched', ['invitations' => $invitations]);
    }

    // POST /invitations/{invitation}/accept
    public function accept(Request $request, WalletInvitation $invitation): JsonResponse
    {
        if ($invitation->invitee_user_id !== $request->user()->id) {
            return $this->fail('Invitation not found', 404);
        }
        if ($invitation->status !== 'pending') {
            return $this->fail('This invitation is no longer pending', 422);
        }
        if ($invitation->expires_at && $invitation->expires_at->isPast()) {
            $invitation->update(['status' => 'expired']);

            return $this->fail('This invitation has expired', 422);
        }

        $member = WalletMember::updateOrCreate(
            ['wallet_id' => $invitation->wallet_id, 'user_id' => $request->user()->id],
            [
                'role' => $invitation->role,
                'can_approve' => $invitation->can_approve,
                'status' => 'active',
                'invited_by' => $invitation->inviter_id,
            ],
        );

        $invitation->update(['status' => 'accepted', 'responded_at' => now()]);

        \App\Services\AuditService::make()->log($invitation->wallet, $request->user(), 'member_added', $request->user()->fullName() . " joined as {$member->role}", ['member_id' => $member->id, 'user_id' => $member->user_id, 'role' => $member->role, 'invited_by' => $invitation->inviter_id]);

        if ($invitation->inviter) {
            NotificationService::make()->push(
                $invitation->inviter,
                'invitation_accepted',
                'Invitation accepted',
                "{$request->user()->fullName()} joined {$invitation->wallet->name}.",
                ['wallet_id' => $invitation->wallet_id, 'member_id' => $member->id],
            );
        }

        return $this->ok('Invitation accepted', [
            'wallet' => $this->serializeWallet($invitation->wallet->refresh(), withOwner: true),
            'member' => $this->serializeMember($member->fresh('user')),
        ]);
    }

    // POST /invitations/{invitation}/decline
    public function decline(Request $request, WalletInvitation $invitation): JsonResponse
    {
        if ($invitation->invitee_user_id !== $request->user()->id) {
            return $this->fail('Invitation not found', 404);
        }
        if ($invitation->status !== 'pending') {
            return $this->fail('This invitation is no longer pending', 422);
        }

        $invitation->update(['status' => 'declined', 'responded_at' => now()]);

        return $this->ok('Invitation declined');
    }

    // DELETE /wallets/{wallet}/invitations/{invitation}
    public function cancel(Request $request, Wallet $wallet, WalletInvitation $invitation): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if ($invitation->wallet_id !== $wallet->id) {
            return $this->fail('Invitation not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        $isInviter = $invitation->inviter_id === $request->user()->id;
        if (!$isInviter && !in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('You do not have permission to cancel this invitation', 403);
        }
        if ($invitation->status !== 'pending') {
            return $this->fail('This invitation is no longer pending', 422);
        }

        $invitation->update(['status' => 'cancelled', 'responded_at' => now()]);

        return $this->ok('Invitation cancelled');
    }
}
