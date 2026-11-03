<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\AutomationRun;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * The rule builder from the client prototype: AUT-02 templates, AUT-03 when,
 * AUT-04 only if, AUT-05 then, AUT-06 review ("Last month this would have run
 * once"), AUT-07 "Describe your rule", AUT-08 the run log, AUT-10 failed rules
 * and the salary-day order. AutomationService does the running.
 */
class RuleBuilderService
{
    private const DAYS = [1 => 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    public static function make(): self
    {
        return new self();
    }

    private function nice(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    private function ordinal(int $n): string
    {
        $s = ($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');

        return $n . $s;
    }

    // ------------------------------------------------------------------ draft

    /**
     * Check a draft and fill in its wallets.
     *
     * @param  array<string, mixed>  $d
     * @return array<string, mixed>
     */
    public function normalise(User $user, array $d): array
    {
        $trigger = $d['trigger'];
        $action = $d['action'] ?? 'move';
        // RUL-01 "Round up and save": spare change from Main into a goal.
        if ($trigger === 'roundup') {
            $main = $user->mainWallet();
            $to = Wallet::where('id', $d['to_wallet_id'] ?? 0)->where('user_id', $user->id)->first();
            if (!$main || !$to || $to->id === $main->id) {
                throw ValidationException::withMessages(['to_wallet_id' => 'Pick the wallet the change goes into.']);
            }

            return [
                'user_id' => $user->id, 'name' => 'Round-ups to ' . $this->nice((int) ($d['roundup_to'] ?? 10_000)), 'trigger' => 'roundup', 'event' => null,
                'watch_wallet_id' => null, 'threshold' => null, 'from_wallet_id' => $main->id, 'to_wallet_id' => $to->id, 'amount' => 0,
                'percent' => null, 'fill_to' => false, 'action' => 'move', 'frequency' => 'daily', 'day_of_week' => null, 'day_of_month' => null,
                'min_balance' => null, 'before_day' => null, 'notify_user_ids' => null, 'roundup_to' => (int) ($d['roundup_to'] ?? 10_000), '_max_per' => null,
            ];
        }
        $own = fn (?int $id) => $id ? Wallet::where('id', $id)->where('user_id', $user->id)->whereNotIn('status', ['closed'])->first() : null;
        $see = fn (?int $id) => $id ? Wallet::find($id) : null;

        $watch = in_array($trigger, ['balance', 'event'], true) ? $see($d['watch_wallet_id'] ?? null) : null;
        if (in_array($trigger, ['balance', 'event'], true) && (!$watch || !$watch->isAccessibleBy($user))) {
            throw ValidationException::withMessages(['watch_wallet_id' => 'Pick a wallet to watch.']);
        }
        if ($trigger === 'balance' && (int) ($d['threshold'] ?? 0) <= 0) {
            throw ValidationException::withMessages(['threshold' => 'How low should it get before the rule runs?']);
        }
        if ($trigger === 'event' && !in_array($d['event'] ?? null, ['goal_reached', 'request_made'], true)) {
            throw ValidationException::withMessages(['event' => 'Pick what should happen.']);
        }
        if ($trigger === 'event' && ($d['event'] ?? null) === 'goal_reached' && (int) $watch?->target_amount <= 0) {
            throw ValidationException::withMessages(['watch_wallet_id' => "{$watch?->name} has no goal amount."]);
        }

        if ($action === 'notify') {
            $from = $to = $watch ?? $own($d['from_wallet_id'] ?? null);
            if (!$from) {
                throw ValidationException::withMessages(['watch_wallet_id' => 'Pick a wallet.']);
            }
        } else {
            $from = $own($d['from_wallet_id'] ?? null);
            $to = $own($d['to_wallet_id'] ?? null) ?? ($trigger === 'balance' && $watch?->user_id === $user->id ? $watch : null);
            if (!$from || !$to) {
                throw ValidationException::withMessages(['wallet' => 'Pick two of your own wallets to move money between.']);
            }
            if ($from->id === $to->id) {
                throw ValidationException::withMessages(['to_wallet_id' => 'Move money into a different wallet.']);
            }
            if ($trigger !== 'salary' && $action !== 'sweep' && (int) ($d['amount'] ?? 0) <= 0) {
                throw ValidationException::withMessages(['amount' => 'How much should it move?']);
            }
            if ($trigger === 'salary' && ((int) ($d['percent'] ?? 0) < 1 || (int) ($d['percent'] ?? 0) > 90)) {
                throw ValidationException::withMessages(['percent' => 'Pick a share between 1% and 90%.']);
            }
        }
        if ($trigger === 'schedule' && !in_array($d['frequency'] ?? null, ['daily', 'weekly', 'monthly'], true)) {
            throw ValidationException::withMessages(['frequency' => 'Pick how often.']);
        }

        // "Also tell Emeka": only people who share one of these wallets.
        $shared = collect([$from, $to, $watch])->filter()->flatMap(fn (Wallet $w) => WalletMember::where('wallet_id', $w->id)->where('status', 'active')->pluck('user_id')->push($w->user_id))->unique();
        $notify = collect($d['notify_user_ids'] ?? [])->map('intval')->filter(fn ($id) => $shared->contains($id) && $id !== $user->id)->values()->all();

        $maxPer = $d['max_per'] ?? 'week';
        $frequency = match ($trigger) {
            'schedule' => $d['frequency'],
            'balance', 'event' => ['day' => 'daily', 'week' => 'weekly', 'month' => 'monthly'][$maxPer] ?? 'weekly',
            default => 'monthly',
        };

        return [
            'user_id' => $user->id,
            'name' => trim((string) ($d['name'] ?? '')) ?: $this->suggestName($trigger, $action, $from, $to, $watch, $d),
            'trigger' => $trigger,
            'event' => $trigger === 'event' ? $d['event'] : null,
            'watch_wallet_id' => $watch?->id,
            'threshold' => $trigger === 'balance' ? (int) $d['threshold'] : null,
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'amount' => $action === 'notify' ? 0 : (int) ($d['amount'] ?? 0),
            'percent' => $trigger === 'salary' ? (int) $d['percent'] : null,
            'fill_to' => (bool) ($d['fill_to'] ?? false),
            'action' => $action,
            'frequency' => $frequency,
            'day_of_week' => $frequency === 'weekly' && $trigger === 'schedule' ? (int) ($d['day_of_week'] ?? 1) : ($frequency === 'weekly' ? null : null),
            'day_of_month' => $frequency === 'monthly' && $trigger === 'schedule' ? (int) ($d['day_of_month'] ?? 1) : null,
            'min_balance' => isset($d['min_balance']) && $d['min_balance'] !== null && (int) $d['min_balance'] > 0 ? (int) $d['min_balance'] : null,
            'before_day' => isset($d['before_day']) && (int) $d['before_day'] >= 2 && (int) $d['before_day'] <= 28 ? (int) $d['before_day'] : null,
            'notify_user_ids' => $notify ?: null,
            '_max_per' => in_array($trigger, ['balance', 'event'], true) ? $maxPer : null,
        ];
    }

    private function suggestName(string $trigger, string $action, Wallet $from, Wallet $to, ?Wallet $watch, array $d): string
    {
        return match (true) {
            $action === 'notify' && $trigger === 'balance' => "Tell me when {$watch?->name} runs low",
            $action === 'notify' && ($d['event'] ?? null) === 'goal_reached' => "{$watch?->name} reached its goal",
            $action === 'notify' => "Tell me about requests on {$watch?->name}",
            $trigger === 'balance' => "Keep {$to->name} topped up",
            $trigger === 'salary' => "Save from every salary",
            $action === 'sweep' => "Sweep {$from->name} into {$to->name}",
            default => "Move money to {$to->name}",
        };
    }

    /**
     * WHEN / IF / THEN in words, the way AUT-01/06/08 show them.
     *
     * @return array{when: string, if: ?string, then: string}
     */
    public function words(AutomationRule|array $r): array
    {
        $g = fn (string $k) => is_array($r) ? ($r[$k] ?? null) : $r->{$k};
        // "Main" reads better than "Main wallet" in a sentence.
        $wallet = function (?int $id): ?Wallet {
            $w = $id ? Wallet::find($id) : null;
            if ($w && $w->type === 'main') {
                $w->name = 'Main';
            }

            return $w;
        };
        $from = $wallet($g('from_wallet_id'));
        $to = $wallet($g('to_wallet_id'));
        $watch = $wallet($g('watch_wallet_id')) ?? $to;
        $trigger = $g('trigger');
        $freq = $g('frequency');
        $maxPer = is_array($r) ? ($r['_max_per'] ?? null) : ['daily' => 'day', 'weekly' => 'week', 'monthly' => 'month'][$freq] ?? null;

        $when = match ($trigger) {
            'balance' => "{$watch?->name} falls below {$this->nice((int) $g('threshold'))}",
            'event' => match ($g('event')) {
                'goal_reached' => "{$watch?->name} reaches its goal",
                'goal_behind' => 'a goal falls behind',
                default => "someone asks for money from {$watch?->name}",
            },
            'salary' => "salary lands in {$from?->name}",
            'deposit' => "money lands in {$from?->name}",
            'roundup' => "you pay from {$from?->name}",
            default => match ($freq) {
                'weekly' => 'it is ' . (self::DAYS[(int) $g('day_of_week')] ?? 'the set day'),
                'monthly' => "it's the {$this->ordinal((int) $g('day_of_month'))} of the month",
                default => 'every day',
            },
        };

        $if = [];
        if ($g('min_balance') && in_array($trigger, ['balance', 'event'], true)) {
            $if[] = "{$from?->name} has over {$this->nice((int) $g('min_balance'))}";
        } elseif ($g('min_balance')) {
            $if[] = "{$from?->name} keeps {$this->nice((int) $g('min_balance'))}";
        }
        if ($g('before_day')) {
            $if[] = "before the {$this->ordinal((int) $g('before_day'))}";
        }
        if (in_array($trigger, ['balance', 'event'], true) && $maxPer && !($trigger === 'event' && $g('event') === 'goal_reached')) {
            $if[] = "once a {$maxPer}";
        }

        $tell = collect($g('notify_user_ids') ?? [])->map(fn ($id) => User::find($id)?->first_name)->filter()->join(' and ');
        $then = match (true) {
            $g('action') === 'notify' => 'tell you' . ($tell ? " and {$tell}" : ''),
            $g('action') === 'sweep' => "move everything above {$this->nice((int) $g('amount'))} from {$from?->name} to {$to?->name}",
            $trigger === 'salary' => "move {$g('percent')}% to {$to?->name}",
            $trigger === 'roundup' => "round up to {$this->nice((int) $g('roundup_to'))} and save the change in {$to?->name}",
            (bool) $g('fill_to') => "top {$to?->name} back up to {$this->nice((int) $g('amount'))} from {$from?->name}",
            default => "move {$this->nice((int) $g('amount'))} from {$from?->name} to {$to?->name}",
        };
        if ($tell && $g('action') !== 'notify') {
            $then .= ", tell {$tell}";
        }

        return [
            'when' => ucfirst($when),
            'if' => $if ? ucfirst(implode(', ', $if)) : null,
            'then' => ucfirst($then),
        ];
    }

    /** Co-owners of the wallet money goes into: they agree first (AUT-06). */
    public function agreementNeeded(User $user, array $n): array
    {
        if (in_array($n['action'], ['notify'], true)) {
            return [];
        }
        $to = Wallet::find($n['to_wallet_id']);
        if (!$to || $to->type === 'main') {
            return [];
        }

        return WalletMember::where('wallet_id', $to->id)->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])
            ->where('user_id', '!=', $user->id)->pluck('user_id')->unique()->values()->all();
    }

    /**
     * AUT-06 "Last month this would have run once, on 14 Oct": replay the
     * watched wallet's balance over the last 30 days.
     */
    public function lastMonth(array $n): ?string
    {
        if ($n['trigger'] !== 'balance') {
            return null;
        }
        $txns = Transaction::where('wallet_id', $n['watch_wallet_id'])->where('status', 'successful')
            ->where('created_at', '>=', now()->subDays(30))->orderBy('id')->get(['balance_after', 'created_at']);
        $periods = [];
        foreach ($txns as $t) {
            if ($t->balance_after === null || (int) $t->balance_after >= (int) $n['threshold']) {
                continue;
            }
            $at = $t->created_at->copy()->setTimezone('Africa/Lagos');
            if ($n['before_day'] && $at->day >= $n['before_day']) {
                continue;
            }
            $key = match ($n['_max_per'] ?? 'week') { 'day' => $at->format('Y-m-d'), 'month' => $at->format('Y-m'), default => $at->format('o-W') };
            $periods[$key] ??= $at;
        }
        $n2 = count($periods);
        if ($n2 === 0) {
            return "Last month this wouldn't have run.";
        }
        $dates = collect($periods)->map(fn (Carbon $d) => $d->format('j M'))->values();

        return 'Last month this would have run ' . ($n2 === 1 ? 'once, on ' . $dates[0] : "{$n2} times, first on {$dates[0]}") . '.';
    }

    /** AUT-06: everything the review shows for a draft. */
    public function preview(User $user, array $d): array
    {
        $n = $this->normalise($user, $d);
        $needed = $this->agreementNeeded($user, $n);
        $names = User::whereIn('id', $needed)->pluck('first_name')->join(' and ');

        return [
            'name' => $n['name'],
            'words' => $this->words($n),
            'last_month' => $this->lastMonth($n),
            'needs_agreement' => $names ?: null,
            'agreement_line' => $names ? "{$names} must agree because it moves money into a shared wallet." : null,
        ];
    }

    /** "Turn on" (and ask Emeka). */
    public function create(User $user, array $d): AutomationRule
    {
        $n = $this->normalise($user, $d);
        if ($n['trigger'] === 'roundup') {
            return AutomationService::make()->createRoundUpRule($user, Wallet::find($n['from_wallet_id']), Wallet::find($n['to_wallet_id']), $n['roundup_to']);
        }
        $needed = $this->agreementNeeded($user, $n);
        unset($n['_max_per']);
        $n['agreement'] = $needed ? ['needed' => $needed, 'given' => []] : null;
        $n['priority'] = (int) AutomationRule::where('user_id', $user->id)->max('priority') + 1;
        $n['enabled'] = true;
        $rule = AutomationRule::create($n);
        foreach (User::whereIn('id', $needed)->get() as $other) {
            NotificationService::make()->push($other, 'automation_agree', "{$user->first_name} wants a rule on " . ($rule->toWallet?->name ?? 'a shared wallet'),
                "{$rule->name}: " . lcfirst($this->words($rule)['then']) . '. It runs once you agree.', ['automation_rule_id' => $rule->id]);
        }

        return $rule;
    }

    /** AUT-09 "Edit rule — changes need Emeka's yes". */
    public function update(AutomationRule $rule, User $user, array $d): AutomationRule
    {
        if ($rule->user_id !== $user->id) {
            throw ValidationException::withMessages(['rule' => 'Only the person who made this rule can change it.']);
        }
        $n = $this->normalise($user, $d);
        $needed = $this->agreementNeeded($user, $n);
        unset($n['_max_per'], $n['user_id']);
        $n['agreement'] = $needed ? ['needed' => $needed, 'given' => []] : null;
        $n['last_run_period'] = null;
        $rule->update($n);
        foreach (User::whereIn('id', $needed)->get() as $other) {
            NotificationService::make()->push($other, 'automation_agree', "{$user->first_name} changed {$rule->name}",
                lcfirst($this->words($rule)['then']) . '. It runs again once you agree.', ['automation_rule_id' => $rule->id]);
        }

        return $rule->fresh();
    }

    /** Emeka says yes (or no) to a rule that moves money into a wallet he co-owns. */
    public function agree(AutomationRule $rule, User $user, bool $yes): AutomationRule
    {
        $needed = $rule->agreement['needed'] ?? [];
        if (!in_array($user->id, $needed, true)) {
            throw ValidationException::withMessages(['rule' => "This rule doesn't need your yes."]);
        }
        $owner = $rule->user;
        if (!$yes) {
            $rule->update(['enabled' => false, 'agreement' => ['needed' => $needed, 'given' => array_values(array_diff($rule->agreement['given'] ?? [], [$user->id])), 'declined' => $user->id]]);
            NotificationService::make()->push($owner, 'automation_declined', "{$user->first_name} said no to {$rule->name}", "It's paused. Change it and ask again.", ['automation_rule_id' => $rule->id]);

            return $rule->fresh();
        }
        $given = array_values(array_unique([...($rule->agreement['given'] ?? []), $user->id]));
        $rule->update(['agreement' => ['needed' => $needed, 'given' => $given], 'enabled' => true]);
        if ($rule->fresh()->agreed()) {
            NotificationService::make()->push($owner, 'automation_agreed', "{$rule->name} is on", "{$user->first_name} agreed. It runs from now.", ['automation_rule_id' => $rule->id]);
        }

        return $rule->fresh();
    }

    /** AUT-08 "Runs". */
    public function runs(AutomationRule $rule, int $limit = 20): array
    {
        return AutomationRun::where('automation_rule_id', $rule->id)->latest('id')->limit($limit)->get()
            ->map(fn (AutomationRun $r) => [
                'id' => $r->id,
                'status' => $r->status,
                'label' => ['ran' => 'Ran', 'skipped' => 'Skipped', 'failed' => 'Failed'][$r->status] ?? ucfirst($r->status),
                'at' => $r->created_at?->toIso8601String(),
                'note' => $r->note,
                'amount' => $r->amount !== null ? number_format($r->amount / 100, 2, '.', '') : null,
            ])->all();
    }

    // ------------------------------------------------------------------ AUT-10

    /**
     * "Rules need your help": rules whose last run failed, and the rules that
     * all want money on salary day, in the order they run.
     */
    public function help(User $user): array
    {
        $rules = AutomationRule::with(['fromWallet', 'toWallet'])->where('user_id', $user->id)->where('enabled', true)->get();
        $failed = [];
        foreach ($rules as $rule) {
            $last = AutomationRun::where('automation_rule_id', $rule->id)->latest('id')->first();
            if ($last && $last->status === 'failed' && $last->created_at->gt(now()->subDays(14))) {
                $to = $rule->toWallet;
                $failed[] = [
                    'rule_id' => $rule->id,
                    'name' => $rule->name,
                    'title' => "{$rule->name} didn't run",
                    'body' => $last->note . ($rule->min_balance && in_array($rule->trigger, ['balance', 'event'], true) ? ". The rule needs over {$this->nice((int) $rule->min_balance)} in {$rule->fromWallet?->name}" : '') . ($to ? ". {$to->name} is at {$this->nice((int) $to->balance)}." : '.'),
                    'from_wallet_id' => $rule->from_wallet_id,
                    'to_wallet_id' => $rule->to_wallet_id,
                ];
            }
        }

        // Salary day: salary rules out of Main, plus monthly rules on that day.
        $main = $user->mainWallet();
        $salary = $main ? Transaction::where('wallet_id', $main->id)->where('type', 'fund')->where('direction', 'credit')
            ->where('amount', '>=', SavingsInsights::SALARY_FLOOR)->latest('id')->first() : null;
        $day = $salary ? (int) $salary->created_at->copy()->setTimezone('Africa/Lagos')->day : 25;
        $pay = $salary ? (int) $salary->amount : 0;
        $group = $rules->filter(fn (AutomationRule $r) => ($r->trigger === 'salary' && $r->from_wallet_id === $main?->id)
            || ($r->trigger === 'schedule' && $r->frequency === 'monthly' && (int) $r->day_of_month === $day && $r->from_wallet_id === $main?->id))
            ->sortBy(fn (AutomationRule $r) => [$r->priority, $r->id])->values();
        $rows = $group->map(function (AutomationRule $r) use ($pay, $day) {
            $amount = $r->trigger === 'salary' ? intdiv($pay * (int) $r->percent, 100) : (int) $r->amount;

            return [
                'rule_id' => $r->id,
                'name' => $r->name,
                'line' => $r->trigger === 'salary'
                    ? "{$r->percent}% of salary" . ($pay ? ' · ' . $this->nice($amount) : '') . " to {$r->toWallet?->name}"
                    : "{$this->nice($amount)} on the {$this->ordinal($day)} to {$r->toWallet?->name}",
                'amount' => $amount,
            ];
        });
        $total = $rows->sum('amount');

        return [
            'failed' => $failed,
            'salary_day' => $rows->count() >= 2 ? [
                'day' => $day,
                'line' => "{$rows->count()} rules want money on the {$this->ordinal($day)}" . ($total ? ", {$this->nice($total)} in total" : '') . '. If salary is short, the top ones run first.',
                'rules' => $rows->map(fn ($r) => array_diff_key($r, ['amount' => 1]))->all(),
            ] : null,
            'count' => count($failed) + ($rows->count() >= 2 ? 1 : 0),
        ];
    }

    /** "Save order". */
    public function order(User $user, array $ids): void
    {
        foreach (array_values($ids) as $i => $id) {
            AutomationRule::where('id', $id)->where('user_id', $user->id)->update(['priority' => $i + 1]);
        }
    }

    // ------------------------------------------------------------------ AUT-07

    /**
     * "Anytime Household money drop below 30k, abeg move 50k from my main
     * wallet. But only if main get up to 100k." → a draft. English and
     * Pidgin phrasing; amounts like 30k, ₦30,000, 1.5m.
     *
     * @return array{draft: array<string, mixed>|null, understood: list<string>, missing: list<string>}
     */
    public function parse(User $user, string $text): array
    {
        $t = mb_strtolower($text);
        $wallets = Wallet::where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('id', WalletMember::where('user_id', $user->id)->where('status', 'active')->pluck('wallet_id')))
            ->whereNotIn('status', ['closed'])->where('type', '!=', 'ajo')->get();
        $amounts = [];
        preg_match_all('/(?:₦|n|ngn)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|thousand|million)?\b/u', $t, $m, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($m as $hit) {
            $n = (float) str_replace(',', '', $hit[1][0]);
            $unit = $hit[2][0] ?? '';
            $n *= in_array($unit, ['k', 'thousand'], true) ? 1000 : (in_array($unit, ['m', 'million'], true) ? 1_000_000 : 1);
            if ($n >= 100) {
                $amounts[] = ['kobo' => (int) round($n * 100), 'at' => $hit[0][1]];
            }
        }
        $find = function (string $near) use ($wallets): ?Wallet {
            $best = null;
            foreach ($wallets as $w) {
                $name = mb_strtolower($w->name);
                $short = trim(preg_replace('/\b(wallet|fund|\d{4})\b/', '', $name));
                if ($w->type === 'main' && preg_match('/\bmain\b/', $near)) {
                    return $w;
                }
                if (($short !== '' && str_contains($near, $short)) || str_contains($near, $name)) {
                    $best ??= $w;
                }
            }

            return $best;
        };
        $before = fn (int $pos) => mb_substr($t, max(0, $pos - 60), 60);
        $after = fn (int $pos, int $len = 50) => mb_substr($t, $pos, $len);

        $understood = [];
        $draft = ['action' => 'move', 'max_per' => 'week'];

        // WHEN: "below / under / drop below / falls below X"
        if (preg_match('/(below|under|less than|drop|falls?|low)/u', $t, $lm, PREG_OFFSET_CAPTURE) && $amounts) {
            $th = collect($amounts)->first(fn ($a) => $a['at'] > $lm[0][1]) ?? $amounts[0];
            $draft['trigger'] = 'balance';
            $draft['threshold'] = $th['kobo'];
            $watch = $find($before($lm[0][1])) ?? $find($t);
            $draft['watch_wallet_id'] = $watch?->id;
            $draft['to_wallet_id'] = $watch?->id;
            $understood[] = 'when';
            $amounts = array_values(array_filter($amounts, fn ($a) => $a !== $th));
        } elseif (preg_match('/salary|paid|pay day|payday/u', $t)) {
            $draft['trigger'] = 'salary';
            if (preg_match('/(\d{1,2})\s?%/', $t, $pm)) {
                $draft['percent'] = (int) $pm[1];
            }
            $draft['from_wallet_id'] = $user->mainWallet()?->id;
            $understood[] = 'when';
        } elseif (preg_match('/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/u', $t, $dm)) {
            $draft['trigger'] = 'schedule';
            $draft['frequency'] = 'weekly';
            $draft['day_of_week'] = array_search(ucfirst($dm[1]), self::DAYS, true) ?: 1;
            $understood[] = 'when';
        } elseif (preg_match('/(?:every month|monthly).*?(\d{1,2})(?:st|nd|rd|th)|(\d{1,2})(?:st|nd|rd|th)\s+of\s+(?:every|each)\s+month/u', $t, $mm)) {
            $draft['trigger'] = 'schedule';
            $draft['frequency'] = 'monthly';
            $draft['day_of_month'] = min(28, (int) ($mm[1] ?: $mm[2]));
            $understood[] = 'when';
        }

        // IF: "only if main get up to / has more than / over X"
        if (preg_match('/only if|if .{0,20}(get up to|has|have|reach|over|more than|above)/u', $t, $im, PREG_OFFSET_CAPTURE)) {
            $cond = collect($amounts)->first(fn ($a) => $a['at'] > $im[0][1]);
            if ($cond) {
                $draft['min_balance'] = $cond['kobo'];
                $amounts = array_values(array_filter($amounts, fn ($a) => $a !== $cond));
                $understood[] = 'if';
            }
        }
        if (preg_match('/before the (\d{1,2})/u', $t, $bm)) {
            $draft['before_day'] = (int) $bm[1];
            $understood[] = 'if';
        }

        // THEN: "move / send / put / top up X from Y"
        if (preg_match('/\b(tell|remind|notify|alert)\b/u', $t) && !preg_match('/\b(move|send|put|top|transfer|carry)\b/u', $t)) {
            $draft['action'] = 'notify';
            $understood[] = 'then';
        } elseif (preg_match('/\b(move|send|put|top|transfer|carry|add)\b/u', $t, $vm, PREG_OFFSET_CAPTURE)) {
            $amt = collect($amounts)->first(fn ($a) => $a['at'] > $vm[0][1]) ?? ($amounts[0] ?? null);
            if ($amt) {
                $draft['amount'] = $amt['kobo'];
            }
            if (preg_match('/from (?:my )?([a-z\' ]{3,40})/u', $t, $fm)) {
                $draft['from_wallet_id'] = $find($fm[1])?->id ?? ($draft['from_wallet_id'] ?? null);
            }
            if (preg_match('/\binto\b|\bto\b ([a-z\' ]{3,40})/u', $after($vm[0][1], 80), $tm) && !empty($tm[1])) {
                $draft['to_wallet_id'] = $find($tm[1])?->id ?? ($draft['to_wallet_id'] ?? null);
            }
            $draft['from_wallet_id'] ??= $user->mainWallet()?->id;
            $understood[] = 'then';
        }
        if (preg_match('/tell (\w+)/u', $t, $tellm) && $tellm[1] !== 'me') {
            $who = User::whereRaw('LOWER(first_name) = ?', [$tellm[1]])->pluck('id')->all();
            $draft['notify_user_ids'] = $who;
        }

        $missing = array_values(array_diff(['when', 'then'], $understood));
        if ($missing) {
            return ['draft' => null, 'understood' => array_values(array_unique($understood)), 'missing' => $missing];
        }
        try {
            $this->normalise($user, $draft);
        } catch (ValidationException $e) {
            return ['draft' => null, 'understood' => array_values(array_unique($understood)), 'missing' => [collect($e->errors())->flatten()->first()]];
        }

        return ['draft' => $draft, 'understood' => array_values(array_unique($understood)), 'missing' => []];
    }
}
