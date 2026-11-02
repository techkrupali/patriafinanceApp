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

        return ScheduledPayment::where('status', 'active')->where('next_run_at', '<=', $now)->orderBy('next_run_at')->limit(200)->get()
            ->map(fn (ScheduledPayment $p) => $this->runOne($p, $now))->filter()->values()->all();
    }

    /** One date: claimed first (so a crash never pays it twice), then sent like a payment by hand. */
    public function runOne(ScheduledPayment $payment, Carbon $now): ?array
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
            $p->update(['runs' => $n, 'next_run_at' => $done ? null : $at, 'status' => $done ? 'done' : 'active', 'last_run_at' => $now]);

            return $p;
        });
        if (!$claimed) {
            return null;
        }

        [$result, $reason, $reference] = $this->send($claimed);
        $claimed->update(['last_result' => $result, 'last_reason' => $reason, 'last_reference' => $reference]);
        $this->tell($claimed, $result, $reason, $reference);

        return ['id' => $claimed->id, 'result' => $result, 'reason' => $reason, 'reference' => $reference];
    }

    /** @return array{0: string, 1: ?string, 2: ?string} result, reason, reference */
    private function send(ScheduledPayment $p): array
    {
        $user = $p->user;
        $from = $p->fromWallet;
        if (!$user || !$from) {
            return ['failed', 'The wallet is gone.', null];
        }
        // "Skips if Food and market is used up": no approval asked, just skipped.
        if ($p->skip_if_over && $p->budget_category_id && $from->budget()) {
            try {
                $over = BudgetService::make()->check($from, $user, $p->amount, $p->budget_category_id)['over'];
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
                'amount' => number_format($p->amount / 100, 2, '.', ''),
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

    private function tell(ScheduledPayment $p, string $result, ?string $reason, ?string $reference): void
    {
        $what = '₦' . number_format($p->amount / 100) . " to {$p->to_name}";
        [$title, $body] = match ($result) {
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
