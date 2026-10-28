<?php

namespace App\Services;

use App\Models\GivingPayment;
use App\Models\GivingPledge;
use App\Models\GivingRecipient;
use App\Models\GivingSchedule;
use App\Models\SavedAccount;
use App\Models\SavedAccountGroup;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Giving wallets (client prototype GIV-01…07, WAL-18). Money is set aside first
 * — a share of every deposit into one or more wallets, a fixed amount each month
 * or round-ups (client: "fixed deposits and percentage of deposits from 1 or more
 * wallets") — then paid to saved accounts on giving dates at 7:00 am: "Tithe ·
 * first Sunday", "Sunday offering · every Sunday", "Monthly gift · on the 15th",
 * a group split evenly. A pledge is paid off in parts from Main. Payments may
 * wait for the giver's yes; receipts and a yearly statement go by email; giving
 * may be anonymous. Amounts are kobo.
 */
class GivingService
{
    public const KINDS = ['tithes', 'zakat', 'charity', 'parents', 'dues'];

    public const SEND_HOUR = 7;

    /** Giving dates are Nigerian days: 7:00 am Lagos time, before service. */
    public const TIMEZONE = 'Africa/Lagos';

    public const MAX_SCHEDULES = 12;

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
        private readonly AutomationService $automations,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make(), AutomationService::make());
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    // ------------------------------------------------------------------ setup

    /**
     * $giving: kind, recipients [{saved_account_id}|{group_id}], set_aside [{kind:
     * percent|fixed|roundup, source_wallet_id, percent?, amount?, day_of_month?,
     * roundup_to?}], schedules [{label, amount, saved_account_id|group_id,
     * frequency, day_of_week?, day_of_month?, week_of_month?}], ask_first,
     * thanksgiving_reminder, pledge?, receipts, yearly_statement, anonymous,
     * source_wallet_id. Runs inside the caller's transaction.
     */
    public function configure(Wallet $wallet, User $owner, array $giving): void
    {
        $kind = in_array($giving['kind'] ?? null, self::KINDS, true) ? $giving['kind'] : 'tithes';
        $source = $this->ownWallet($owner, $giving['source_wallet_id'] ?? null, 'giving.source_wallet_id') ?? $owner->mainWallet();

        $wallet->update(['meta' => array_merge($wallet->meta ?? [], [
            'purpose' => $wallet->meta['purpose'] ?? $kind,
            'giving' => [
                'kind' => $kind,
                'ask_first' => (bool) ($giving['ask_first'] ?? false),
                'thanksgiving_reminder' => (bool) ($giving['thanksgiving_reminder'] ?? false),
                'receipts' => (bool) ($giving['receipts'] ?? true),
                'yearly_statement' => (bool) ($giving['yearly_statement'] ?? true),
                'anonymous' => (bool) ($giving['anonymous'] ?? false),
                'source_wallet_id' => $source?->id,
            ],
        ])]);

        foreach (array_values($giving['recipients'] ?? []) as $i => $r) {
            [$account, $group] = $this->payee($owner, $r, "giving.recipients.{$i}");
            GivingRecipient::create(['wallet_id' => $wallet->id, 'saved_account_id' => $account?->id, 'group_id' => $group?->id, 'position' => $i + 1]);
        }

        $this->setAside($wallet, $owner, array_values($giving['set_aside'] ?? []));

        $schedules = array_values($giving['schedules'] ?? []);
        if (count($schedules) > self::MAX_SCHEDULES) {
            throw ValidationException::withMessages(['giving.schedules' => 'You can have up to ' . self::MAX_SCHEDULES . ' giving dates.']);
        }
        foreach ($schedules as $i => $s) {
            $this->addSchedule($wallet, $owner, $s + ['ask_first' => (bool) ($giving['ask_first'] ?? false)], "giving.schedules.{$i}");
        }

        if (!empty($giving['pledge'])) {
            $this->addPledge($wallet, $owner, $giving['pledge'], $source);
        }
    }

    /** GIV-03: money moves into the wallet by itself, from one or more wallets. */
    private function setAside(Wallet $wallet, User $owner, array $lines): void
    {
        foreach ($lines as $i => $line) {
            $from = $this->ownWallet($owner, $line['source_wallet_id'] ?? null, "giving.set_aside.{$i}.source_wallet_id");
            if (!$from) {
                throw ValidationException::withMessages(["giving.set_aside.{$i}.source_wallet_id" => 'Choose the wallet to set money aside from.']);
            }
            match ($line['kind'] ?? null) {
                'percent' => $this->automations->createDepositRule($owner, $from, $wallet, (int) ($line['percent'] ?? 0)),
                'fixed' => $this->automations->createRule($owner, [
                    'name' => 'Set aside ' . $this->naira((int) ($line['amount'] ?? 0)) . " for {$wallet->name}",
                    'from_wallet_id' => $from->id,
                    'to_wallet_id' => $wallet->id,
                    'amount' => (int) ($line['amount'] ?? 0),
                    'frequency' => 'monthly',
                    'day_of_month' => max(1, min(28, (int) ($line['day_of_month'] ?? 25))),
                ]),
                'roundup' => $this->automations->createRoundUpRule($owner, $from, $wallet, (int) ($line['roundup_to'] ?? 0)),
                default => throw ValidationException::withMessages(["giving.set_aside.{$i}.kind" => 'Choose a share of deposits, a fixed amount or round-ups.']),
            };
        }
    }

    /** GIV-04: one giving date. */
    public function addSchedule(Wallet $wallet, User $owner, array $s, string $field = 'schedule'): GivingSchedule
    {
        $frequency = $s['frequency'] ?? null;
        if (!in_array($frequency, GivingSchedule::FREQUENCIES, true)) {
            throw ValidationException::withMessages(["{$field}.frequency" => 'Choose when it goes out.']);
        }
        if (trim((string) ($s['label'] ?? '')) === '' || (int) ($s['amount'] ?? 0) <= 0) {
            throw ValidationException::withMessages([$field => 'Give each giving date a name and an amount.']);
        }
        [$account, $group] = $this->payee($owner, $s, $field);

        $dow = isset($s['day_of_week']) ? (int) $s['day_of_week'] : null;
        $dom = isset($s['day_of_month']) ? (int) $s['day_of_month'] : null;
        $wom = isset($s['week_of_month']) ? (int) $s['week_of_month'] : null;
        $runOn = isset($s['run_on']) ? Carbon::parse($s['run_on'])->startOfDay() : null;
        $ok = match ($frequency) {
            'weekly' => $dow >= 1 && $dow <= 7,
            'monthly' => $dom >= 1 && $dom <= 28,
            'monthly_weekday' => $dow >= 1 && $dow <= 7 && $wom >= 1 && $wom <= 4,
            'once' => $runOn !== null && ($runOn->isToday() || $runOn->isFuture()),
        };
        if (!$ok) {
            throw ValidationException::withMessages([$field => 'Pick the day it goes out.']);
        }

        return GivingSchedule::create([
            'wallet_id' => $wallet->id,
            'label' => trim((string) $s['label']),
            'amount' => (int) $s['amount'],
            'saved_account_id' => $account?->id,
            'group_id' => $group?->id,
            'frequency' => $frequency,
            'day_of_week' => in_array($frequency, ['weekly', 'monthly_weekday'], true) ? $dow : null,
            'day_of_month' => $frequency === 'monthly' ? $dom : null,
            'week_of_month' => $frequency === 'monthly_weekday' ? $wom : null,
            'run_on' => $frequency === 'once' ? $runOn : null,
            'pledge_id' => $s['pledge_id'] ?? null,
            'from_wallet_id' => $s['from_wallet_id'] ?? null,
            'ask_first' => (bool) ($s['ask_first'] ?? false),
        ]);
    }

    /**
     * GIV-05: what's left of a pledge, paid in parts ("₦150,000 on 25 Nov and 25
     * Dec") or all at once, from Main after salary.
     */
    private function addPledge(Wallet $wallet, User $owner, array $p, ?Wallet $source): GivingPledge
    {
        $total = (int) ($p['total'] ?? 0);
        $paid = (int) ($p['paid_before'] ?? 0);
        $name = trim((string) ($p['name'] ?? ''));
        if ($name === '' || $total <= 0 || $paid < 0 || $paid >= $total) {
            throw ValidationException::withMessages(['giving.pledge' => 'Enter what the pledge is for, the total and what you have paid.']);
        }
        $due = isset($p['due_date']) ? Carbon::parse($p['due_date'])->startOfDay() : null;
        if (!$due || $due->isPast()) {
            throw ValidationException::withMessages(['giving.pledge.due_date' => 'Pick a date after today to finish paying.']);
        }
        [$account, $group] = $this->payee($owner, $p, 'giving.pledge');
        if (!$source) {
            throw ValidationException::withMessages(['giving.source_wallet_id' => 'Choose the wallet pledge payments come from.']);
        }

        $parts = array_values($p['parts'] ?? []);
        if (!$parts) {
            throw ValidationException::withMessages(['giving.pledge.parts' => 'Choose how to pay the rest.']);
        }
        $sum = 0;
        foreach ($parts as $i => $part) {
            $date = isset($part['date']) ? Carbon::parse($part['date'])->startOfDay() : null;
            $inRange = $date && ($date->isToday() || $date->isFuture()) && $date->lte($due);
            if (!$inRange || (int) ($part['amount'] ?? 0) <= 0) {
                throw ValidationException::withMessages(["giving.pledge.parts.{$i}" => 'Each part needs an amount and a date before the pledge is due.']);
            }
            $sum += (int) $part['amount'];
        }
        if ($sum !== $total - $paid) {
            throw ValidationException::withMessages(['giving.pledge.parts' => 'The parts must add up to the ' . $this->naira($total - $paid) . ' left.']);
        }

        $pledge = GivingPledge::create([
            'wallet_id' => $wallet->id,
            'name' => $name,
            'total' => $total,
            'paid_before' => $paid,
            'due_date' => $due,
            'saved_account_id' => $account?->id,
            'group_id' => $group?->id,
            'plan' => count($parts) > 1 ? 'parts' : 'once',
        ]);
        foreach ($parts as $i => $part) {
            $this->addSchedule($wallet, $owner, [
                'label' => count($parts) > 1 ? 'Pledge part ' . ($i + 1) : 'Pledge',
                'amount' => (int) $part['amount'],
                'saved_account_id' => $account?->id,
                'group_id' => $group?->id,
                'frequency' => 'once',
                'run_on' => $part['date'],
                'pledge_id' => $pledge->id,
                'from_wallet_id' => $source->id,
            ], "giving.pledge.parts.{$i}");
        }

        return $pledge;
    }

    /** One of the owner's saved accounts, or one of their groups (with accounts in it). */
    private function payee(User $owner, array $r, string $field): array
    {
        if (!empty($r['group_id'])) {
            $group = SavedAccountGroup::where('user_id', $owner->id)->find((int) $r['group_id']);
            if (!$group || $group->accounts()->doesntExist()) {
                throw ValidationException::withMessages([$field => 'Choose one of your saved groups.']);
            }

            return [null, $group];
        }
        $account = !empty($r['saved_account_id']) ? SavedAccount::where('user_id', $owner->id)->find((int) $r['saved_account_id']) : null;
        if (!$account) {
            throw ValidationException::withMessages([$field => 'Choose who receives it.']);
        }

        return [$account, null];
    }

    private function ownWallet(User $owner, mixed $id, string $field): ?Wallet
    {
        if (!$id) {
            return null;
        }
        $wallet = Wallet::where('id', (int) $id)->where('user_id', $owner->id)->where('status', 'active')->first();
        if (!$wallet) {
            throw ValidationException::withMessages([$field => 'Choose one of your own wallets.']);
        }

        return $wallet;
    }

    // ------------------------------------------------------------- payments

    /**
     * Giving dates that fall today, at 7:00 am or later: one payment per
     * recipient (a group splits the amount), sent at once or waiting for a yes.
     */
    public function runDue(?Carbon $now = null): array
    {
        $now = ($now ?? now())->copy()->setTimezone(self::TIMEZONE);
        if ($now->hour < self::SEND_HOUR) {
            return [];
        }
        $today = $now->copy()->startOfDay();
        $results = [];

        GivingSchedule::where('enabled', true)->whereHas('wallet', fn ($q) => $q->where('type', 'giving')->where('status', 'active'))->get()
            ->filter(fn (GivingSchedule $s) => $s->fallsOn($today) && $s->last_run_period !== $today->toDateString())
            ->each(function (GivingSchedule $schedule) use ($today, &$results) {
                try {
                    $results = [...$results, ...$this->runSchedule($schedule, $today)];
                } catch (\Throwable $e) {
                    Log::warning("Giving schedule {$schedule->id} failed: {$e->getMessage()}");
                    $results[] = ['schedule_id' => $schedule->id, 'status' => 'error', 'reason' => $e->getMessage()];
                }
            });

        return $results;
    }

    private function runSchedule(GivingSchedule $schedule, Carbon $day): array
    {
        $period = $day->toDateString();
        $payments = DB::transaction(function () use ($schedule, $period) {
            $locked = GivingSchedule::whereKey($schedule->id)->lockForUpdate()->first();
            if (!$locked || $locked->last_run_period === $period) {
                return collect();
            }
            $payees = $locked->payees();
            $created = collect();
            if ($payees->isNotEmpty()) {
                $each = intdiv($locked->amount, $payees->count());
                $extra = $locked->amount - $each * $payees->count();
                foreach ($payees->values() as $i => $account) {
                    $created->push(GivingPayment::firstOrCreate(
                        ['schedule_id' => $locked->id, 'saved_account_id' => $account->id, 'period' => $period],
                        ['wallet_id' => $locked->wallet_id, 'amount' => $each + ($i === 0 ? $extra : 0), 'status' => $locked->ask_first ? 'awaiting' : 'due'],
                    ));
                }
            }
            $locked->update(['last_run_period' => $period, 'last_run_at' => now(), 'enabled' => $locked->frequency === 'once' ? false : $locked->enabled]);

            return $created;
        });

        $out = [];
        foreach ($payments as $payment) {
            if ($payment->status === 'awaiting') {
                $this->askFirst($payment);
                $out[] = ['payment_id' => $payment->id, 'status' => 'awaiting'];
            } elseif ($payment->status === 'due') {
                $out[] = ['payment_id' => $payment->id, 'status' => $this->pay($payment)->status];
            }
        }

        return $out;
    }

    private function askFirst(GivingPayment $payment): void
    {
        $wallet = $payment->wallet;
        $this->notifications->push(
            $wallet->owner,
            'giving_confirm',
            "{$payment->schedule->label} is ready to send",
            "{$this->naira($payment->amount)} to {$payment->savedAccount->nickname}. Open {$wallet->name} to send it or skip it.",
            ['wallet_id' => $wallet->id, 'giving_payment_id' => $payment->id],
        );
    }

    /**
     * Send one payment. Pledge parts come from their own wallet (Main); anything
     * else from what's set aside, with Main covering a shortfall ("The first
     * offering comes from Main this week, since nothing is set aside yet").
     */
    public function pay(GivingPayment $payment): GivingPayment
    {
        $wallet = $payment->wallet;
        $owner = $wallet->owner;
        $schedule = $payment->schedule;
        $account = $payment->savedAccount;
        $settings = $wallet->givingSettings();
        $fee = (int) config('services.matrix.transfer_fee_kobo', 2000);
        $need = $payment->amount + $fee;
        $note = null;

        try {
            if (!$owner || !$account) {
                throw ValidationException::withMessages(['payment' => 'The recipient or the wallet owner is no longer there.']);
            }
            $cover = $schedule?->fromWallet;
            if ($cover) {
                $this->wallets->transferBetweenWallets($cover, $wallet, $need, $owner, "{$schedule->label} for {$account->nickname}");
                $note = "From {$cover->name}";
            } elseif (($short = $need - $wallet->fresh()->availableToSpend()) > 0) {
                $main = Wallet::where('id', $settings['source_wallet_id'] ?? 0)->where('user_id', $owner->id)->first() ?? $owner->mainWallet();
                if (!$main || $main->availableToSpend() < $short) {
                    throw ValidationException::withMessages(['amount' => 'Not enough set aside, and ' . ($main?->name ?? 'Main') . " can't cover it."]);
                }
                $this->wallets->transferBetweenWallets($main, $wallet, $short, $owner, "Topped up for {$schedule?->label}");
                $note = "{$this->naira($short)} came from {$main->name}";
            }

            $from = !empty($settings['anonymous']) ? 'Patriai member' : $owner->fullName();
            $txn = $this->wallets->withdrawToBank($wallet->fresh(), $owner, $payment->amount, $account->bank_code, $account->account_number, $account->account_name, $account->bank_name, ($schedule?->label ?? 'Giving') . " from {$from}");
            $payment->update(['status' => 'paid', 'transaction_id' => $txn->id, 'receipt_no' => 'GV-' . now()->format('Y') . '-' . str_pad((string) $payment->id, 5, '0', STR_PAD_LEFT), 'note' => $note]);

            if (!empty($settings['receipts'])) {
                $this->notifications->push($owner, 'giving_receipt', "Receipt: {$this->naira($payment->amount)} to {$account->nickname}", ($schedule?->label ?? 'Giving') . " · {$payment->receipt_no} · " . now()->format('j M Y, g:i a') . ($note ? " · {$note}" : '') . '.', ['wallet_id' => $wallet->id, 'giving_payment_id' => $payment->id]);
            }
        } catch (\Throwable $e) {
            $reason = $e instanceof ValidationException ? collect($e->errors())->flatten()->first() : $e->getMessage();
            $payment->update(['status' => 'failed', 'note' => mb_substr((string) $reason, 0, 200)]);
            if ($owner) {
                $this->notifications->push($owner, 'giving_failed', "{$schedule?->label} to {$account?->nickname} didn't go", (string) $reason, ['wallet_id' => $wallet->id, 'giving_payment_id' => $payment->id]);
            }
        }

        return $payment->refresh();
    }

    /** "Ask me before each payment": the giver says send. */
    public function confirm(GivingPayment $payment, User $user): GivingPayment
    {
        $this->requireOwner($payment->wallet, $user);
        if ($payment->status !== 'awaiting') {
            throw ValidationException::withMessages(['payment' => 'This payment is no longer waiting.']);
        }
        $payment->update(['status' => 'due']);

        return $this->pay($payment);
    }

    public function skip(GivingPayment $payment, User $user): GivingPayment
    {
        $this->requireOwner($payment->wallet, $user);
        if ($payment->status !== 'awaiting') {
            throw ValidationException::withMessages(['payment' => 'This payment is no longer waiting.']);
        }
        $payment->update(['status' => 'skipped']);

        return $payment;
    }

    private function requireOwner(Wallet $wallet, User $user): void
    {
        if ($wallet->user_id !== $user->id) {
            throw ValidationException::withMessages(['wallet' => 'Only the owner can change this giving wallet.']);
        }
    }

    // -------------------------------------------------------------- reminders

    /** GIV-04 "Thanksgiving and special Sundays — remind me to add a one-off". Saturdays. */
    public function remindThanksgiving(): int
    {
        $sent = 0;
        Wallet::where('type', 'giving')->where('status', 'active')->get()
            ->filter(fn (Wallet $w) => !empty($w->givingSettings()['thanksgiving_reminder']))
            ->each(function (Wallet $wallet) use (&$sent) {
                $this->notifications->push($wallet->owner, 'giving_reminder', 'Thanksgiving or a special Sunday tomorrow?', "Add a one-off to {$wallet->name} so it goes at 7:00 am.", ['wallet_id' => $wallet->id]);
                $sent++;
            });

        return $sent;
    }

    /** GIV-06 "Yearly giving statement": every January, by email, for the year before. */
    public function sendStatements(int $year): int
    {
        $sent = 0;
        Wallet::where('type', 'giving')->get()
            ->filter(fn (Wallet $w) => !empty($w->givingSettings()['yearly_statement']))
            ->each(function (Wallet $wallet) use ($year, &$sent) {
                $statement = $this->statement($wallet, $year);
                if ($statement['total'] <= 0 || !$wallet->owner) {
                    return;
                }
                $lines = collect($statement['by_recipient'])->map(fn ($r) => "{$r['name']}: {$this->naira($r['amount'])} ({$r['payments']} payments)")->join("\n");
                $this->notifications->push($wallet->owner, 'giving_statement', "Your {$year} giving statement", "{$wallet->name}, {$year}: {$this->naira($statement['total'])} given.\n{$lines}", ['wallet_id' => $wallet->id, 'year' => $year]);
                $sent++;
            });

        return $sent;
    }

    /** @return array{total: int, by_recipient: list<array{name: string, amount: int, payments: int}>} */
    public function statement(Wallet $wallet, int $year): array
    {
        $paid = $wallet->givingPayments()->with('savedAccount')->where('status', 'paid')->whereYear('created_at', $year)->get();

        return [
            'total' => (int) $paid->sum('amount'),
            'by_recipient' => $paid->groupBy('saved_account_id')->map(fn (Collection $g) => [
                'name' => $g->first()->savedAccount?->nickname ?? 'Removed account',
                'amount' => (int) $g->sum('amount'),
                'payments' => $g->count(),
            ])->values()->all(),
        ];
    }

    // ----------------------------------------------------------------- detail

    /** WAL-18: set aside, given this year, coming up, waiting, pledge, recipients. */
    public function detail(Wallet $wallet): array
    {
        $now = now()->setTimezone(self::TIMEZONE);
        $schedules = $wallet->givingSchedules()->with(['savedAccount', 'group.accounts', 'pledge'])->get();
        $coming = $schedules->flatMap(fn (GivingSchedule $s) => $s->upcoming($now, 2)->map(fn (Carbon $d) => [$s, $d]))
            ->sortBy(fn ($pair) => $pair[1]->timestamp)
            ->take(6)
            ->map(fn ($pair) => [
                'schedule_id' => $pair[0]->id,
                'date' => $pair[1]->toDateString(),
                'label' => $pair[0]->label,
                'amount' => number_format($pair[0]->amount / 100, 2, '.', ''),
                'to' => $this->payeeName($pair[0]),
                'when' => $pair[0]->when(),
                'ask_first' => $pair[0]->ask_first,
            ])->values();

        $pledge = $wallet->givingPledges()->where('status', 'active')->latest()->first();
        $settings = $wallet->givingSettings();
        $rules = \App\Models\AutomationRule::where('to_wallet_id', $wallet->id)->with('fromWallet')->get();

        return [
            'kind' => $settings['kind'] ?? null,
            'settings' => $settings,
            'set_aside' => $wallet->balanceNaira(),
            'given_this_year' => number_format((int) $wallet->givingPayments()->where('status', 'paid')->whereYear('created_at', $now->year)->sum('amount') / 100, 2, '.', ''),
            'set_aside_rules' => $rules->map(fn ($r) => [
                'id' => $r->id,
                'name' => $r->name,
                'trigger' => $r->trigger,
                'percent' => $r->percent,
                'amount' => number_format($r->amount / 100, 2, '.', ''),
                'from' => $r->fromWallet?->name,
                'enabled' => (bool) $r->enabled,
            ])->values(),
            'coming_up' => $coming,
            'schedules' => $schedules->map(fn (GivingSchedule $s) => [
                'id' => $s->id,
                'label' => $s->label,
                'amount' => number_format($s->amount / 100, 2, '.', ''),
                'to' => $this->payeeName($s),
                'when' => $s->when(),
                'frequency' => $s->frequency,
                'ask_first' => $s->ask_first,
                'enabled' => $s->enabled,
                'pledge_id' => $s->pledge_id,
            ])->values(),
            'awaiting' => $wallet->givingPayments()->with(['schedule', 'savedAccount'])->where('status', 'awaiting')->orderBy('id')->get()->map(fn (GivingPayment $p) => [
                'id' => $p->id,
                'label' => $p->schedule?->label,
                'amount' => number_format($p->amount / 100, 2, '.', ''),
                'to' => $p->savedAccount?->nickname,
                'date' => $p->period,
            ])->values(),
            'recent' => $wallet->givingPayments()->with(['schedule', 'savedAccount'])->whereIn('status', ['paid', 'failed', 'skipped'])->latest('id')->limit(5)->get()->map(fn (GivingPayment $p) => [
                'id' => $p->id,
                'label' => $p->schedule?->label,
                'amount' => number_format($p->amount / 100, 2, '.', ''),
                'to' => $p->savedAccount?->nickname,
                'status' => $p->status,
                'receipt_no' => $p->receipt_no,
                'note' => $p->note,
                'date' => $p->period,
            ])->values(),
            'pledge' => $pledge ? [
                'id' => $pledge->id,
                'name' => $pledge->name,
                'total' => number_format($pledge->total / 100, 2, '.', ''),
                'paid' => number_format($pledge->paid() / 100, 2, '.', ''),
                'due_date' => $pledge->due_date?->toDateString(),
                'to' => $pledge->group?->name ?? $pledge->savedAccount?->nickname,
            ] : null,
            'recipients' => $wallet->givingRecipients()->with(['savedAccount.organisation', 'group.accounts'])->get()->map(fn (GivingRecipient $r) => $r->group ? [
                'group_id' => $r->group->id,
                'name' => $r->group->name,
                'accounts' => $r->group->accounts->pluck('nickname'),
            ] : [
                'saved_account_id' => $r->saved_account_id,
                'name' => $r->savedAccount?->nickname,
                'verified' => (bool) $r->savedAccount?->isVerified(),
            ])->values(),
            'statement' => ['year' => $now->year, 'enabled' => !empty($settings['yearly_statement'])],
        ];
    }

    public function payeeName(GivingSchedule $s): string
    {
        if ($s->group) {
            return $s->group->name;
        }

        return $s->savedAccount?->nickname ?? 'Removed account';
    }
}
