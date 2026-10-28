<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\BudgetCategory;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

/**
 * Child wallet from the client prototype (CHW-01…07):
 *  - pocket money every week, every 2 weeks or monthly at 7:00 am, paid from Main
 *    or a spending category, paused in school holidays, with a note to the child
 *  - what the child can do: a daily limit, and sending to friends only if allowed
 *  - small requests approved automatically (up to an amount, a few a week, with a
 *    reason); bigger ones go to either parent, and lapse if nobody answers
 *  - a savings goal: the child saves part of each allowance, parents match it
 *  - a code to link the child's own phone, and a co-parent
 * Settings live in wallets.meta.child. Amounts are kobo.
 */
class ChildService
{
    public const AGE_BANDS = ['under_6', '6_9', '10_12', '13_15', '16_17'];

    public const FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

    /** CHW-02 "Every Monday at 7:00 am". */
    public const ALLOWANCE_HOUR = 7;

    /** The child's share moves once the allowance has landed. */
    public const SAVE_HOUR = 8;

    /** CHW-06 "Code expires in 9:41". */
    public const CODE_MINUTES = 10;

    /**
     * "Pause during school holidays — restarts when term begins": the usual
     * Nigerian school breaks (Christmas, Easter, the long vacation), as month-day.
     */
    public const HOLIDAYS = [['12-18', '01-07'], ['04-03', '04-26'], ['07-24', '09-13']];

    public const TIMEZONE = 'Africa/Lagos';

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    public function settings(Wallet $wallet): ?array
    {
        return $wallet->type === 'child' && is_array($wallet->meta['child'] ?? null) ? $wallet->meta['child'] : null;
    }

    // ----------------------------------------------------------------- setup

    /**
     * WCR-06 "Create wallet": the child's details and every rule. $child: first_name,
     * last_name, age_band, allowance {amount, frequency, day, starts_on, from_wallet_id,
     * category_id?, pause_holidays, notify}, controls {daily_limit, shops, friends,
     * online, cash}, requests {auto_limit, auto_per_week, expiry_hours, reason_required, approvers},
     * goal? {name, amount, save_percent, match_percent, match_wallet_id}, phone {mode, code?},
     * coparent? {approve, change, see}, gifts.
     */
    public function configure(Wallet $wallet, User $parent, array $child): void
    {
        $a = $child['allowance'] ?? [];
        $amount = (int) ($a['amount'] ?? 0);
        $frequency = in_array($a['frequency'] ?? null, self::FREQUENCIES, true) ? $a['frequency'] : 'weekly';
        $startsOn = Carbon::parse($a['starts_on'] ?? now()->setTimezone(self::TIMEZONE)->toDateString())->toDateString();
        $schedule = [
            'frequency' => $frequency === 'monthly' ? 'monthly' : 'weekly',
            'interval_weeks' => $frequency === 'biweekly' ? 2 : 1,
            'day_of_week' => $frequency === 'monthly' ? null : Carbon::parse($startsOn)->dayOfWeekIso,
            'day_of_month' => $frequency === 'monthly' ? min(28, Carbon::parse($startsOn)->day) : null,
            'starts_on' => $startsOn,
        ];

        $rules = [];
        $category = null;
        if ($amount > 0) {
            $from = Wallet::where('id', (int) ($a['from_wallet_id'] ?? 0))->where('user_id', $parent->id)->first();
            if (!$from) {
                throw ValidationException::withMessages(['child.allowance.from_wallet_id' => 'Choose one of your wallets to pay pocket money from.']);
            }
            $category = null;
            if (!empty($a['category_id'])) {
                $category = BudgetCategory::where('wallet_id', $from->id)->find((int) $a['category_id']);
                if (!$category) {
                    throw ValidationException::withMessages(['child.allowance.category_id' => "Choose one of {$from->name}'s categories."]);
                }
            }
            $rules[] = AutomationService::make()->createRule($parent, $schedule + [
                'name' => "{$child['first_name']}'s pocket money",
                'from_wallet_id' => $from->id,
                'to_wallet_id' => $wallet->id,
                'amount' => $amount,
                'at_hour' => self::ALLOWANCE_HOUR,
                'budget_category_id' => $category?->id,
            ])->id;
        }

        // CHW-05: the child's goal, their share of each allowance, and the parents' match.
        $goalId = null;
        $goal = $child['goal'] ?? null;
        if ($goal && !empty($goal['name']) && (int) ($goal['amount'] ?? 0) > 0) {
            $goalWallet = $this->wallets->createWallet($parent, 'goal', $goal['name'], [
                'target_amount' => (int) $goal['amount'],
                'meta' => ['purpose' => 'child', 'child_wallet_id' => $wallet->id],
            ]);
            $goalId = $goalWallet->id;
            $save = intdiv($amount * (int) ($goal['save_percent'] ?? 0), 100);
            if ($save > 0) {
                $rules[] = AutomationService::make()->createRule($parent, $schedule + [
                    'name' => "{$child['first_name']} saves for {$goal['name']}",
                    'from_wallet_id' => $wallet->id,
                    'to_wallet_id' => $goalWallet->id,
                    'amount' => $save,
                    'at_hour' => self::SAVE_HOUR,
                ])->id;
                $match = intdiv($save * (int) ($goal['match_percent'] ?? 0), 100);
                $matchFrom = Wallet::where('id', (int) ($goal['match_wallet_id'] ?? 0))->where('user_id', $parent->id)->first() ?? $parent->mainWallet();
                if ($match > 0 && $matchFrom) {
                    $rules[] = AutomationService::make()->createRule($parent, $schedule + [
                        'name' => "Match {$child['first_name']}'s saving",
                        'from_wallet_id' => $matchFrom->id,
                        'to_wallet_id' => $goalWallet->id,
                        'amount' => $match,
                        'at_hour' => self::SAVE_HOUR,
                    ])->id;
                }
            }
        }

        $c = $child['controls'] ?? [];
        $r = $child['requests'] ?? [];
        $phone = $child['phone'] ?? [];
        $settings = [
            'first_name' => $child['first_name'],
            'last_name' => $child['last_name'] ?? null,
            'age_band' => in_array($child['age_band'] ?? null, self::AGE_BANDS, true) ? $child['age_band'] : '6_9',
            'allowance' => [
                'amount' => $amount,
                'frequency' => $frequency,
                'starts_on' => $startsOn,
                'from_wallet_id' => $amount > 0 ? (int) $a['from_wallet_id'] : null,
                'category_id' => $category?->id,
                'pause_holidays' => (bool) ($a['pause_holidays'] ?? false),
                'notify' => (bool) ($a['notify'] ?? true),
            ],
            'controls' => [
                'daily_limit' => (int) ($c['daily_limit'] ?? 150_000),
                'shops' => (bool) ($c['shops'] ?? true),
                'friends' => (bool) ($c['friends'] ?? false),
                'online' => (bool) ($c['online'] ?? false),
                'cash' => (bool) ($c['cash'] ?? false),
            ],
            'requests' => [
                'auto_limit' => (int) ($r['auto_limit'] ?? 0),
                'auto_per_week' => (int) ($r['auto_per_week'] ?? 3),
                'reason_required' => (bool) ($r['reason_required'] ?? true),
                'approvers' => ($r['approvers'] ?? 'any') === 'all' ? 'all' : 'any',
            ],
            'goal_wallet_id' => $goalId,
            'goal' => $goalId ? ['save_percent' => (int) $goal['save_percent'], 'match_percent' => (int) ($goal['match_percent'] ?? 0)] : null,
            'phone' => ['mode' => ($phone['mode'] ?? 'own') === 'managed' ? 'managed' : 'own', 'linked' => false],
            'coparent' => isset($child['coparent']) ? [
                'approve' => (bool) ($child['coparent']['approve'] ?? true),
                'change' => (bool) ($child['coparent']['change'] ?? true),
                'see' => (bool) ($child['coparent']['see'] ?? true),
            ] : null,
            'gifts' => (bool) ($child['gifts'] ?? true),
            'rule_ids' => $rules,
        ];
        if ($settings['phone']['mode'] === 'own') {
            $settings['phone'] += $this->claimCode($parent, $phone['code'] ?? null, $child['first_name']);
        }

        // CHW-04 "Bigger requests go to Ngozi or Emeka — whoever answers first" (or
        // both), cancelled if nobody answers in time.
        $meta = $wallet->meta ?? [];
        $meta['child'] = $settings;
        $meta['approval_mode'] = $settings['requests']['approvers'];
        $meta['approval_expiry_hours'] = in_array((int) ($r['expiry_hours'] ?? 24), Wallet::APPROVAL_EXPIRY_HOURS, true) ? (int) $r['expiry_hours'] : 24;
        $wallet->update(['meta' => $meta, 'approval_enabled' => true, 'approval_threshold' => null, 'required_approvals' => 1]);
    }

    // ----------------------------------------------------------------- link code

    /** CHW-06 "KMS-4821": three letters of the child's name and four digits, held for 10 minutes. */
    public function reserveCode(User $parent, string $firstName): array
    {
        $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', $firstName) ?: 'KID');
        $consonants = preg_replace('/[AEIOU]/', '', substr($letters, 1));
        $prefix = substr($letters[0] . $consonants . $letters . 'XXX', 0, 3);
        do {
            $code = $prefix . '-' . random_int(1000, 9999);
        } while (Cache::has("child-code:{$code}") || Wallet::where('meta->child->phone->code', $code)->exists());
        $expires = now()->addMinutes(self::CODE_MINUTES);
        Cache::put("child-code:{$code}", $parent->id, $expires);

        return ['code' => $code, 'expires_at' => $expires->toIso8601String()];
    }

    /** The code shown during setup, if it's still this parent's; otherwise a fresh one. */
    private function claimCode(User $parent, ?string $code, string $firstName): array
    {
        if ($code && Cache::get("child-code:{$code}") === $parent->id) {
            return ['code' => $code, 'expires_at' => now()->addMinutes(self::CODE_MINUTES)->toIso8601String()];
        }

        return $this->reserveCode($parent, $firstName);
    }

    /** WCR-07 "Code KMS-4821 · Edit": a new code for linking later. */
    public function newCode(Wallet $wallet, User $parent): array
    {
        $settings = $this->settings($wallet);
        $code = $this->reserveCode($parent, $settings['first_name']);
        $meta = $wallet->meta;
        $meta['child']['phone'] = ['mode' => 'own', 'linked' => (bool) ($settings['phone']['linked'] ?? false)] + $code;
        $wallet->update(['meta' => $meta]);

        return $code;
    }

    // ----------------------------------------------------------------- requests

    /**
     * CHW-03/04 when the child asks for money: is it allowed at all (friends), is
     * a reason needed, and can it go through on its own? Returns true to approve
     * automatically, false to send it to the parents. Throws when not allowed.
     */
    public function screenRequest(Wallet $wallet, User $child, int $amount, ?string $reason, array $destination): bool
    {
        $settings = $this->settings($wallet);
        if (!$settings || $wallet->roleOf($child) !== 'child') {
            return false;
        }
        $name = $settings['first_name'];
        if (($destination['kind'] ?? null) === 'user' && !$settings['controls']['friends']) {
            throw ValidationException::withMessages(['destination' => "{$name} can't send money to friends. A parent can turn it on."]);
        }
        if ($settings['requests']['reason_required'] && trim((string) $reason) === '') {
            throw ValidationException::withMessages(['description' => 'Say what it\'s for, like "school trip" or "birthday gift".']);
        }

        $r = $settings['requests'];
        if ($r['auto_limit'] <= 0 || $amount > $r['auto_limit']) {
            return false;
        }
        $weekStart = now()->setTimezone(self::TIMEZONE)->startOfWeek();
        $autoThisWeek = ApprovalRequest::where('wallet_id', $wallet->id)->where('initiator_id', $child->id)
            ->where('payload->auto_approved', true)->where('created_at', '>=', $weekStart->copy()->utc())->count();
        if ($autoThisWeek >= $r['auto_per_week']) {
            return false;
        }
        // Within the daily spending limit, or a parent decides.
        $today = (int) Transaction::where('wallet_id', $wallet->id)->where('user_id', $child->id)->where('direction', 'debit')
            ->whereIn('status', ['successful', 'pending'])->where('created_at', '>=', now()->setTimezone(self::TIMEZONE)->startOfDay()->utc())->sum('amount');

        return $today + $amount <= $settings['controls']['daily_limit'];
    }

    // ----------------------------------------------------------------- allowance

    /** "Pause during school holidays": does this rule wait for term to begin? */
    public function paused(AutomationRule $rule, Wallet $from, Wallet $to, Carbon $now): bool
    {
        $child = $to->type === 'child' ? $to : ($from->type === 'child' ? $from : null);
        if (!$child && ($id = $to->meta['child_wallet_id'] ?? null)) {
            $child = Wallet::find($id);
        }
        $settings = $child ? $this->settings($child) : null;

        return $settings && $settings['allowance']['pause_holidays'] && $this->onHoliday($now);
    }

    public function onHoliday(Carbon $now): bool
    {
        $md = $now->copy()->setTimezone(self::TIMEZONE)->format('m-d');
        foreach (self::HOLIDAYS as [$start, $end]) {
            $in = $start <= $end ? ($md >= $start && $md <= $end) : ($md >= $start || $md <= $end);
            if ($in) {
                return true;
            }
        }

        return false;
    }

    /** "Tell Kamsi when it lands — a short note in their app". */
    public function landed(Wallet $wallet, int $amount): void
    {
        $settings = $this->settings($wallet);
        if (!$settings || !$settings['allowance']['notify']) {
            return;
        }
        $children = $wallet->members()->where('role', 'child')->where('status', 'active')->with('user')->get();
        foreach ($children as $member) {
            $this->notifications->push($member->user, 'allowance_landed', 'Your pocket money is here', '₦' . number_format($amount / 100) . " landed in {$wallet->name}.", ['wallet_id' => $wallet->id]);
        }
    }

    // ----------------------------------------------------------------- detail

    public function summary(Wallet $wallet): ?array
    {
        $s = $this->settings($wallet);
        if (!$s) {
            return null;
        }
        $naira = fn (int $kobo) => number_format($kobo / 100, 2, '.', '');
        $goal = $s['goal_wallet_id'] ? Wallet::find($s['goal_wallet_id']) : null;
        $phone = $s['phone'];
        $expired = isset($phone['expires_at']) && Carbon::parse($phone['expires_at'])->isPast();

        return [
            'first_name' => $s['first_name'],
            'last_name' => $s['last_name'],
            'age_band' => $s['age_band'],
            'allowance' => ['amount' => $naira($s['allowance']['amount'])] + $s['allowance'],
            'controls' => ['daily_limit' => $naira($s['controls']['daily_limit'])] + $s['controls'],
            'requests' => ['auto_limit' => $naira($s['requests']['auto_limit'])] + $s['requests'],
            'goal' => $goal ? ['wallet_id' => $goal->id, 'name' => $goal->name, 'target' => $naira((int) $goal->target_amount), 'saved' => $naira((int) $goal->balance)] + ($s['goal'] ?? []) : null,
            'phone' => [
                'mode' => $phone['mode'],
                'linked' => (bool) ($phone['linked'] ?? false),
                'code' => $expired ? null : ($phone['code'] ?? null),
                'expires_at' => $expired ? null : ($phone['expires_at'] ?? null),
            ],
            'coparent' => $s['coparent'],
            'gifts' => $s['gifts'],
        ];
    }
}
