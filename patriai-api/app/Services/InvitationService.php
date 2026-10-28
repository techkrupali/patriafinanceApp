<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Inviting people into a wallet, shared by the Invite screen and guided wallet
 * creation (WCR-08 "Who's in this wallet?"): find the person, refuse duplicates,
 * record the invite and tell them — in the app when they have an account,
 * otherwise by SMS or email.
 */
class InvitationService
{
    public static function make(): self
    {
        return new self();
    }

    /** An existing account for a phone number, email or @username, if there is one. */
    public function resolveInvitee(string $identifier): ?User
    {
        if (str_starts_with($identifier, '@')) {
            return User::where('username', strtolower(substr($identifier, 1)))->first();
        }

        return str_contains($identifier, '@')
            ? User::where('email', strtolower($identifier))->first()
            : User::where('phone', $identifier)->first();
    }

    /** How the invite names someone who already has an account. */
    public function identifierFor(User $user): string
    {
        return $user->username ? '@' . $user->username : ($user->email ?? $user->phone ?? (string) $user->id);
    }

    /**
     * Record a pending invitation. Throws (field "invite") when the person is the
     * inviter, already in the wallet, or already invited.
     */
    public function create(
        Wallet $wallet,
        User $inviter,
        ?User $invitee,
        string $identifier,
        string $role,
        bool $canApprove = false,
        ?array $permissions = null,
        ?int $pledge = null,
        bool $keyholder = false,
        ?string $pledgeKind = null,
    ): WalletInvitation {
        if ($invitee && $invitee->id === $inviter->id) {
            throw ValidationException::withMessages(['invite' => 'You cannot invite yourself']);
        }

        if ($invitee) {
            // Emergency keyholders and beneficiaries are view-only rule members; they
            // can still be invited to put money in.
            $alreadyMember = $wallet->members()
                ->where('user_id', $invitee->id)
                ->where('status', 'active')
                ->whereNotIn('role', ['beneficiary', 'emergency_approver'])
                ->exists();
            if ($alreadyMember || $invitee->id === $wallet->user_id) {
                throw ValidationException::withMessages(['invite' => 'This person is already a member of the wallet']);
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
            throw ValidationException::withMessages(['invite' => 'A pending invitation already exists for this person']);
        }

        return WalletInvitation::create([
            'wallet_id' => $wallet->id,
            'inviter_id' => $inviter->id,
            'invitee_user_id' => $invitee?->id,
            'invitee_identifier' => $identifier,
            'role' => $role,
            'can_approve' => $canApprove,
            'permissions' => !empty($permissions) ? SavingsService::normalisePermissions($permissions) : null,
            'pledge_amount' => $pledge ?: null,
            // GLW-03: a share each period, or a one-off gift.
            'pledge_kind' => $pledge ? (in_array($pledgeKind, ['period', 'gift'], true) ? $pledgeKind : 'period') : null,
            // Emergency funds: becomes a keyholder on joining (EMG-03, invited by phone).
            'keyholder' => $keyholder && $wallet->type === 'emergency',
            'status' => 'pending',
            'token' => Str::random(40),
            'expires_at' => now()->addDays(7),
        ]);
    }

    /**
     * Tell the invitee: in the app when they already have an account, otherwise
     * by SMS (phone number) or email, with how to join.
     */
    /** " They asked you to put in ₦120,000 a month." / " They asked for a ₦150,000 gift." */
    private function pledgeLine(WalletInvitation $invitation): string
    {
        if (!$invitation->pledge_amount) {
            return '';
        }
        $amount = '₦' . number_format($invitation->pledge_amount / 100);

        return $invitation->pledge_kind === 'gift'
            ? " They asked for a {$amount} gift."
            : " They asked you to put in {$amount} each time.";
    }

    public function deliver(WalletInvitation $invitation, Wallet $wallet, User $inviter, ?User $invitee): void
    {
        if ($invitee) {
            NotificationService::make()->push(
                $invitee,
                'invitation_received',
                "Invitation to join {$wallet->name}",
                "{$inviter->fullName()} invited you to join {$wallet->name} as {$invitation->role}." . $this->pledgeLine($invitation),
                [
                    'invitation_id' => $invitation->id,
                    'wallet_id' => $wallet->id,
                    'wallet_name' => $wallet->name,
                    'role' => $invitation->role,
                ],
            );

            return;
        }

        $message = "{$inviter->fullName()} invited you to join {$wallet->name} on Patriai." . $this->pledgeLine($invitation) . ' '
            . 'Get the Patriai app and sign up with this ' . (str_contains($invitation->invitee_identifier, '@') ? 'email' : 'number')
            . ' to accept. The invite lasts 7 days.';

        if (str_contains($invitation->invitee_identifier, '@')) {
            try {
                Mail::raw($message, fn ($m) => $m->to($invitation->invitee_identifier)->subject("Join {$wallet->name} on Patriai"));
            } catch (\Throwable $e) {
                Log::warning("Invitation email to {$invitation->invitee_identifier} failed: {$e->getMessage()}");
            }

            return;
        }

        SmsService::make()->send($invitation->invitee_identifier, $message);
    }
}
