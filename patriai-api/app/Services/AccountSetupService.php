<?php

namespace App\Services;

use App\Models\User;
use App\Models\WalletInvitation;

/**
 * Everything a brand-new account gets, whichever way it signed up: the
 * referral link, its own referral code and @username, the main wallet with
 * its funding account, and any invitations sent before the person joined.
 */
class AccountSetupService
{
    public static function make(): self
    {
        return app(self::class);
    }

    public function setUp(User $user, ?string $referralCode = null): void
    {
        // Referral: link the new account to the owner of a valid code, if supplied.
        // Tracking only — no money is credited here.
        if (!empty($referralCode)) {
            $referrer = User::whereRaw('lower(referral_code) = ?', [strtolower(trim($referralCode))])
                ->where('id', '!=', $user->id)
                ->first();
            if ($referrer) {
                $user->referred_by = $referrer->id;
                $user->save();
                NotificationService::make()->push(
                    $referrer,
                    'referral_joined',
                    'New referral',
                    "{$user->fullName()} joined with your code.",
                    ['user_id' => $user->id],
                );
            }
        }

        // Give the new account its own shareable referral code + @username.
        $user->ensureReferralCode();
        $user->ensureUsername();

        // Main wallet + funding virtual account on the banking rails.
        WalletService::make()->createWallet($user, 'main', 'Main Wallet');

        // Link any invitations that were addressed to this person before they had an
        // account (by email or phone) so they surface immediately under /invitations.
        $pendingInvites = WalletInvitation::where('status', 'pending')
            ->whereNull('invitee_user_id')
            ->where(function ($q) use ($user) {
                $q->whereRaw('lower(invitee_identifier) = ?', [mb_strtolower((string) $user->email)])
                    ->orWhere('invitee_identifier', $user->phone);
            })
            ->get();

        foreach ($pendingInvites as $invite) {
            $invite->update(['invitee_user_id' => $user->id]);
            $invite->load(['wallet', 'inviter']);
            NotificationService::make()->push(
                $user,
                'invitation_received',
                'Invitation to join ' . ($invite->wallet?->name ?? 'a wallet'),
                ($invite->inviter?->fullName() ?: 'Someone') . ' invited you to join ' . ($invite->wallet?->name ?? 'a wallet') . " as {$invite->role}.",
                [
                    'invitation_id' => $invite->id,
                    'wallet_id' => $invite->wallet_id,
                    'wallet_name' => $invite->wallet?->name,
                    'role' => $invite->role,
                ],
            );
        }

        $user->refresh(); // pick up DB-level defaults (role, status, kyc_tier)
    }
}
