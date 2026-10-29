<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\Organisation;
use App\Models\SavedAccount;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Goal wallets (client prototype GLW-01…05): what the goal is and what it
 * covers; a contribution link anyone can pay into; reminders before each save;
 * paying the school (or landlord) directly on a date; and, if the goal is
 * cancelled, everyone gets back what they put in. Contributions and the lock use
 * the savings engine (SavingsService, SpendRules). Amounts are kobo.
 */
class GoalService
{
    public const KINDS = ['school_fees', 'rent', 'car', 'baby', 'travel', 'wedding', 'other'];

    public const TIMEZONE = 'Africa/Lagos';

    public const PAY_HOUR = 7;

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /**
     * $goal: kind, for, lines [{name, amount}], link (bool), reminders {before_save,
     * nudge}, payout {saved_account_id|organisation_id, run_on}. Runs inside the
     * caller's transaction.
     */
    public function configure(Wallet $wallet, User $owner, array $goal): void
    {
        $lines = [];
        foreach (array_values($goal['lines'] ?? []) as $i => $line) {
            $name = trim((string) ($line['name'] ?? ''));
            $amount = (int) ($line['amount'] ?? 0);
            if ($name === '' || $amount <= 0) {
                throw ValidationException::withMessages(["goal.lines.{$i}" => 'Give each line a name and an amount.']);
            }
            $lines[] = ['name' => $name, 'amount' => $amount];
        }

        $payout = null;
        if (!empty($goal['payout'])) {
            $runOn = isset($goal['payout']['run_on']) ? Carbon::parse($goal['payout']['run_on'])->startOfDay() : null;
            if (!$runOn || $runOn->isPast() && !$runOn->isToday()) {
                throw ValidationException::withMessages(['goal.payout.run_on' => 'Pick a day after today to pay.']);
            }
            $account = $this->payee($owner, $goal['payout']);
            $payout = ['saved_account_id' => $account->id, 'run_on' => $runOn->toDateString(), 'paid_at' => null];
        }

        $wallet->update(['meta' => array_merge($wallet->meta ?? [], [
            'goal' => [
                'kind' => in_array($goal['kind'] ?? null, self::KINDS, true) ? $goal['kind'] : 'other',
                'for' => trim((string) ($goal['for'] ?? '')) ?: null,
                'lines' => $lines,
                'link' => !empty($goal['link']) ? $this->slug($wallet, $owner, $goal['kind'] ?? 'other') : null,
                'reminders' => [
                    'before_save' => (bool) ($goal['reminders']['before_save'] ?? true),
                    'nudge' => (bool) ($goal['reminders']['nudge'] ?? true),
                ],
                'payout' => $payout,
                'on_cancel' => 'refund',
            ],
        ])]);
    }

    /** A saved account of the owner's, or a verified organisation saved for them now. */
    private function payee(User $owner, array $p): SavedAccount
    {
        if (!empty($p['organisation_id'])) {
            $org = Organisation::where('active', true)->find((int) $p['organisation_id']);
            if (!$org) {
                throw ValidationException::withMessages(['goal.payout' => 'Choose who gets paid.']);
            }

            return SavedAccount::firstOrCreate(
                ['user_id' => $owner->id, 'bank_code' => $org->bank_code, 'account_number' => $org->account_number],
                ['organisation_id' => $org->id, 'nickname' => $org->name, 'account_name' => $org->account_name, 'bank_name' => $org->bank_name, 'category' => 'institutions'],
            );
        }
        $account = !empty($p['saved_account_id']) ? SavedAccount::where('user_id', $owner->id)->find((int) $p['saved_account_id']) : null;
        if (!$account) {
            throw ValidationException::withMessages(['goal.payout' => 'Choose who gets paid.']);
        }

        return $account;
    }

    /** "okafor-fees": the family name and the goal, unique. */
    private function slug(Wallet $wallet, User $owner, string $kind): string
    {
        $word = ['school_fees' => 'fees', 'rent' => 'rent', 'car' => 'car', 'baby' => 'baby', 'travel' => 'trip', 'wedding' => 'wedding'][$kind] ?? 'goal';
        $base = Str::slug(($owner->last_name ?: 'family') . '-' . $word);
        $slug = $base;
        for ($i = 2; Wallet::where('meta->goal->link', $slug)->where('id', '!=', $wallet->id)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    public function link(Wallet $wallet): ?string
    {
        $slug = $wallet->meta['goal']['link'] ?? null;

        return $slug ? rtrim((string) config('app.url'), '/') . '/g/' . $slug : null;
    }

    /** The public page behind the contribution link. */
    public function publicView(string $slug): ?array
    {
        $wallet = Wallet::where('type', 'goal')->where('status', 'active')->where('meta->goal->link', $slug)->first();
        if (!$wallet) {
            return null;
        }
        $this->wallets->ensureVirtualAccount($wallet);
        $wallet->refresh();

        return [
            'wallet' => $wallet,
            'owner' => $wallet->owner,
            'goal' => $wallet->meta['goal'],
            'percent' => $wallet->target_amount ? min(100, (int) floor($wallet->balance * 100 / $wallet->target_amount)) : null,
            'balance' => $this->naira($wallet->balance),
            'target' => $wallet->target_amount ? $this->naira($wallet->target_amount) : null,
            'due' => $wallet->target_date?->format('j M Y'),
            'account_number' => $wallet->virtual_account,
            'bank' => $wallet->virtual_account_bank,
        ];
    }

    // ------------------------------------------------------------- scheduled

    /** GLW-05 "Pay the school directly": on the day, 7:00 am Lagos, if the money is there. */
    public function runPayouts(?Carbon $now = null): array
    {
        $now = ($now ?? now())->copy()->setTimezone(self::TIMEZONE);
        if ($now->hour < self::PAY_HOUR) {
            return [];
        }
        $today = $now->toDateString();
        $results = [];
        Wallet::where('type', 'goal')->where('status', 'active')->where('meta->goal->payout->run_on', '<=', $today)->get()
            ->filter(fn (Wallet $w) => empty($w->meta['goal']['payout']['paid_at']))
            ->each(function (Wallet $wallet) use (&$results) {
                $results[] = $this->payOut($wallet);
            });

        return $results;
    }

    private function payOut(Wallet $wallet): array
    {
        $payout = $wallet->meta['goal']['payout'];
        $account = SavedAccount::find($payout['saved_account_id'] ?? 0);
        $owner = $wallet->owner;
        $fee = (int) config('services.matrix.transfer_fee_kobo', 2000);
        $amount = (int) ($wallet->target_amount ?: $wallet->balance - $fee);
        if (!$account || !$owner) {
            return ['wallet_id' => $wallet->id, 'status' => 'skipped'];
        }
        // WAL-10 "Still pay the school on time" switched off: the lock holds the payment too.
        if ($wallet->isGoalLocked() && !($wallet->savingsLock()['pay_payee'] ?? true)) {
            return ['wallet_id' => $wallet->id, 'status' => 'locked'];
        }
        if ($wallet->availableToSpend() < $amount + $fee) {
            // Try again tomorrow; tell the owner once a day.
            $this->notifications->push($owner, 'goal_payout_short', "{$wallet->name} can't pay {$account->nickname} yet", 'It has ' . $this->naira($wallet->balance) . ' of the ' . $this->naira($amount) . ' to send. We try again tomorrow at 7:00 am.', ['wallet_id' => $wallet->id]);

            return ['wallet_id' => $wallet->id, 'status' => 'short'];
        }

        $txn = $this->wallets->withdrawToBank($wallet, $owner, $amount, $account->bank_code, $account->account_number, $account->account_name, $account->bank_name, "{$wallet->name} for {$account->nickname}");
        $meta = $wallet->fresh()->meta;
        $meta['goal']['payout']['paid_at'] = now()->toIso8601String();
        $meta['goal']['payout']['reference'] = $txn->reference;
        $wallet->update(['meta' => $meta]);
        foreach ($this->owners($wallet) as $user) {
            $this->notifications->push($user, 'goal_paid', "{$wallet->name}: {$this->naira($amount)} sent to {$account->nickname}", 'Paid directly, as planned.', ['wallet_id' => $wallet->id, 'reference' => $txn->reference]);
        }

        return ['wallet_id' => $wallet->id, 'status' => 'paid', 'reference' => $txn->reference];
    }

    /** GLW-04 "2 days before each save — push": everyone whose save is in two days. */
    public function remindBeforeSaves(?Carbon $now = null): int
    {
        $now = $now ?? now();
        $in2 = $now->copy()->addDays(2)->startOfDay();
        $sent = 0;
        $goals = Wallet::where('type', 'goal')->where('status', 'active')->get()->filter(fn (Wallet $w) => !empty($w->meta['goal']['reminders']['before_save']))->keyBy('id');
        if ($goals->isEmpty()) {
            return 0;
        }
        AutomationRule::with('user', 'fromWallet')->whereIn('to_wallet_id', $goals->keys())->where('enabled', true)->where('trigger', 'schedule')->get()
            ->each(function (AutomationRule $rule) use ($goals, $in2, &$sent) {
                $next = $rule->nextRunOn($in2);
                if (!$next || !$next->isSameDay($in2) || !$rule->user) {
                    return;
                }
                $wallet = $goals[$rule->to_wallet_id];
                $this->notifications->push($rule->user, 'savings_reminder', "{$this->naira($rule->amount)} goes to {$wallet->name} in 2 days", 'Keep it in ' . ($rule->fromWallet?->name ?? 'your wallet') . " so the save goes through on {$in2->format('j M')}.", ['wallet_id' => $wallet->id]);
                $sent++;
            });

        return $sent;
    }

    // ------------------------------------------------------------------ cancel

    /**
     * GLW-05 "If the goal is cancelled — everyone gets back what they put in":
     * each person's own money goes back to their Main (pro rata if the wallet has
     * less than was put in); anything else — bank transfers, the link — goes to
     * the owner. Then the goal is closed.
     */
    public function cancel(Wallet $wallet, User $owner): array
    {
        if ($wallet->type !== 'goal' || $wallet->user_id !== $owner->id) {
            throw ValidationException::withMessages(['wallet' => 'Only the owner can cancel this goal.']);
        }

        $in = Transaction::where('wallet_id', $wallet->id)->where('direction', 'credit')->where('status', 'successful')->where('type', 'transfer_in')
            ->get()->groupBy('user_id')->map(fn ($g) => (int) $g->sum('amount'));
        $available = $wallet->fresh()->availableToSpend();
        $put = (int) $in->sum();
        // If some was spent, everyone gets the same share of what's left.
        $ratio = $put > 0 ? min(1, $available / $put) : 0;
        $refunds = [];

        DB::transaction(function () use ($wallet, $owner, $in, $ratio, &$refunds) {
            foreach ($in as $userId => $amount) {
                $user = User::find($userId);
                $main = $user?->mainWallet();
                $back = (int) floor($amount * $ratio);
                if (!$main || $back <= 0 || $main->id === $wallet->id) {
                    continue;
                }
                $this->wallets->transferBetweenWallets($wallet, $main, $back, $owner, "{$wallet->name} was cancelled — your money back");
                $refunds[] = ['user_id' => (int) $userId, 'amount' => $back];
                if ($user->id !== $owner->id) {
                    $this->notifications->push($user, 'goal_cancelled', "{$wallet->name} was cancelled", "{$this->naira($back)} you put in is back in your Main wallet.", ['wallet_id' => $wallet->id]);
                }
            }
            $left = $wallet->fresh()->balance;
            if ($left > 0 && ($main = $owner->mainWallet())) {
                $this->wallets->transferBetweenWallets($wallet, $main, $left, $owner, "{$wallet->name} was cancelled — the rest");
            }
            AutomationRule::where('to_wallet_id', $wallet->id)->update(['enabled' => false]);
            $wallet->update(['status' => 'closed']);
        });

        return $refunds;
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    private function owners(Wallet $wallet)
    {
        $ids = $wallet->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id')->push($wallet->user_id)->unique();

        return User::whereIn('id', $ids)->get();
    }

    /** For the wallet serializer and admin. */
    public function summary(Wallet $wallet): ?array
    {
        $goal = $wallet->meta['goal'] ?? null;
        if (!$goal) {
            return null;
        }
        $account = !empty($goal['payout']['saved_account_id']) ? SavedAccount::find($goal['payout']['saved_account_id']) : null;

        return [
            'kind' => $goal['kind'],
            'for' => $goal['for'],
            'lines' => array_map(fn ($l) => ['name' => $l['name'], 'amount' => number_format($l['amount'] / 100, 2, '.', '')], $goal['lines'] ?? []),
            'link' => $this->link($wallet),
            'reminders' => $goal['reminders'] ?? null,
            'payout' => $goal['payout'] ? [
                'to' => $account?->nickname,
                'run_on' => $goal['payout']['run_on'],
                'paid_at' => $goal['payout']['paid_at'] ?? null,
            ] : null,
        ];
    }
}
