<?php

namespace App\Services;

use App\Http\Controllers\Api\TransferController;
use App\Models\GivingSchedule;
use App\Models\SavedAccount;
use App\Models\ScheduledPayment;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * SND-14 schedule or repeat a payment, SND-15 everything going out on a date.
 * A run sends through the same path as a payment by hand (limits, the wallet's
 * approvals and budget, fees); only the PIN and two-step were given up front.
 */
class ScheduledPaymentService
{
    public function __construct(private readonly NotificationService $notifications) {}

    public static function make(): self
    {
        return app(self::class);
    }

    /**
     * @param  array{from: Wallet, amount: int, note: ?string, budget_category_id: ?int, skip_if_over: bool, destination: array, to_name: string, frequency: string, starts_at: Carbon, ends_after: ?int}  $d
     */
    public function create(User $user, array $d): ScheduledPayment
    {
        if (!$d['from']->isAccessibleBy($user) || !$d['from']->canSpend($user)) {
            throw ValidationException::withMessages(['from_wallet_id' => 'Choose a wallet you can pay from.']);
        }
        if ($d['starts_at']->lt(now()->subMinutes(5))) {
            throw ValidationException::withMessages(['starts_at' => 'Choose a time from now on.']);
        }
        if ($d['frequency'] === 'once') {
            $d['ends_after'] = 1;
        }

        return ScheduledPayment::create([
            'user_id' => $user->id,
            'from_wallet_id' => $d['from']->id,
            'destination' => $d['destination'],
            'to_name' => $d['to_name'],
            'amount' => $d['amount'],
            'note' => $d['note'],
            'budget_category_id' => $d['budget_category_id'],
            'skip_if_over' => $d['skip_if_over'],
            'frequency' => $d['frequency'],
            'starts_at' => $d['starts_at'],
            'ends_after' => $d['ends_after'],
            'next_run_at' => $d['starts_at'],
        ]);
    }

    /** Every 5 minutes: whatever has come due. */
    public function runDue(?Carbon $now = null): array
    {
        $now ??= now();

        $this->checkUpcoming($now);

        return ScheduledPayment::where('status', 'active')->where('next_run_at', '<=', $now)->orderBy('next_run_at')->limit(200)->get()
            ->map(fn (ScheduledPayment $p) => $this->gateAndRun($p, $now))->filter()->values()->all();
    }

    private function nice(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /** RUL-04 has everyone needed said yes to the date coming up? */
    public function confirmed(ScheduledPayment $p): bool
    {
        if (empty($p->confirm['user_ids'])) {
            return true;
        }
        if (!$p->confirmed_for || !$p->next_run_at || !$p->confirmed_for->equalTo($p->next_run_at)) {
            return false;
        }
        $yes = $p->confirmed_by ?? [];

        return ($p->confirm['mode'] ?? 'any') === 'all' ? !array_diff($p->confirm['user_ids'], $yes) : count(array_intersect($p->confirm['user_ids'], $yes)) > 0;
    }

    /**
     * Before a date pays: "ask before each payment" (wait until noon, then skip)
     * and "if there isn't enough money" (top up from Main, pay what's there,
     * skip, or cancel this one).
     */
    private function gateAndRun(ScheduledPayment $p, Carbon $now): ?array
    {
        if (!$this->confirmed($p)) {
            $noon = $p->next_run_at->copy()->setTimezone(ScheduledPayment::TIMEZONE)->setTime(12, 0);
            if ($now->lt($noon)) {
                return null;
            }

            return $this->passOver($p, $now, 'skipped', 'Nobody confirmed by noon, so it was skipped this time.');
        }
        $policy = $p->short_policy['on_day'] ?? null;
        $from = $p->fromWallet;
        if ($policy && $from && $from->availableToSpend() < $p->amount) {
            $have = $from->availableToSpend();
            switch ($policy) {
                case 'topup_main':
                    $main = $p->user?->mainWallet();
                    $missing = $p->amount - $have;
                    if ($main && $main->id !== $from->id && $main->availableToSpend() >= $missing) {
                        WalletService::make()->transferBetweenWallets($main, $from, $missing, $p->user, "Top-up for {$p->name}");

                        return $this->runOne($p, $now);
                    }

                    return $this->passOver($p, $now, 'cancelled', "{$from->name} had {$this->nice($have)} and Main couldn't cover the rest. Nothing was sent.");
                case 'pay_what_there':
                    return $have >= 10_000 ? $this->runOne($p, $now, $have) : $this->passOver($p, $now, 'skipped', "{$from->name} had {$this->nice($have)}. Nothing was sent.");
                case 'skip':
                    return $this->passOver($p, $now, 'skipped', "{$from->name} had {$this->nice($have)}. It tries again next time.");
                default:
                    return $this->passOver($p, $now, 'cancelled', "{$from->name} had {$this->nice($have)}. Nothing was sent.");
            }
        }

        return $this->runOne($p, $now);
    }

    /** RUL-08: this date is skipped or cancelled; the rule stays on for the next one. */
    public function passOver(ScheduledPayment $p, Carbon $now, string $result, string $reason): ?array
    {
        $claimed = DB::transaction(function () use ($p, $now) {
            $p = ScheduledPayment::whereKey($p->id)->lockForUpdate()->first();
            if (!$p || $p->status !== 'active' || !$p->next_run_at) {
                return null;
            }
            $n = $p->runs + 1;
            while (($at = $p->occurrence($n)) && $at->lte($now)) {
                $n++;
            }
            $done = !$at || ($p->ends_after !== null && $n >= $p->ends_after);
            $p->update(['runs' => $n, 'next_run_at' => $done ? null : $at, 'status' => $done ? 'done' : 'active', 'last_run_at' => $now, 'confirmed_for' => null, 'confirmed_by' => null]);

            return $p;
        });
        if (!$claimed) {
            return null;
        }
        $claimed->update(['last_result' => $result, 'last_reason' => $reason, 'last_reference' => null]);
        $this->tell($claimed, $result, $reason, null);

        return ['id' => $claimed->id, 'result' => $result, 'reason' => $reason, 'reference' => null];
    }

    /**
     * Hourly: warn N days before when the wallet won't have enough (RUL-07),
     * again the day before, and ask the confirmers the evening before (RUL-04).
     */
    public function checkUpcoming(?Carbon $now = null): int
    {
        $now ??= now();
        $local = $now->copy()->setTimezone(ScheduledPayment::TIMEZONE);
        $sent = 0;
        ScheduledPayment::with(['fromWallet', 'user'])->where('status', 'active')->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', $now->copy()->addDays(8))->where(fn ($q) => $q->whereNotNull('short_policy')->orWhereNotNull('confirm'))
            ->get()->each(function (ScheduledPayment $p) use ($local, &$sent) {
                $on = $p->next_run_at->copy()->setTimezone(ScheduledPayment::TIMEZONE);
                $key = $on->toDateString();
                $warned = $p->warned ?? [];
                $days = (int) $local->copy()->startOfDay()->diffInDays($on->copy()->startOfDay(), false);
                $label = $p->name ?: $p->to_name;

                // RUL-07 "Not enough for Sunday's payment".
                $short = $p->short_policy;
                if ($short && $p->fromWallet && $days >= 0) {
                    $projected = $this->projected($p);
                    $isShort = $projected < $p->amount;
                    $first = $days <= (int) ($short['check_days'] ?? 3) && !in_array("{$key}:warn", $warned, true);
                    $again = !empty($short['remind_day_before']) && $days === 1 && !in_array("{$key}:again", $warned, true);
                    if ($isShort && ($first || $again)) {
                        $this->notifications->push($p->user, 'scheduled_payment_short', "Not enough for {$on->format('l')}'s payment",
                            "{$label}, {$this->nice($p->amount)}, goes out {$on->format('D j M')} from {$p->fromWallet->name}. It will have {$this->nice(max(0, $projected))}, {$this->nice($p->amount - max(0, $projected))} short.",
                            ['scheduled_payment_id' => $p->id]);
                        $warned[] = $first ? "{$key}:warn" : "{$key}:again";
                        $warned[] = "{$key}:on:" . $local->toDateString();
                        $sent++;
                    }
                }

                // RUL-04 "Ask the evening before, at 7:00 pm".
                if (!empty($p->confirm['user_ids']) && $days === 1 && $local->hour >= 19 && !in_array("{$key}:asked", $warned, true)) {
                    foreach (User::whereIn('id', $p->confirm['user_ids'])->get() as $u) {
                        $this->notifications->push($u, 'scheduled_payment_confirm', "Confirm tomorrow's payment",
                            "{$label}: {$this->nice($p->amount)} to {$p->to_name} from {$p->fromWallet?->name}. Say yes by noon tomorrow or it's skipped.",
                            ['scheduled_payment_id' => $p->id]);
                        $sent++;
                    }
                    $warned[] = "{$key}:asked";
                }
                if ($warned !== ($p->warned ?? [])) {
                    $p->update(['warned' => array_values(array_slice(array_unique($warned), -20))]);
                }
            });

        return $sent;
    }

    /** What the wallet will have on the day, after other payments due first from it. */
    public function projected(ScheduledPayment $p): int
    {
        $before = ScheduledPayment::where('from_wallet_id', $p->from_wallet_id)->where('status', 'active')->where('id', '!=', $p->id)
            ->whereNotNull('next_run_at')->where('next_run_at', '<', $p->next_run_at)->sum('amount');

        return (int) $p->fromWallet->availableToSpend() - (int) $before;
    }

    /** RUL-04 a confirmer says yes for the date coming up. */
    public function confirm(ScheduledPayment $p, User $user): ScheduledPayment
    {
        if (!in_array($user->id, $p->confirm['user_ids'] ?? [], true)) {
            throw ValidationException::withMessages(['payment' => "This payment doesn't need your yes."]);
        }
        $by = $p->confirmed_for && $p->next_run_at && $p->confirmed_for->equalTo($p->next_run_at) ? ($p->confirmed_by ?? []) : [];
        $p->update(['confirmed_for' => $p->next_run_at, 'confirmed_by' => array_values(array_unique([...$by, $user->id]))]);

        return $p->fresh();
    }

    /** RUL-07 "Pay ₦28,400 now, rest later" / RUL-08 "Send it now instead". */
    public function sendNow(ScheduledPayment $p, ?int $amount = null): array
    {
        [$result, $reason, $reference] = $this->send($p, $amount);
        $p->update(['last_result' => $result, 'last_reason' => $reason, 'last_reference' => $reference]);
        $this->tell($p, $result, $reason, $reference, $amount);

        return ['result' => $result, 'reason' => $reason, 'reference' => $reference];
    }

    /** RUL-07 the warning sheet: what goes out, what's there, and other wallets to move from. */
    public function shortfall(ScheduledPayment $p): array
    {
        $projected = $this->projected($p);
        $on = $p->next_run_at?->copy()->setTimezone(ScheduledPayment::TIMEZONE);
        $others = Wallet::where('user_id', $p->user_id)->where('status', 'active')->where('id', '!=', $p->from_wallet_id)
            // Wallets meant for spending; savings, goals and projects keep their money.
            ->whereIn('type', ['main', 'spending', 'giving', 'shared', 'joint'])->get()
            ->filter(fn (Wallet $w) => $w->availableToSpend() > 0)->sortByDesc(fn (Wallet $w) => $w->availableToSpend())->take(3)
            ->map(fn (Wallet $w) => ['id' => $w->id, 'name' => $w->name, 'available' => $this->nice($w->availableToSpend())])->values()->all();
        $before = ScheduledPayment::where('from_wallet_id', $p->from_wallet_id)->where('status', 'active')->where('id', '!=', $p->id)
            ->whereNotNull('next_run_at')->where('next_run_at', '<', $p->next_run_at)->orderBy('next_run_at')->first();
        $policy = $p->short_policy['on_day'] ?? 'cancel';
        $deadline = $on?->copy()->subDay()->setTime(18, 0);

        return [
            'id' => $p->id,
            'title' => $on ? "Not enough for {$on->format('l')}'s payment" : 'Not enough for the next payment',
            'body' => ($p->name ?: $p->to_name) . ", {$this->nice($p->amount)}, goes out " . ($on?->format('D j M') ?? 'soon') . " from {$p->fromWallet?->name}."
                . ($before ? " {$p->fromWallet?->name} will be low after " . $before->next_run_at->copy()->setTimezone(ScheduledPayment::TIMEZONE)->format('l') . "'s {$this->nice($before->amount)} to {$before->to_name}." : ''),
            'by_then' => "{$p->fromWallet?->name} by " . ($on?->format('l') ?? 'then') . ': ' . $this->nice(max(0, $projected)),
            'short' => max(0, $p->amount - max(0, $projected)),
            'short_label' => $this->nice(max(0, $p->amount - max(0, $projected))) . ' short',
            'available' => max(0, (int) $p->fromWallet?->availableToSpend()),
            'available_label' => $this->nice(max(0, (int) $p->fromWallet?->availableToSpend())),
            'from_wallet_id' => $p->from_wallet_id,
            'others' => $others,
            'policy_line' => $deadline ? 'If nothing changes by ' . $deadline->format('D j M, g:i a') . ", we'll " . ['topup_main' => 'top up from Main', 'pay_what_there' => "pay what's there", 'skip' => 'skip it', 'cancel' => 'cancel it'][$policy] . ', as your rule says.' : null,
        ];
    }

    /** One date: claimed first (so a crash never pays it twice), then sent like a payment by hand. */
    public function runOne(ScheduledPayment $payment, Carbon $now, ?int $amount = null): ?array
    {
        $claimed = DB::transaction(function () use ($payment, $now) {
            $p = ScheduledPayment::whereKey($payment->id)->lockForUpdate()->first();
            if (!$p || $p->status !== 'active' || !$p->next_run_at || $p->next_run_at->gt($now)) {
                return null;
            }
            // The next date still to come; dates missed while we were down are not paid in a burst.
            $n = $p->runs + 1;
            while (($at = $p->occurrence($n)) && $at->lte($now)) {
                $n++;
            }
            $done = !$at || ($p->ends_after !== null && $n >= $p->ends_after);
            $p->update(['runs' => $n, 'next_run_at' => $done ? null : $at, 'status' => $done ? 'done' : 'active', 'last_run_at' => $now, 'confirmed_for' => null, 'confirmed_by' => null]);

            return $p;
        });
        if (!$claimed) {
            return null;
        }

        [$result, $reason, $reference] = $this->send($claimed, $amount);
        $claimed->update(['last_result' => $result, 'last_reason' => $reason, 'last_reference' => $reference]);
        $this->tell($claimed, $result, $reason, $reference, $amount);

        return ['id' => $claimed->id, 'result' => $result, 'reason' => $reason, 'reference' => $reference];
    }

    /** @return array{0: string, 1: ?string, 2: ?string} result, reason, reference */
    private function send(ScheduledPayment $p, ?int $amount = null): array
    {
        $amount ??= $p->amount;
        $user = $p->user;
        $from = $p->fromWallet;
        if (!$user || !$from) {
            return ['failed', 'The wallet is gone.', null];
        }
        // "Skips if Food and market is used up": no approval asked, just skipped.
        if ($p->skip_if_over && $p->budget_category_id && $from->budget()) {
            try {
                $over = BudgetService::make()->check($from, $user, $amount, $p->budget_category_id)['over'];
            } catch (ValidationException $e) {
                $over = collect($e->errors())->flatten()->first();
            }
            if ($over) {
                return ['skipped', "That would be {$over}.", null];
            }
        }

        $startedAt = now();
        try {
            $response = app(TransferController::class)->runScheduled($user, [
                'from_wallet_id' => $from->id,
                'amount' => number_format($amount / 100, 2, '.', ''),
                'description' => $p->note,
                'budget_category_id' => $p->budget_category_id,
                'destination' => $p->destination,
            ]);
            $body = $response->getData(true);
            if ($response->getStatusCode() >= 300) {
                return ['failed', $body['message'] ?? 'It didn\'t go through.', null];
            }

            return !empty($body['data']['pending_approval'])
                ? ['approval', 'Waiting for ' . (implode(' and ', $body['data']['approval']['waiting_on'] ?? []) ?: 'approval') . '.', null]
                : ['sent', null, $body['data']['reference'] ?? null];
        } catch (ValidationException $e) {
            return ['failed', collect($e->errors())->flatten()->first() ?? $e->getMessage(), null];
        } catch (\Throwable $e) {
            // A bank payout that timed out is parked as pending; it completes or comes back by itself.
            $parked = Transaction::where('wallet_id', $from->id)->where('user_id', $user->id)->where('type', 'withdrawal')
                ->where('status', 'pending')->where('created_at', '>=', $startedAt)->latest('id')->first();
            if ($parked) {
                return ['processing', 'The bank is taking a moment.', $parked->reference];
            }
            Log::warning("Scheduled payment {$p->id} failed: {$e->getMessage()}");

            return ['failed', 'Something went wrong on our side. Nothing was sent.', null];
        }
    }

    private function tell(ScheduledPayment $p, string $result, ?string $reason, ?string $reference, ?int $amount = null): void
    {
        $what = '₦' . number_format(($amount ?? $p->amount) / 100) . " to {$p->to_name}";
        [$title, $body] = match ($result) {
            'cancelled' => [($p->name ?: $p->to_name) . ' was cancelled', ($reason ?? '') . ($p->next_run_at ? ' The rule stays on for ' . $p->next_run_at->copy()->setTimezone(ScheduledPayment::TIMEZONE)->format('j M') . '.' : '')],
            'sent' => ["Paid {$what}", "Your scheduled payment from {$p->fromWallet?->name} went out."],
            'approval' => ["{$what} needs approval", "Your scheduled payment is waiting. {$reason}"],
            'processing' => ["Sending {$what}", 'The bank is taking a moment. It completes or comes back by itself.'],
            'skipped' => ["Skipped: {$what}", $reason ?? 'Nothing was sent.'],
            default => ["Couldn't pay {$what}", ($reason ?? '') . ' Nothing was sent.'],
        };
        $this->notifications->push($p->user, 'scheduled_payment_' . $result, $title, trim($body), ['scheduled_payment_id' => $p->id, 'reference' => $reference]);
    }

    /**
     * SND-15: what goes out on a date — repeat payments, giving schedules and a
     * goal's payout — with the total for the next 30 days and which are short.
     */
    public function overview(User $user, ?Carbon $now = null): array
    {
        $now ??= now();
        $until = $now->copy()->addDays(30);
        $rows = [];

        foreach (ScheduledPayment::with('fromWallet')->where('user_id', $user->id)->whereIn('status', ['active', 'paused'])->get() as $p) {
            $dates = $p->datesBetween($now, $until);
            $rows[] = [
                'id' => $p->id,
                'kind' => 'payment',
                'title' => $p->to_name . ($p->note ? " · {$p->note}" : ''),
                'when' => $p->when(),
                'from' => ['id' => $p->from_wallet_id, 'name' => $p->fromWallet?->name],
                'amount' => $p->amount,
                'next_on' => $p->status === 'active' ? $p->next_run_at : null,
                'paused' => $p->status === 'paused',
                'confirm' => false,
                'dates' => $dates,
                'wallet' => $p->fromWallet,
                'last_result' => $p->last_result,
                'last_reason' => $p->last_reason,
            ];
        }

        $mine = Wallet::where('user_id', $user->id)->pluck('id');
        foreach (GivingSchedule::with(['wallet', 'group'])->whereIn('wallet_id', $mine)->where('enabled', true)->get() as $g) {
            $from = $g->from_wallet_id ? Wallet::find($g->from_wallet_id) : $g->wallet;
            $coming = $g->upcoming($now->copy()->setTimezone(ScheduledPayment::TIMEZONE)->startOfDay(), 6);
            $dates = $coming->filter(fn ($d) => $d->lte($until))->values()->all();
            $rows[] = [
                'id' => $g->id,
                'kind' => 'giving',
                'title' => $g->label ?: ($g->group?->name ?? 'Giving'),
                'when' => $g->when() . ($g->group ? ' · ' . $g->group->splitLabel() : '') . ($g->ask_first ? ' · you confirm' : ''),
                'from' => ['id' => $from?->id, 'name' => $from?->name],
                'amount' => (int) $g->amount,
                'next_on' => $coming->first(),
                'paused' => false,
                'confirm' => (bool) $g->ask_first,
                'dates' => $dates,
                'wallet' => $from,
                'wallet_id' => $g->wallet_id,
                'last_result' => null,
                'last_reason' => null,
            ];
        }

        foreach (Wallet::whereIn('id', $mine)->where('type', 'goal')->where('status', 'active')->get() as $w) {
            $payout = $w->meta['goal']['payout'] ?? null;
            if (!$payout || !empty($payout['paid_at']) || empty($payout['run_on'])) {
                continue;
            }
            $on = Carbon::parse($payout['run_on'], ScheduledPayment::TIMEZONE)->setTime(7, 0);
            $to = SavedAccount::find($payout['saved_account_id'] ?? 0);
            $rows[] = [
                'id' => $w->id,
                'kind' => 'goal',
                'title' => $to?->nickname ?? $w->name,
                'when' => $on->format('j M Y') . ', once',
                'from' => ['id' => $w->id, 'name' => $w->name],
                'amount' => (int) ($w->target_amount ?: $w->balance),
                'next_on' => $on,
                'paused' => false,
                'confirm' => false,
                'dates' => $on->between($now, $until) ? [$on] : [],
                'wallet' => $w,
                'wallet_id' => $w->id,
                'last_result' => null,
                'last_reason' => null,
            ];
        }

        // Short: going through the dates in order, what each wallet will have left.
        $left = [];
        $events = collect($rows)->flatMap(fn ($r, $i) => collect($r['dates'])->map(fn ($d) => ['i' => $i, 'at' => $d]))->sortBy(fn ($e) => $e['at']->timestamp)->values();
        $short = [];
        foreach ($events as $e) {
            $r = $rows[$e['i']];
            if ($r['paused'] || !$r['wallet']) {
                continue;
            }
            $wid = $r['wallet']->id;
            $left[$wid] ??= $r['wallet']->availableToSpend();
            if ($left[$wid] < $r['amount']) {
                // It won't go (nothing is sent), so it takes nothing from the ones after it.
                $short[$e['i']] ??= $r['amount'] - $left[$wid];
                continue;
            }
            $left[$wid] -= $r['amount'];
        }

        $total = $events->sum(fn ($e) => $rows[$e['i']]['paused'] ? 0 : $rows[$e['i']]['amount']);
        $items = collect($rows)->map(function ($r, $i) use ($short, $user) {
            // "Scheduled payments still follow each wallet's approval rules."
            $approval = $r['wallet'] && $r['wallet']->approvalRequiredFor($r['amount']) && $r['wallet']->eligibleApprovers($user->id)->isNotEmpty();
            unset($r['dates'], $r['wallet']);

            return $r + ['short' => $short[$i] ?? null, 'approval' => (bool) $approval];
        })->sortBy(fn ($r) => $r['next_on'] ? $r['next_on']->timestamp : PHP_INT_MAX)->values();

        return ['items' => $items->all(), 'next_30_days' => $total, 'short_count' => count($short)];
    }
}
