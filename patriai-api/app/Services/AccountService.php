<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * The whole account (client prototype ME-12 download my data, ME-18 freeze,
 * ME-22 close my account).
 */
class AccountService
{
    public static function make(): self
    {
        return new self;
    }

    /**
     * ME-18 "Freeze your account?": nothing leaves any wallet (Main and the
     * person's share of shared ones), rules stop, money still comes in. Sessions
     * on other phones end.
     */
    public function freeze(User $user, string $via, ?int $keepTokenId = null): void
    {
        if ($user->isFrozen()) {
            return;
        }
        $user->forceFill(['frozen_at' => now()])->save();
        $user->tokens()->when($keepTokenId, fn ($q) => $q->where('id', '!=', $keepTokenId))->delete();
        foreach ($user->wallets()->get() as $wallet) {
            AuditService::make()->log($wallet, $user, 'account_frozen', 'Froze their account', ['summary' => 'froze their account', 'detail' => 'Nothing leaves until it is unfrozen', 'via' => $via]);
        }
        NotificationService::make()->push($user, 'security_frozen', 'Your account is frozen', 'Nothing can leave your wallets until you unfreeze it with your PIN and a selfie. Money can still come in.', []);
    }

    /** ME-18 "Unfreeze — with your PIN and a selfie" (the caller checks both). */
    public function unfreeze(User $user, ?string $selfiePath, ?int $byAdmin = null): void
    {
        $settings = $user->settings ?? [];
        $settings['last_unfreeze'] = ['at' => now()->toIso8601String(), 'selfie' => $selfiePath, 'by_admin' => $byAdmin];
        $user->forceFill(['frozen_at' => null, 'settings' => $settings])->save();
        NotificationService::make()->push($user, 'security_unfrozen', 'Your account is unfrozen', 'Payments and rules work again.', []);
    }

    /**
     * ME-22 "Before you go": Main's money, shared wallets you own, joint
     * wallets, and a subscription (none yet).
     *
     * @return array{ready: bool, items: list<array{key: string, title: string, value: string, sub: string, done: bool}>}
     */
    public function closeChecklist(User $user): array
    {
        $main = $user->mainWallet();
        $own = Wallet::where('user_id', $user->id)->where('status', '!=', 'closed')->where('type', '!=', 'main')->get();
        $joint = Wallet::whereIn('id', $user->memberWallets()->pluck('wallets.id'))->where('type', 'joint')->where('status', '!=', 'closed')->get()
            ->merge($own->where('type', 'joint'));
        $naira = fn (int $k) => '₦' . number_format($k / 100);
        $items = [
            ['key' => 'main', 'title' => 'Main wallet', 'value' => $naira((int) ($main?->balance ?? 0)), 'sub' => 'Move it to your bank', 'done' => (int) ($main?->balance ?? 0) === 0],
            ['key' => 'wallets', 'title' => 'Wallets you own', 'value' => $own->where('type', '!=', 'joint')->count() ? 'You own ' . $own->where('type', '!=', 'joint')->count() : 'None', 'sub' => 'Hand them over or close them', 'done' => $own->where('type', '!=', 'joint')->isEmpty()],
            ['key' => 'joint', 'title' => 'Joint wallet', 'value' => $joint->isNotEmpty() ? 'With ' . ($joint->first()->user_id === $user->id ? 'your partner' : ($joint->first()->owner?->first_name ?? 'your partner')) : 'None', 'sub' => 'Follows your "if one leaves" rule', 'done' => $joint->isEmpty()],
            ['key' => 'subscription', 'title' => 'Subscription', 'value' => 'Free plan', 'sub' => 'Nothing to cancel', 'done' => true],
        ];

        return ['ready' => collect($items)->every(fn ($i) => $i['done']), 'items' => $items];
    }

    /** ME-22 "Continue when ready": records are kept 6 years; sessions end; sign-in stops. */
    public function close(User $user): void
    {
        $check = $this->closeChecklist($user);
        if (!$check['ready']) {
            throw ValidationException::withMessages(['account' => 'Sort the items in "Before you go" first.']);
        }
        \App\Models\WalletMember::where('user_id', $user->id)->where('role', '!=', 'owner')->update(['status' => 'removed']);
        AutomationRule::where('user_id', $user->id)->update(['enabled' => false]);
        $user->mainWallet()?->update(['status' => 'closed']);
        $user->forceFill(['status' => 'closed', 'closed_at' => now()])->save();
        $user->tokens()->delete();
    }

    /**
     * ME-12 "Download my data — a file with everything we hold, within 72 hours":
     * sent now, as a JSON file to the email on file.
     */
    public function exportData(User $user): string
    {
        if (!$user->email) {
            throw ValidationException::withMessages(['email' => 'Add an email address first.']);
        }
        $walletIds = Wallet::where('user_id', $user->id)->pluck('id');
        $data = [
            'generated_at' => now()->toIso8601String(),
            'profile' => $user->only(['first_name', 'last_name', 'email', 'phone', 'username', 'date_of_birth', 'address', 'city', 'state', 'language', 'kyc_tier', 'created_at']),
            'settings' => $user->settings,
            'wallets' => Wallet::whereIn('id', $walletIds)->get(['id', 'type', 'name', 'balance', 'status', 'created_at']),
            'memberships' => $user->memberWallets()->get(['wallets.id', 'wallets.name'])->map(fn ($w) => ['wallet' => $w->name, 'role' => $w->pivot->role]),
            'transactions' => Transaction::whereIn('wallet_id', $walletIds)->orWhere('user_id', $user->id)->orderBy('created_at')->get(['reference', 'wallet_id', 'type', 'direction', 'amount', 'fee', 'status', 'description', 'created_at']),
            'devices' => $user->devices()->get(['device_name', 'platform', 'last_active_at', 'trusted_at']),
            'logins' => $user->loginEvents()->latest()->limit(500)->get(['status', 'reason', 'device_name', 'platform', 'created_at']),
        ];
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        Mail::raw("Hello {$user->first_name},\n\nAttached is everything Patriai holds about you, as you asked.\n\nPatriai", function ($m) use ($user, $json) {
            $m->to($user->email)->subject('Your Patriai data')->attachData($json, 'patriai-my-data.json', ['mime' => 'application/json']);
        });

        return $user->email;
    }
}
