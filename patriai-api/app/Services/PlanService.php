<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\Circle;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Free and Pro (client prototype PLN-01…04). Plans, prices, the free trial and
 * each plan's limits are set in admin. One subscription covers the whole family
 * (the payer's home circle). A trial turns into a payment from the chosen
 * wallet when it ends; a failed payment gets three days' grace, then the family
 * is back on Free. Free's limits only hold when admin switches them on.
 */
class PlanService
{
    public const GRACE_DAYS = 3;

    public const REMIND_DAYS = 3;

    public static function make(): self
    {
        return new self;
    }

    private function money(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    public function plans(): Collection
    {
        return Plan::orderBy('position')->orderBy('id')->get();
    }

    public function free(): Plan
    {
        return Plan::where('is_free', true)->orderBy('position')->first()
            ?? new Plan(['slug' => 'free', 'name' => 'Free', 'is_free' => true, 'active' => true, 'limits' => []]);
    }

    // ---------------------------------------------------------------- who has what

    /** The subscription this person pays for, while it still gives the plan. */
    public function ownSubscription(User $user): ?Subscription
    {
        return Subscription::with('plan')->where('user_id', $user->id)->whereIn('status', Subscription::LIVE)->latest('id')->first();
    }

    /** The family (home circle) this person belongs to, if any. */
    public function homeCircle(User $user): ?Circle
    {
        return Circle::where('is_home', true)
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id)))
            ->orderBy('id')
            ->first();
    }

    /** Everyone one subscription covers: the payer and their home circle. */
    public function family(User $payer): Collection
    {
        $circle = $this->homeCircle($payer);
        $ids = collect([$payer->id]);
        if ($circle) {
            $ids = $ids->push($circle->owner_id)->merge($circle->members()->pluck('user_id'));
        }

        return User::whereIn('id', $ids->filter()->unique())->get();
    }

    /** Whose subscription covers this person: their own, or someone's in their family. */
    public function coveringSubscription(User $user): ?Subscription
    {
        if ($own = $this->ownSubscription($user)) {
            return $own;
        }
        $circle = $this->homeCircle($user);
        if (!$circle) {
            return null;
        }
        $family = collect([$circle->owner_id])->merge($circle->members()->pluck('user_id'))->filter()->unique()->all();

        return Subscription::with('plan')->whereIn('user_id', $family)->whereIn('status', Subscription::LIVE)->latest('id')->first();
    }

    public function planFor(User $user): Plan
    {
        return $this->coveringSubscription($user)?->plan ?? $this->free();
    }

    // ---------------------------------------------------------------- limits (PLN-04)

    public function enforced(): bool
    {
        return (bool) SystemSetting::get('plans_enforce');
    }

    /** How much of each limited thing this person uses now. */
    public function usage(User $user): array
    {
        return [
            'wallets' => Wallet::where('user_id', $user->id)->where('status', '!=', 'closed')->count(),
            'rules' => AutomationRule::where('user_id', $user->id)->count(),
        ];
    }

    /**
     * Before making one more wallet or rule: if the plan's limit is reached (and
     * limits are on), stop with PLN-04 "You've used your 2 free rules".
     */
    public function guard(User $user, string $feature): void
    {
        if (!$this->enforced()) {
            return;
        }
        $plan = $this->planFor($user);
        $limit = $plan->limit($feature);
        $used = $this->usage($user)[$feature] ?? 0;
        if ($limit === null || $used < $limit) {
            return;
        }
        $pro = Plan::where('is_free', false)->where('active', true)->orderBy('position')->first();
        $word = ['wallets' => 'wallet', 'rules' => 'rule'][$feature] ?? $feature;
        $plural = $limit === 1 ? $word : "{$word}s";
        $title = $plan->is_free ? "You've used your {$limit} free {$plural}" : "You've used your {$limit} {$plural}";
        $body = $pro && $plan->is_free
            ? "{$pro->name} gives your family more {$word}s" . ($pro->limit($feature) === null ? ' — as many as you need' : ', up to ' . $pro->limit($feature)) . ($pro->trial_days ? ". Try it free for {$pro->trial_days} days." : '.')
            : ($feature === 'wallets' ? 'Close a wallet you no longer use to make a new one.' : 'Delete a rule you no longer need to make a new one.');

        throw new HttpResponseException(response()->json([
            'status' => false,
            'message' => $title,
            'data' => ['code' => 'plan_limit', 'feature' => $feature, 'limit' => $limit, 'used' => $used, 'plan' => $plan->slug, 'title' => $title, 'body' => $body, 'upgrade' => (bool) ($pro && $plan->is_free)],
        ], 422));
    }

    // ---------------------------------------------------------------- PLN-02 start

    /** Has this person (or anyone paying for their family) had a trial before? */
    public function hadTrial(User $user): bool
    {
        return Subscription::where('user_id', $user->id)->whereNotNull('trial_ends_at')->exists();
    }

    /** Wallets a subscription can be paid from: the person's own, open ones. */
    public function payableWallets(User $user): Collection
    {
        return Wallet::where('user_id', $user->id)->where('status', 'active')->whereIn('type', ['main', 'spending', 'savings', 'joint'])
            ->orderByRaw("CASE WHEN type = 'main' THEN 0 ELSE 1 END")->orderBy('id')->get();
    }

    /** PLN-02 "Start free trial" (or pay now when the trial was used). */
    public function start(User $user, Plan $plan, string $interval, Wallet $wallet): Subscription
    {
        if ($plan->is_free || !$plan->active) {
            throw ValidationException::withMessages(['plan' => "{$plan->name} isn't available right now."]);
        }
        if (!in_array($interval, Plan::INTERVALS, true) || $plan->price($interval) <= 0) {
            throw ValidationException::withMessages(['interval' => 'Choose monthly or yearly.']);
        }
        if ($this->coveringSubscription($user)) {
            throw ValidationException::withMessages(['plan' => 'Your family is already on ' . $this->planFor($user)->name . '.']);
        }
        $this->guardWallet($user, $wallet);

        $trial = $plan->trial_days > 0 && !$this->hadTrial($user);
        $sub = Subscription::create([
            'user_id' => $user->id,
            'plan_id' => $plan->id,
            'interval' => $interval,
            'status' => $trial ? 'trialing' : 'active',
            'price' => $plan->price($interval),
            'trial_ends_at' => $trial ? now()->addDays($plan->trial_days) : null,
            'current_period_end' => $trial ? now()->addDays($plan->trial_days) : null,
            'pay_wallet_id' => $wallet->id,
        ]);
        if (!$trial) {
            if (!$this->charge($sub)) {
                $reason = $sub->failure;
                $sub->delete();
                throw ValidationException::withMessages(['wallet_id' => $reason ?: 'The payment didn’t go through.']);
            }
        }
        foreach ($this->family($user)->where('id', '!=', $user->id) as $member) {
            NotificationService::make()->push($member, 'plan_started', "Your family is on {$plan->name}", "{$user->first_name} " . ($trial ? 'started a free trial of' : 'upgraded to') . " Patriai {$plan->name} for the family.", []);
        }

        return $sub->refresh();
    }

    private function guardWallet(User $user, Wallet $wallet): void
    {
        if ($wallet->user_id !== $user->id || $wallet->status !== 'active') {
            throw ValidationException::withMessages(['wallet_id' => 'Choose one of your own wallets to pay from.']);
        }
    }

    // ---------------------------------------------------------------- paying

    /**
     * Take one period's price from the chosen wallet and move the period on.
     * On failure: past_due with the reason (the caller decides what's next).
     */
    public function charge(Subscription $sub): bool
    {
        $interval = $sub->next_interval ?: $sub->interval;
        $plan = $sub->plan;
        $amount = $plan->price($interval) ?: $sub->price;
        $from = $sub->current_period_end && $sub->current_period_end->isFuture() ? $sub->current_period_end->copy() : now();
        $to = $interval === 'yearly' ? $from->copy()->addYear() : $from->copy()->addMonth();
        $reference = 'PRO-' . strtoupper(Str::random(8));
        $wallet = $sub->payWallet ?? $sub->user->mainWallet();

        try {
            if (!$wallet || $wallet->user_id !== $sub->user_id) {
                throw ValidationException::withMessages(['wallet' => 'The wallet to pay from is gone. Choose another.']);
            }
            $txn = DB::transaction(function () use ($sub, $wallet, $amount, $interval, $plan, $reference, $from, $to) {
                $txn = WalletService::make()->debit($wallet, $amount, 0, 'subscription', ['kind' => 'patriai', 'name' => "Patriai {$plan->name}", 'reference' => $reference], "Patriai {$plan->name} · {$interval}", $sub->user_id);
                SubscriptionPayment::create(['subscription_id' => $sub->id, 'user_id' => $sub->user_id, 'amount' => $amount, 'interval' => $interval, 'status' => 'paid', 'reference' => $reference, 'transaction_id' => $txn->id, 'period_start' => $from, 'period_end' => $to]);
                $sub->update(['status' => 'active', 'interval' => $interval, 'next_interval' => null, 'price' => $amount, 'current_period_end' => $to, 'failed_at' => null, 'failure' => null, 'pay_wallet_id' => $wallet->id]);

                return $txn;
            });
        } catch (\Throwable $e) {
            $reason = $e instanceof ValidationException ? collect($e->errors())->flatten()->first() : 'The payment didn’t go through.';
            if ($reason === 'Insufficient wallet balance') {
                $reason = "Not enough in {$wallet?->name} for " . $this->money($amount) . '.';
            }
            if (!$e instanceof ValidationException) {
                Log::error('Subscription payment failed', ['subscription' => $sub->id, 'error' => $e->getMessage()]);
            }
            SubscriptionPayment::create(['subscription_id' => $sub->id, 'user_id' => $sub->user_id, 'amount' => $amount, 'interval' => $interval, 'status' => 'failed', 'reference' => $reference, 'failure' => $reason, 'period_start' => $from, 'period_end' => $to]);
            $sub->update(['failed_at' => $sub->failed_at ?? now(), 'failure' => $reason]);

            return false;
        }

        $user = $sub->user;
        NotificationService::make()->push($user, 'plan_paid', "Patriai {$plan->name} renewed", $this->money($amount) . " from {$wallet->name}. Next payment " . $to->copy()->setTimezone('Africa/Lagos')->format('j M Y') . '.', ['transaction_reference' => $txn->reference]);
        if ($user->email) {
            Mail::raw("Hello {$user->first_name},\n\nThanks for Patriai {$plan->name}.\n\nPaid: " . $this->money($amount) . " ({$interval}) from {$wallet->name}\nReference: {$reference}\nCovers until: " . $to->copy()->setTimezone('Africa/Lagos')->format('j M Y') . "\n\nPatriai", fn ($m) => $m->to($user->email)->subject("Patriai {$plan->name} receipt"));
        }

        return true;
    }

    // ---------------------------------------------------------------- PLN-03 manage

    /** "Cancel Pro · Keep Pro until 24 Nov, then go back to Free". */
    public function cancel(Subscription $sub): Subscription
    {
        $sub->update(['cancel_at_period_end' => true]);

        return $sub->refresh();
    }

    public function resume(Subscription $sub): Subscription
    {
        $sub->update(['cancel_at_period_end' => false]);

        return $sub->refresh();
    }

    /** "Switch to monthly": from the next payment (straight away while on trial). */
    public function switchInterval(Subscription $sub, string $interval): Subscription
    {
        if ($sub->status === 'trialing') {
            $sub->update(['interval' => $interval, 'price' => $sub->plan->price($interval), 'next_interval' => null]);
        } else {
            $sub->update(['next_interval' => $interval === $sub->interval ? null : $interval]);
        }

        return $sub->refresh();
    }

    public function payFrom(Subscription $sub, Wallet $wallet): Subscription
    {
        $this->guardWallet($sub->user, $wallet);
        $sub->update(['pay_wallet_id' => $wallet->id]);

        return $sub->refresh();
    }

    // ---------------------------------------------------------------- the daily run

    /**
     * Trial reminders three days before, payments when a period ends, a second
     * try during the grace days, and back to Free after them or when cancelled.
     *
     * @return array{reminded: int, renewed: int, failed: int, ended: int}
     */
    public function run(?Carbon $now = null): array
    {
        $now ??= now();
        $out = ['reminded' => 0, 'renewed' => 0, 'failed' => 0, 'ended' => 0];

        Subscription::with(['plan', 'user', 'payWallet'])->where('status', 'trialing')->whereNull('reminded_at')->where('cancel_at_period_end', false)
            ->where('trial_ends_at', '<=', $now->copy()->addDays(self::REMIND_DAYS))->where('trial_ends_at', '>', $now)
            ->get()->each(function (Subscription $s) use (&$out) {
                NotificationService::make()->push($s->user, 'plan_trial_ending', 'Your free trial ends soon', "Patriai {$s->plan->name} is free until " . $s->trial_ends_at->copy()->setTimezone('Africa/Lagos')->format('j M') . '. Then ' . $this->money($s->plan->price($s->interval)) . ' a ' . ($s->interval === 'yearly' ? 'year' : 'month') . ' from ' . ($s->payWallet?->name ?? 'your Main wallet') . '. Cancel any time before then.', []);
                $s->update(['reminded_at' => now()]);
                $out['reminded']++;
            });

        Subscription::with(['plan', 'user', 'payWallet'])->whereIn('status', ['trialing', 'active', 'past_due'])->where('current_period_end', '<=', $now)
            ->get()->each(function (Subscription $s) use (&$out, $now) {
                if ($s->cancel_at_period_end) {
                    $this->end($s, 'cancelled');
                    $out['ended']++;

                    return;
                }
                if ($s->status === 'past_due' && $s->failed_at && $s->failed_at->copy()->addDays(self::GRACE_DAYS)->lte($now)) {
                    $this->end($s, 'unpaid');
                    $out['ended']++;

                    return;
                }
                if ($s->status === 'past_due' && $s->updated_at && $s->updated_at->gt($now->copy()->subHours(20))) {
                    return; // one try a day during the grace days
                }
                if ($this->charge($s)) {
                    $out['renewed']++;
                } else {
                    $first = $s->status !== 'past_due';
                    $s->update(['status' => 'past_due']);
                    if ($first) {
                        NotificationService::make()->push($s->user, 'plan_payment_failed', "We couldn't renew Patriai {$s->plan->name}", ($s->failure ?: 'The payment didn’t go through.') . ' Add money or choose another wallet in the next ' . self::GRACE_DAYS . ' days to keep it.', []);
                    }
                    $out['failed']++;
                }
            });

        return $out;
    }

    private function end(Subscription $s, string $why): void
    {
        $s->update(['status' => 'expired', 'ended_at' => now()]);
        NotificationService::make()->push($s->user, 'plan_ended', "Your family is back on Free", $why === 'cancelled'
            ? "Patriai {$s->plan->name} has ended, as you asked. Everything you made stays."
            : "We couldn't take the payment for Patriai {$s->plan->name}, so it has ended. Everything you made stays.", []);
    }

    // ---------------------------------------------------------------- what the app shows

    public function serializePlan(Plan $p): array
    {
        $naira = fn (int $k) => number_format($k / 100, 2, '.', '');
        $months = $p->monthly_price > 0 && $p->yearly_price > 0 ? (int) round(12 - $p->yearly_price / $p->monthly_price) : 0;

        return [
            'slug' => $p->slug,
            'name' => $p->name,
            'covers' => $p->covers,
            'monthly_price' => $naira($p->monthly_price),
            'yearly_price' => $naira($p->yearly_price),
            'yearly_saves_months' => max(0, $months),
            'trial_days' => $p->trial_days,
            'is_free' => $p->is_free,
            'active' => $p->active,
            'limits' => collect(Plan::LIMITS)->mapWithKeys(fn ($k) => [$k => $p->limit($k)])->all(),
        ];
    }

    public function serializeSubscription(Subscription $s, User $viewer): array
    {
        $naira = fn (int $k) => number_format($k / 100, 2, '.', '');
        $payer = $s->user;
        $family = $this->family($payer);
        $circle = $this->homeCircle($payer);
        $wallet = $s->payWallet;
        $mine = $s->user_id === $viewer->id;

        return [
            'id' => $s->id,
            'plan' => $this->serializePlan($s->plan),
            'interval' => $s->interval,
            'next_interval' => $s->next_interval,
            'status' => $s->status,
            'price' => $naira($s->price),
            'next_price' => $naira($s->plan->price($s->next_interval ?: $s->interval)),
            'trial_ends_at' => $s->trial_ends_at?->toIso8601String(),
            'current_period_end' => $s->current_period_end?->toIso8601String(),
            'cancel_at_period_end' => $s->cancel_at_period_end,
            'failure' => $s->status === 'past_due' ? $s->failure : null,
            'mine' => $mine,
            'payer' => $payer->first_name ?: $payer->fullName(),
            'pay_wallet' => $mine && $wallet ? ['id' => $wallet->id, 'name' => $wallet->name, 'balance' => $naira((int) $wallet->balance)] : null,
            'family' => ['name' => $circle?->name, 'count' => $family->count()],
            'receipts_to' => $mine ? $payer->email : null,
            'payments' => $mine ? $s->payments()->latest('id')->limit(6)->get()->map(fn (SubscriptionPayment $p) => [
                'reference' => $p->reference, 'amount' => $naira($p->amount), 'interval' => $p->interval, 'status' => $p->status, 'failure' => $p->failure, 'at' => $p->created_at?->toIso8601String(),
            ])->values() : [],
        ];
    }
}
