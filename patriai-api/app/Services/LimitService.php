<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\SystemSetting;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\Request;

/**
 * What a person may send and hold (client prototype ME-11 My limits, ME-23
 * Account level, KYC-12 limit reached), and the one check every payment out
 * goes through: maintenance, a frozen account, a new device's 24-hour hold,
 * the hold after a PIN reset, the single-payment and daily limits, two-step
 * verification on big payments, and the receiver's balance limit. Kobo.
 */
class LimitService
{
    public static function make(): self
    {
        return new self;
    }

    /**
     * The verification tiers (CBN tiered KYC, as on ME-23). Tier 0 (phone only)
     * has Tier 1's limits until the BVN is checked.
     *
     * @return array{tier: int, daily: ?int, single: ?int, max_balance: ?int, max_wallets: int, shared_wallets: bool, needs: string}
     */
    public function tier(int $tier): array
    {
        return match (true) {
            $tier >= 3 => ['tier' => 3, 'daily' => 500_000_000, 'single' => 500_000_000, 'max_balance' => null, 'max_wallets' => 20, 'shared_wallets' => true, 'needs' => 'ID document and proof of address'],
            $tier === 2 => ['tier' => 2, 'daily' => 20_000_000, 'single' => 20_000_000, 'max_balance' => 50_000_000, 'max_wallets' => 3, 'shared_wallets' => true, 'needs' => 'NIN and a selfie'],
            default => ['tier' => 1, 'daily' => 5_000_000, 'single' => 5_000_000, 'max_balance' => 30_000_000, 'max_wallets' => 1, 'shared_wallets' => false, 'needs' => 'Phone and BVN'],
        };
    }

    /** Money this person sent out today (Lagos day), not counting moves between their own wallets. */
    public function sentToday(User $user): int
    {
        $start = now('Africa/Lagos')->startOfDay()->utc();
        $own = Wallet::where('user_id', $user->id)->pluck('id')->all();
        $total = 0;
        Transaction::with('wallet:id,type')
            ->where('user_id', $user->id)
            ->where('direction', 'debit')
            ->whereIn('status', ['successful', 'pending'])
            ->whereIn('type', ['withdrawal', 'transfer_out'])
            ->where('created_at', '>=', $start)
            ->get()
            ->each(function (Transaction $t) use (&$total, $own) {
                if ($t->type === 'transfer_out' && ($t->wallet?->type === 'project' || in_array((int) ($t->counterparty['wallet_id'] ?? 0), $own, true))) {
                    return;
                }
                $total += $t->amount + $t->fee;
            });
        ApprovalRequest::with('wallet:id,type')->where('initiator_id', $user->id)->whereIn('status', ['pending', 'approved'])
            ->whereIn('action', ['withdrawal', 'transfer_bank', 'transfer_wallet', 'transfer_user'])->where('created_at', '>=', $start)->get()
            ->each(function (ApprovalRequest $r) use (&$total, $own) {
                if ($r->wallet?->type === 'project' || ($r->action === 'transfer_wallet' && in_array((int) ($r->payload['wallet_id'] ?? 0), $own, true))) {
                    return;
                }
                $total += $r->amount + $r->fee;
            });

        return $total;
    }

    /** ME-11: limits, what's left today and the Main balance against the limit. */
    public function summary(User $user): array
    {
        $t = $this->tier((int) $user->kyc_tier);
        $sent = $this->sentToday($user);
        $next = (int) $user->kyc_tier < 3 ? $this->tier(max(1, (int) $user->kyc_tier) + 1) : null;
        $naira = fn (?int $k) => $k === null ? null : number_format($k / 100, 2, '.', '');

        return [
            'tier' => (int) $user->kyc_tier,
            'daily' => $naira($t['daily']),
            'left_today' => $naira($t['daily'] === null ? null : max(0, $t['daily'] - $sent)),
            'sent_today' => $naira($sent),
            'single' => $naira($t['single']),
            'max_balance' => $naira($t['max_balance']),
            'main_balance' => $naira((int) ($user->mainWallet()?->balance ?? 0)),
            'max_wallets' => $t['max_wallets'],
            'wallets' => Wallet::where('user_id', $user->id)->where('status', '!=', 'closed')->count(),
            'shared_wallets' => $t['shared_wallets'],
            'receive' => null,
            'next' => $next ? ['tier' => $next['tier'], 'daily' => $naira($next['daily']), 'max_balance' => $naira($next['max_balance']), 'needs' => $next['needs']] : null,
            'tiers' => array_map(fn ($n) => ['tier' => $n] + collect($this->tier($n))->only(['needs', 'max_wallets', 'shared_wallets'])->all() + [
                'daily' => $naira($this->tier($n)['daily']),
                'max_balance' => $naira($this->tier($n)['max_balance']),
            ], [1, 2, 3]),
        ];
    }

    /** "₦50,000". */
    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /**
     * Every payment out: null when it may go, else [message, http status, data].
     * $internal: a move between the person's own wallets (no limits, no holds).
     * $recipient: someone else receiving into their Main (their balance limit).
     *
     * @return array{0: string, 1: int, 2: array}|null
     */
    public function check(User $user, int $kobo, Request $request, bool $internal = false, ?User $recipient = null): ?array
    {
        $maintenance = SystemSetting::get('maintenance');
        if (!empty($maintenance['on'])) {
            return ['We\'re upgrading Patriai. Sending is paused until we\'re back; receiving still works.', 503, ['code' => 'maintenance', 'until' => $maintenance['until'] ?? null]];
        }
        if ($user->isFrozen()) {
            return ['Your account is frozen. Unfreeze it with your PIN and a selfie to send money.', 423, ['code' => 'frozen']];
        }
        if ($internal) {
            return null;
        }

        $device = SecurityService::make()->currentDevice($request, $user);
        if ($device && !$device->canSend()) {
            return ['This phone is new. It can receive money now and send from ' . $device->send_after->copy()->setTimezone('Africa/Lagos')->format('j M, g:i a') . '.', 422, ['code' => 'new_device', 'until' => $device->send_after->toIso8601String()]];
        }
        if ($user->pin_reset_hold_until?->isFuture() && $kobo > SecurityService::PIN_RESET_HOLD_OVER) {
            return ['For your safety after a PIN reset, payments over ₦50,000 wait until ' . $user->pin_reset_hold_until->copy()->setTimezone('Africa/Lagos')->format('j M, g:i a') . '.', 422, ['code' => 'pin_reset_hold', 'until' => $user->pin_reset_hold_until->toIso8601String()]];
        }

        $t = $this->tier((int) $user->kyc_tier);
        $level = (int) $user->kyc_tier; // Tier 0 has Tier 1's limits but is called Tier 0 everywhere else
        if ($t['single'] !== null && $kobo > $t['single']) {
            return ["On Tier {$level} one payment can be up to {$this->naira($t['single'])}. Verify to the next tier to send more.", 422, ['code' => 'single_limit', 'limit' => number_format($t['single'] / 100, 2, '.', ''), 'tier' => (int) $user->kyc_tier]];
        }
        if ($t['daily'] !== null) {
            $left = max(0, $t['daily'] - $this->sentToday($user));
            if ($kobo > $left) {
                return ["That's over today's limit. On Tier {$level} you can send {$this->naira($t['daily'])} a day, and {$this->naira($left)} is left today.", 422, ['code' => 'daily_limit', 'limit' => number_format($t['daily'] / 100, 2, '.', ''), 'left' => number_format($left / 100, 2, '.', ''), 'tier' => (int) $user->kyc_tier]];
            }
        }

        if ($user->hasTwoFactor() && $kobo > SecurityService::TWO_FACTOR_OVER) {
            $code = $request->input('two_factor_code');
            if (!$code) {
                if ($user->two_factor_method !== 'authenticator') {
                    SecurityService::make()->sendTwoFactorCode($user);
                }

                return ['Enter your two-step code to send over ₦500,000.', 422, ['code' => 'two_factor_required', 'method' => $user->two_factor_method]];
            }
            SecurityService::make()->verifyTwoFactorCode($user, $code);
        }

        if ($recipient) {
            $rt = $this->tier((int) $recipient->kyc_tier);
            $main = $recipient->mainWallet();
            if ($rt['max_balance'] !== null && $main && $main->balance + $kobo > $rt['max_balance']) {
                return ["{$recipient->first_name}'s account can hold up to {$this->naira($rt['max_balance'])} until they verify more. Send less, or ask them to verify.", 422, ['code' => 'recipient_limit']];
            }
        }

        return null;
    }

    /** Can this person create one more wallet (ME-23 "1 wallet" · "Up to 3 wallets" · "Up to 20")? */
    public function walletAllowance(User $user): ?string
    {
        $t = $this->tier((int) $user->kyc_tier);
        $have = Wallet::where('user_id', $user->id)->where('status', '!=', 'closed')->count();

        $level = (int) $user->kyc_tier;

        return $have >= $t['max_wallets']
            ? ($t['tier'] === 1
                ? "On Tier {$level} you have your Main wallet. Verify your NIN and a selfie (Tier 2) to create more wallets."
                : "On Tier {$level} you can have up to {$t['max_wallets']} wallets. " . ($t['tier'] < 3 ? 'Verify to Tier 3 for up to 20.' : 'Close one you no longer use.'))
            : null;
    }
}
