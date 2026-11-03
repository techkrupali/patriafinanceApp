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
        ?string $message = null,
        int $expiresInDays = 7,
        ?string $accessUntil = null,
        ?string $groupKey = null,
    ): WalletInvitation {
        if ($invitee && $invitee->id === $inviter->id) {
            throw ValidationException::withMessages(['invite' => 'You cannot invite yourself']);
        }
        // INV-03 "Block future invites from Ngozi".
        if ($invitee && \App\Models\InviteBlock::where('user_id', $invitee->id)->where('blocked_user_id', $inviter->id)->exists()) {
            throw ValidationException::withMessages(['invite' => "You can't invite this person."]);
        }
        // A child's own sign-in joins only their own wallet, through its code (CHW-06).
        if ($invitee?->isChild()) {
            throw ValidationException::withMessages(['invite' => 'Children join with the code from their own wallet.']);
        }
        // ME-23 "Tier 2 · Up to 3 wallets, shared wallets": sharing starts at Tier 2.
        if (!LimitService::make()->tier((int) ($wallet->owner?->kyc_tier ?? 0))['shared_wallets']) {
            throw ValidationException::withMessages(['invite' => 'Shared wallets start at Tier 2. Verify your NIN and a selfie to invite people.']);
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
            $who = $invitee?->first_name ?? 'This person';
            throw ValidationException::withMessages(['invite' => "{$who} already has an invite waiting for {$wallet->name}."]);
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
            // INV-01 "patriai.app/i/K7Q2" — FAM-04 "Invite expires · In 7 days".
            'code' => $this->newCode(),
            'expires_at' => now()->addDays(max(1, min(30, $expiresInDays))),
            'message' => $message !== null && trim($message) !== '' ? mb_substr(trim($message), 0, 300) : null,
            'access_until' => $accessUntil,
            'group_key' => $groupKey,
        ]);
    }

    /** A short code for the invite's link: four letters and digits, no look-alikes. */
    public function newCode(): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 4; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (WalletInvitation::where('code', $code)->exists());

        return $code;
    }

    /**
     * INV-01 the message the invitee gets: the inviter's note (or a friendly
     * default), what it's for, and their link.
     */
    public function shareMessage(WalletInvitation $invitation, Wallet $wallet, User $inviter): string
    {
        $note = $invitation->message ?: "I've added you to {$wallet->name} on Patriai.";
        $progress = $wallet->target_amount ? ' ₦' . number_format($wallet->balance / 100) . ' of ₦' . number_format($wallet->target_amount / 100) . ' saved.' : '';

        return "Join {$wallet->name} on Patriai.{$progress}\n{$inviter->first_name}: {$note}" . $this->pledgeLine($invitation) . "\n" . ($invitation->link() ?? rtrim((string) config('app.url'), '/') . '/i');
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
                "{$inviter->fullName()} invited you to join {$wallet->name} as {$invitation->roleName()}." . $this->pledgeLine($invitation),
                [
                    'invitation_id' => $invitation->id,
                    'wallet_id' => $wallet->id,
                    'wallet_name' => $wallet->name,
                    'role' => $invitation->role,
                ],
            );

            return;
        }

        $days = $invitation->expires_at ? max(1, (int) round(now()->diffInDays($invitation->expires_at))) : 7;
        $message = "{$inviter->fullName()} invited you to join {$wallet->name} on Patriai." . $this->pledgeLine($invitation)
            . ($invitation->message ? " \"{$invitation->message}\"" : '') . ' '
            . 'Get the Patriai app and sign up with this ' . (str_contains($invitation->invitee_identifier, '@') ? 'email' : 'number')
            . " to accept. The invite lasts {$days} days. " . ($invitation->link() ?? rtrim((string) config('app.url'), '/') . '/i');

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
