<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\InvitationService;
use App\Services\JointService;
use App\Services\NotificationService;
use App\Services\SavingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

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
            // Existing users are invited directly by id (username search); everyone
            // else by an email/phone identifier for an out-of-band invite.
            'invitee_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'identifier' => ['required_without:invitee_user_id', 'nullable', 'string', 'max:150'],
            'role' => ['sometimes', 'in:co_owner,admin,contributor,viewer'],
            'can_approve' => ['sometimes', 'boolean'],
            // Per-person access, applied when they accept (optional).
            'permissions' => ['sometimes', 'array'],
            'permissions.view' => ['sometimes', 'boolean'],
            'permissions.fund' => ['sometimes', 'boolean'],
            'permissions.request' => ['sometimes', 'boolean'],
            'permissions.withdraw' => ['sometimes', 'boolean'],
        ]);

        $inviteRole = $data['role'] ?? 'contributor';
        $canApprove = $request->boolean('can_approve');
        $invitations = InvitationService::make();

        // Resolve the invitee. In-app (existing user) path takes an id directly;
        // otherwise fall back to email/phone identifier resolution.
        if (!empty($data['invitee_user_id'])) {
            $invitee = User::find($data['invitee_user_id']);
            $identifier = $invitations->identifierFor($invitee);
        } else {
            $identifier = trim($data['identifier']);
            $invitee = null;
        }

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

        $invitee ??= $invitations->resolveInvitee($identifier);

        try {
            $invitation = $invitations->create(
                $wallet,
                $request->user(),
                $invitee,
                $identifier,
                $inviteRole,
                $canApprove,
                $data['permissions'] ?? null,
            );
        } catch (ValidationException $e) {
            return $this->fail(collect($e->errors())->flatten()->first(), 422);
        }

        $invitations->deliver($invitation, $wallet, $request->user(), $invitee);

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

        // Savings wallets: optionally start your own auto-save as you join.
        $data = $request->validate([
            'source_wallet_id' => ['nullable', 'integer'],
            'amount' => ['nullable', 'numeric', 'min:1'],
            'frequency' => ['nullable', 'in:' . implode(',', \App\Models\SavingsPlan::FREQUENCIES)],
            'day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'pin' => ['nullable', 'string'],
        ]);

        // INV-O2 "Enter your PIN to accept the joint wallet rules".
        $joint = $invitation->wallet->type === 'joint' && JointService::make()->settings($invitation->wallet);
        if ($joint) {
            if (empty($data['pin'])) {
                return $this->fail('Confirm with your PIN to accept the joint wallet rules.', 422);
            }
            app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        }

        // All or nothing: a rejected auto-save (e.g. not your wallet) undoes the join.
        $member = DB::transaction(function () use ($request, $invitation, $data, $joint) {
            $member = WalletMember::updateOrCreate(
                ['wallet_id' => $invitation->wallet_id, 'user_id' => $request->user()->id],
                [
                    'role' => $invitation->role,
                    'can_approve' => $invitation->can_approve,
                    'status' => 'active',
                    'invited_by' => $invitation->inviter_id,
                ],
            );
            SavingsService::applyInvitationPermissions($member, $invitation);

            $invitation->update(['status' => 'accepted', 'responded_at' => now()]);

            // Invited by phone as an emergency keyholder: they hold a key from now on.
            if ($invitation->keyholder && ($setting = $invitation->wallet->emergencySetting) && $setting->keyholder_ids !== null) {
                $setting->update([
                    'keyholder_ids' => array_values(array_unique([...$setting->keyholder_ids, $request->user()->id])),
                    'dual_approval' => true,
                ]);
            }

            if ($joint) {
                // Both shares start, and the wallet gets its account number.
                JointService::make()->accept($invitation->wallet, $request->user(), $invitation, isset($data['source_wallet_id']) ? (int) $data['source_wallet_id'] : null);
            } elseif (!empty($data['source_wallet_id']) && $invitation->pledge_amount && !in_array($invitation->wallet->type, SavingsService::TYPES, true)) {
                // EMG-02 "Each person saves automatically on the 25th"; SPD-04 "Each
                // person pays their share" on the budget's own day.
                $source = \App\Models\Wallet::where('id', (int) $data['source_wallet_id'])->where('user_id', $request->user()->id)->first();
                if (!$source) {
                    throw \Illuminate\Validation\ValidationException::withMessages(['source_wallet_id' => 'Choose one of your own wallets to save from.']);
                }
                $budget = $invitation->wallet->budget();
                $weekly = ($budget['period'] ?? null) === 'weekly';
                $day = (int) ($budget['start_day'] ?? 25);
                \App\Services\AutomationService::make()->createContributionRule($request->user(), $source, $invitation->wallet->refresh(), [
                    'name' => ($budget ? 'My share into ' : 'Monthly into ') . $invitation->wallet->name,
                    'amount' => isset($data['amount']) ? $this->toKobo((string) $data['amount']) : $invitation->pledge_amount,
                    'frequency' => $weekly ? 'weekly' : 'monthly',
                    'day_of_week' => $weekly ? $day : null,
                    'day_of_month' => $weekly ? null : $day,
                ]);
            } elseif (!empty($data['source_wallet_id']) && $invitation->pledge_kind !== 'gift') {
                // GLW-03: their own amount ("Emeka · ₦120,000"), unless they choose another.
                $overrides = array_filter([
                    'amount' => isset($data['amount']) ? $this->toKobo((string) $data['amount']) : $invitation->pledge_amount,
                    'frequency' => $data['frequency'] ?? null,
                    'day_of_week' => $data['day_of_week'] ?? null,
                    'day_of_month' => $data['day_of_month'] ?? null,
                ], fn ($v) => $v !== null);
                SavingsService::make()->startContribution($invitation->wallet->refresh(), $request->user(), (int) $data['source_wallet_id'], $overrides);
            }

            return $member;
        });

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

    // POST /wallets/{wallet}/invitations/{invitation}/resend — Family tab "Resend"
    public function resend(Request $request, Wallet $wallet, WalletInvitation $invitation): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if ($invitation->wallet_id !== $wallet->id) {
            return $this->fail('Invitation not found', 404);
        }

        $role = $wallet->roleOf($request->user());
        if ($invitation->inviter_id !== $request->user()->id && !in_array($role, ['owner', 'co_owner'], true)) {
            return $this->fail('You do not have permission to resend this invitation', 403);
        }
        if ($invitation->status !== 'pending') {
            return $this->fail('This invitation is no longer pending', 422);
        }
        if ($invitation->updated_at && $invitation->updated_at->gt(now()->subMinute())) {
            return $this->fail('It was just sent. Try again in a minute.', 429);
        }

        // A fresh week to respond, then the same message again.
        $invitation->update(['expires_at' => now()->addDays(7)]);
        $invitee = $invitation->invitee_user_id ? User::find($invitation->invitee_user_id) : null;
        InvitationService::make()->deliver($invitation, $wallet, $request->user(), $invitee);

        return $this->ok('Invitation sent again', [
            'invitation' => $this->serializeInvitation($invitation->load(['wallet', 'inviter'])),
        ]);
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
