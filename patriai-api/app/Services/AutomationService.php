<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\SavingsPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Smart Rules & Automation engine (V1: scheduled auto-transfer between a user's
 * OWN wallets — recurring allowance / auto-fund a goal). NO external payouts.
 *
 * All money movement is delegated to WalletService::transferBetweenWallets (the
 * only row-locked money-mover); this service never touches wallet balances
 * directly. Idempotency is enforced in runRule(): the rule row is re-loaded FOR
 * UPDATE and its last_run_period is re-checked against the current period key
 * under that lock, so a rule can move money at most once per period even if two
 * runners (cron + a manual "run now", or two overlapping cron ticks) race.
 */
class AutomationService
{
    /** SAV-06: "Try again in 3 days … up to 3 times", "keeps ₦5,000 in Main". */
    private const RETRY_DAYS = 3;

    private const MAX_RETRIES = 3;

    private const KEEP_IN_SOURCE = 500_000;

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
        return number_format($kobo / 100, 2, '.', '');
    }

    /** Both wallets must belong to $user; amount must be positive kobo. */
    public function createRule(User $user, array $data): AutomationRule
    {
        $from = Wallet::where('id', $data['from_wallet_id'])->where('user_id', $user->id)->first();
        $to = Wallet::where('id', $data['to_wallet_id'])->where('user_id', $user->id)->first();

        if (!$from || !$to) {
            throw ValidationException::withMessages(['wallet' => 'Both wallets must belong to you.']);
        }
        if ($from->id === $to->id) {
            throw ValidationException::withMessages(['to_wallet_id' => 'Source and destination wallets must differ.']);
        }
        if ((int) $data['amount'] <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => $data['name'],
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'amount' => (int) $data['amount'],
            'frequency' => $data['frequency'],
            'day_of_week' => $data['day_of_week'] ?? null,
            'interval_weeks' => $data['interval_weeks'] ?? 1,
            'day_of_month' => $data['day_of_month'] ?? null,
            'at_hour' => $data['at_hour'] ?? null,
            'starts_on' => $data['starts_on'] ?? null,
            'budget_category_id' => $data['budget_category_id'] ?? null,
            'min_balance' => $data['min_balance'] ?? null,
            'enabled' => $data['enabled'] ?? true,
        ]);
    }

    /**
     * A savings contribution: money moves from the saver's OWN wallet into a savings
     * wallet they may fund (their own, or one they're a member of). The only kind of
     * rule allowed to pay into a wallet the rule owner doesn't own; runRule re-checks
     * the fund permission every time it fires.
     */
    public function createContributionRule(User $user, Wallet $from, Wallet $savings, array $terms): AutomationRule
    {
        $this->guardContribution($user, $from, $savings);
        if ((int) $terms['amount'] <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => $terms['name'] ?? "Saving for {$savings->name}",
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $savings->id,
            'savings_contribution' => true,
            'amount' => (int) $terms['amount'],
            'frequency' => $terms['frequency'],
            'day_of_week' => $terms['frequency'] === 'weekly' ? $terms['day_of_week'] : null,
            'day_of_month' => $terms['frequency'] === 'monthly' ? $terms['day_of_month'] : null,
            'enabled' => $terms['enabled'] ?? true,
        ]);
    }

    /** SAV-02 "A share of every salary": $percent of each salary-sized deposit into $from. */
    public function createSalaryRule(User $user, Wallet $from, Wallet $savings, int $percent, bool $enabled = true): AutomationRule
    {
        $this->guardContribution($user, $from, $savings);
        if ($percent < 1 || $percent > 50) {
            throw ValidationException::withMessages(['salary_percent' => 'Choose between 1% and 50% of each salary.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => "Save {$percent}% from every salary",
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $savings->id,
            'savings_contribution' => true,
            'trigger' => 'salary',
            'percent' => $percent,
            'amount' => 0,
            // At most once a calendar month; no day — it fires when salary lands.
            'frequency' => 'monthly',
            'enabled' => $enabled,
        ]);
    }

    /**
     * Client: "percentage of deposits from 1 or more wallets" — $percent of every
     * bank deposit into $from, whichever of the user's wallets it is.
     */
    public function createDepositRule(User $user, Wallet $from, Wallet $to, int $percent, bool $enabled = true): AutomationRule
    {
        $this->guardContribution($user, $from, $to);
        if ($percent < 1 || $percent > 50) {
            throw ValidationException::withMessages(['percent' => 'Choose between 1% and 50% of each deposit.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => "{$percent}% of every deposit into {$from->name}",
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'savings_contribution' => $to->user_id !== $user->id,
            'trigger' => 'deposit',
            'percent' => $percent,
            'amount' => 0,
            'frequency' => 'daily',
            'enabled' => $enabled,
        ]);
    }

    /**
     * SPD-04 "Top up from my Main wallet — on the 25th, fill it back to ₦350,000":
     * moves only what brings $to back up to $level (kobo).
     */
    public function createTopUpRule(User $user, Wallet $from, Wallet $to, int $level, string $frequency, ?int $day): AutomationRule
    {
        $this->guardContribution($user, $from, $to);
        if ($level <= 0) {
            throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => "Keep {$to->name} topped up",
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'amount' => $level,
            'fill_to' => true,
            'frequency' => $frequency,
            'day_of_week' => $frequency === 'weekly' ? $day : null,
            'day_of_month' => $frequency === 'monthly' ? $day : null,
            'enabled' => true,
        ]);
    }

    /** SAV-02 "Round-ups": spending from $from rounded up to $step, swept daily. */
    public function createRoundUpRule(User $user, Wallet $from, Wallet $savings, int $step, bool $enabled = true): AutomationRule
    {
        $this->guardContribution($user, $from, $savings);
        if ($from->type !== 'main') {
            throw ValidationException::withMessages(['source_wallet_id' => 'Round-ups come from spending in your Main wallet.']);
        }
        if (!in_array($step, SavingsPlan::ROUNDUP_STEPS, true)) {
            throw ValidationException::withMessages(['roundup_to' => 'Round up to ₦100, ₦500 or ₦1,000.']);
        }

        return AutomationRule::create([
            'user_id' => $user->id,
            'name' => 'Round-ups to ₦' . number_format($step / 100),
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $savings->id,
            'savings_contribution' => true,
            'trigger' => 'roundup',
            'roundup_to' => $step,
            'amount' => 0,
            'frequency' => 'daily',
            'enabled' => $enabled,
        ]);
    }

    /** A saver pays from their own wallet into one they may fund. */
    private function guardContribution(User $user, Wallet $from, Wallet $savings): void
    {
        if ($from->user_id !== $user->id) {
            throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your own wallets to save from.']);
        }
        if ($from->id === $savings->id) {
            throw ValidationException::withMessages(['source_wallet_id' => 'Choose a different wallet to save from.']);
        }
        if (!$savings->canFund($user)) {
            throw ValidationException::withMessages(['wallet' => "You can't add money to {$savings->name}."]);
        }
    }

    /** Owner-only edit. Re-validates wallet ownership on any wallet change. */
    public function updateRule(AutomationRule $rule, User $user, array $data): AutomationRule
    {
        if ($rule->user_id !== $user->id) {
            throw ValidationException::withMessages(['rule' => 'You do not own this automation.']);
        }

        // A savings contribution keeps its destination, and its amount/schedule is the
        // savings wallet owner's call unless they let contributors edit. Pausing (or
        // deleting) debits from your own wallet is always allowed.
        if ($rule->savings_contribution) {
            if (array_key_exists('to_wallet_id', $data) && (int) $data['to_wallet_id'] !== $rule->to_wallet_id) {
                throw ValidationException::withMessages(['to_wallet_id' => 'A savings contribution always pays into its savings wallet.']);
            }
            $savings = Wallet::find($rule->to_wallet_id);
            $plan = $savings?->savingsPlan;
            // Compare values, not keys: the automations endpoint always sends the day
            // fields (often unchanged nulls), even when only pausing.
            $changesTerms = collect(['amount', 'frequency', 'day_of_week', 'day_of_month'])
                ->contains(fn ($key) => array_key_exists($key, $data) && $data[$key] != $rule->{$key});
            if ($changesTerms && $plan && !$plan->allow_contributor_edit && $savings->user_id !== $user->id) {
                throw ValidationException::withMessages(['rule' => "The owner of {$savings->name} sets the savings amount and frequency."]);
            }
            unset($data['to_wallet_id']);
        }

        $update = [];

        if (array_key_exists('name', $data)) {
            $update['name'] = $data['name'];
        }
        if (array_key_exists('from_wallet_id', $data)) {
            $from = Wallet::where('id', $data['from_wallet_id'])->where('user_id', $user->id)->first();
            if (!$from) {
                throw ValidationException::withMessages(['from_wallet_id' => 'Wallet must belong to you.']);
            }
            $update['from_wallet_id'] = $from->id;
        }
        if (array_key_exists('to_wallet_id', $data)) {
            $to = Wallet::where('id', $data['to_wallet_id'])->where('user_id', $user->id)->first();
            if (!$to) {
                throw ValidationException::withMessages(['to_wallet_id' => 'Wallet must belong to you.']);
            }
            $update['to_wallet_id'] = $to->id;
        }

        $resultingFrom = $update['from_wallet_id'] ?? $rule->from_wallet_id;
        $resultingTo = $update['to_wallet_id'] ?? $rule->to_wallet_id;
        if ((int) $resultingFrom === (int) $resultingTo) {
            throw ValidationException::withMessages(['to_wallet_id' => 'Source and destination wallets must differ.']);
        }

        if (array_key_exists('amount', $data)) {
            if ((int) $data['amount'] <= 0) {
                throw ValidationException::withMessages(['amount' => 'Amount must be greater than zero.']);
            }
            $update['amount'] = (int) $data['amount'];
        }
        if (array_key_exists('frequency', $data)) {
            $update['frequency'] = $data['frequency'];
        }
        if (array_key_exists('day_of_week', $data)) {
            $update['day_of_week'] = $data['day_of_week'];
        }
        if (array_key_exists('day_of_month', $data)) {
            $update['day_of_month'] = $data['day_of_month'];
        }
        if (array_key_exists('min_balance', $data)) {
            $update['min_balance'] = $data['min_balance'];
        }
        if (array_key_exists('enabled', $data)) {
            $update['enabled'] = (bool) $data['enabled'];
        }

        if ($update) {
            $rule->update($update);
        }

        return $rule->refresh();
    }

    /** Owner-only delete. */
    public function deleteRule(AutomationRule $rule, User $user): void
    {
        if ($rule->user_id !== $user->id) {
            throw ValidationException::withMessages(['rule' => 'You do not own this automation.']);
        }

        $rule->delete();
    }

    /**
     * Execute ONE rule idempotently. The rule row is re-loaded FOR UPDATE inside a
     * DB transaction; its last_run_period is re-checked against the current period
     * key under that lock BEFORE any money moves, then stamped under the SAME lock
     * after the transfer. This makes a per-period double-run impossible: a second
     * runner blocks on the lock, then sees last_run_period === current period and
     * skips. Returns a small result array (never throws for business skips).
     *
     * @param  bool  $force  manual "run now": bypasses the schedule-match check
     *                       (day-of-week/day-of-month) but NEVER the period guard.
     */
    public function runRule(AutomationRule $rule, ?Carbon $now = null, bool $force = false): array
    {
        $now = $now ?? now();

        return DB::transaction(function () use ($rule, $now, $force) {
            /** @var AutomationRule|null $locked */
            $locked = AutomationRule::whereKey($rule->id)->lockForUpdate()->first();
            if (!$locked) {
                return ['rule_id' => $rule->id, 'status' => 'skipped', 'reason' => 'Rule no longer exists'];
            }

            $period = $locked->currentPeriod($now);
            // A missed save trying again: its period was already stamped when it missed.
            $retrying = $locked->isRetryDue($now);

            // Primary idempotency guard: already ran for this period.
            if ($locked->last_run_period === $period && !$retrying) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Already ran this period', 'period' => $period];
            }

            // A disabled rule never runs, even via a manual force.
            if (!$locked->enabled) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Rule disabled', 'period' => $period];
            }

            // Salary and deposit rules only run when money lands (runIncome, runDeposits).
            if (in_array($locked->trigger, ['salary', 'deposit'], true)) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Runs when money lands', 'period' => $period];
            }

            // Scheduled runs must match the calendar; a manual force skips only this.
            if (!$force && !$locked->isDue($now)) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Not due', 'period' => $period];
            }

            $from = Wallet::find($locked->from_wallet_id);
            $to = Wallet::find($locked->to_wallet_id);
            $owner = $locked->user;

            if (!$from || !$to || !$owner) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Wallet or owner missing', 'period' => $period];
            }

            // Round-ups move whatever spending has built up since the last sweep; a
            // top-up only what brings the wallet back to its level.
            $amount = match (true) {
                $locked->trigger === 'roundup' => (int) $locked->pending_amount,
                $locked->fill_to => max(0, (int) $locked->amount - (int) $to->fresh()->balance),
                default => (int) $locked->amount,
            };

            // Defense-in-depth money guards (in addition to the create-time validation):
            // never move a non-positive amount, and re-confirm BOTH wallets still belong
            // to the rule's owner at execution time, so no post-creation change can move
            // money across users or reverse the flow.
            if ($amount <= 0) {
                if ($locked->trigger === 'roundup' || $locked->fill_to) {
                    $locked->update(['last_run_period' => $period]);
                }

                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => $locked->fill_to ? 'Already topped up' : 'Non-positive amount', 'period' => $period];
            }
            // A savings contribution may pay into someone else's savings wallet, but only
            // while the saver can still fund it (still a member with the fund permission).
            $savingsOk = $locked->savings_contribution && $to->canFund($owner);
            if ($from->user_id !== $owner->id || ($to->user_id !== $owner->id && !$savingsOk)) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Wallets not both owned by the rule owner', 'period' => $period];
            }
            // CHW-02 "Pause during school holidays — restarts when term begins".
            if ($locked->trigger === 'schedule' && ChildService::make()->paused($locked, $from, $to, $now)) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'School holidays', 'period' => $period];
            }
            // A locked emergency wallet can still be FUNDED by a rule, never drained by one.
            if ($from->isEmergencyLocked()) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Source emergency wallet is locked', 'period' => $period];
            }

            $available = $from->availableToSpend();
            $plan = $locked->savings_contribution ? $to->savingsPlan : null;

            // Must not overdraw funds already committed to approvals/milestones.
            if ($available < $amount) {
                // Round-ups wait for tomorrow's sweep; a savings plan says what a miss does.
                if ($plan && $locked->trigger === 'schedule') {
                    return $this->missed($locked, $plan, $from, $to, $owner, $amount, $available, $period, $now);
                }
                // Someone's share into a shared wallet (SPD-04 "Split between us").
                if ($locked->savings_contribution && $locked->trigger === 'schedule') {
                    return $this->shareMissed($locked, $from, $to, $owner, $amount, $period, $now);
                }

                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Insufficient available balance', 'period' => $period];
            }

            // min_balance floor: the from-wallet must still hold >= min_balance
            // (and never go negative) after the move.
            if ($locked->min_balance !== null && ($available - $amount) < (int) $locked->min_balance) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Would breach minimum balance', 'period' => $period];
            }

            // The ONLY money-mover — row-locked and overdraft-guarded internally.
            $result = $this->wallets->transferBetweenWallets($from, $to, $amount, $owner, 'Automation: ' . $locked->name);
            // Paid out of a spending budget (CHW-02 "Household · School runs and lunch").
            if ($locked->budget_category_id) {
                BudgetService::make()->recorded($from, $result['reference'], $locked->budget_category_id);
            }
            // "Tell Kamsi when it lands".
            if ($to->type === 'child' && $from->type !== 'child') {
                ChildService::make()->landed($to, $amount);
            }

            // Stamp under the same rule lock so a racing runner sees it as done.
            $locked->update([
                'last_run_period' => $retrying ? $locked->last_run_period : $period,
                'last_run_at' => $now,
                'retry_count' => 0,
                'retry_at' => null,
                'pending_amount' => $locked->trigger === 'roundup' ? max(0, $locked->pending_amount - $amount) : $locked->pending_amount,
            ]);

            $this->notifications->push(
                $owner,
                'automation_run',
                'Automation ran: ' . $locked->name,
                '₦' . $this->naira($amount) . ' moved from ' . $from->name . ' to ' . $to->name . '.',
                [
                    'automation_rule_id' => $locked->id,
                    'reference' => $result['reference'],
                    'amount' => $this->naira($amount),
                    'period' => $period,
                ],
            );

            return [
                'rule_id' => $locked->id,
                'status' => 'ran',
                'reference' => $result['reference'],
                'amount' => $this->naira($amount),
                'period' => $period,
            ];
        });
    }

    /**
     * SAV-06 "If a save can't happen". retry: try again in 3 days, up to 3 times;
     * partial: move what's there, keeping ₦5,000 in the source; skip: wait for the
     * next one. The period is stamped either way, so the schedule doesn't keep
     * firing; a retry runs on its own clock (retry_at). Runs under the rule lock.
     */
    private function missed(AutomationRule $rule, SavingsPlan $plan, Wallet $from, Wallet $to, User $owner, int $amount, int $available, string $period, Carbon $now): array
    {
        $result = ['rule_id' => $rule->id, 'status' => 'missed', 'policy' => $plan->missed_policy, 'period' => $period];
        $stamp = ['last_run_period' => $rule->retry_at ? $rule->last_run_period : $period];

        if ($plan->missed_policy === 'partial') {
            $move = $available - self::KEEP_IN_SOURCE;
            if ($move >= 10_000) {
                $moved = $this->wallets->transferBetweenWallets($from, $to, $move, $owner, 'Automation: ' . $rule->name . ' (part)');
                $rule->update($stamp + ['last_run_at' => $now, 'retry_count' => 0, 'retry_at' => null]);
                $this->notifications->push($owner, 'savings_missed', "Saved ₦{$this->naira($move)} into {$to->name}", "{$from->name} didn't have the full ₦{$this->naira($amount)}, so we saved what was there and kept ₦" . number_format(self::KEEP_IN_SOURCE / 100) . " in {$from->name}.", ['wallet_id' => $to->id, 'reference' => $moved['reference']]);
                $this->sms($plan, $owner, "Patriai: {$from->name} was short, so we saved ₦{$this->naira($move)} of ₦{$this->naira($amount)} into {$to->name}.");
                $this->tellOthers($plan, $to, $owner, "{$owner->first_name} saved part of their ₦{$this->naira($amount)}");

                return ['status' => 'partial', 'amount' => $this->naira($move), 'reference' => $moved['reference']] + $result;
            }
        }

        if ($plan->missed_policy === 'retry' && $rule->retry_count < self::MAX_RETRIES) {
            $retryAt = $now->copy()->addDays(self::RETRY_DAYS);
            $rule->update($stamp + ['retry_count' => $rule->retry_count + 1, 'retry_at' => $retryAt]);
            $this->notifications->push($owner, 'savings_missed', "Couldn't save into {$to->name}", "{$from->name} was short of ₦{$this->naira($amount)}. We'll try again on {$retryAt->format('j M')}.", ['wallet_id' => $to->id]);
            $this->sms($plan, $owner, "Patriai: your ₦{$this->naira($amount)} save into {$to->name} didn't go — {$from->name} was short. We'll try again on {$retryAt->format('j M')}.");
            $this->tellOthers($plan, $to, $owner, "{$owner->first_name} missed a ₦{$this->naira($amount)} save — trying again on {$retryAt->format('j M')}");

            return ['retry_at' => $retryAt->toIso8601String()] + $result;
        }

        $rule->update($stamp + ['retry_count' => 0, 'retry_at' => null]);
        $this->notifications->push($owner, 'savings_missed', "Skipped a save into {$to->name}", "{$from->name} was short of ₦{$this->naira($amount)}. Your next save happens as planned.", ['wallet_id' => $to->id]);
        $this->sms($plan, $owner, "Patriai: we skipped your ₦{$this->naira($amount)} save into {$to->name} — {$from->name} was short. Your next save happens as planned.");
        $this->tellOthers($plan, $to, $owner, "{$owner->first_name} missed a ₦{$this->naira($amount)} save");

        return $result;
    }

    /**
     * SPD-04 "If someone's share doesn't arrive, we remind them and tell you after
     * 2 days": the payer hears now and again in 2 days; if it still can't go, the
     * wallet's owner is told. Runs under the rule lock.
     */
    private function shareMissed(AutomationRule $rule, Wallet $from, Wallet $to, User $payer, int $amount, string $period, Carbon $now): array
    {
        $result = ['rule_id' => $rule->id, 'status' => 'missed', 'period' => $period];

        // JNT-02 "If one of you is short: remind both, try again in 2 days" (or wait for next month).
        if ($joint = JointService::make()->settings($to)) {
            $retry = $joint['short'] === 'retry' && $rule->retry_at === null;
            $retryAt = $now->copy()->addDays(2);
            $rule->update(['last_run_period' => $rule->retry_at ? $rule->last_run_period : $period, 'retry_count' => $retry ? 1 : 0, 'retry_at' => $retry ? $retryAt : null]);
            $then = $retry ? "We'll try again on {$retryAt->format('j M')}." : 'It goes again next month.';
            $ids = $to->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id')->push($to->user_id)->unique();
            foreach (User::whereIn('id', $ids)->get() as $partner) {
                $title = $partner->id === $payer->id ? "Your share into {$to->name} didn't go" : "{$payer->first_name}'s share into {$to->name} didn't go";
                $this->notifications->push($partner, 'share_missed', $title, "{$from->name} is short of ₦{$this->naira($amount)}. {$then}", ['wallet_id' => $to->id]);
            }

            return ($retry ? ['retry_at' => $retryAt->toIso8601String()] : []) + $result;
        }

        if ($rule->retry_at === null) {
            $retryAt = $now->copy()->addDays(2);
            $rule->update(['last_run_period' => $period, 'retry_count' => 1, 'retry_at' => $retryAt]);
            $this->notifications->push($payer, 'share_missed', "Your share into {$to->name} didn't go", "{$from->name} is short of ₦{$this->naira($amount)}. Add money and we'll try again on {$retryAt->format('j M')}.", ['wallet_id' => $to->id]);

            return ['retry_at' => $retryAt->toIso8601String()] + $result;
        }

        $rule->update(['retry_count' => 0, 'retry_at' => null]);
        $this->notifications->push($payer, 'share_missed', "Your share into {$to->name} still didn't go", "{$from->name} was short of ₦{$this->naira($amount)} again. {$to->owner->first_name} has been told.", ['wallet_id' => $to->id]);
        if ($to->owner && $to->owner->id !== $payer->id) {
            $this->notifications->push($to->owner, 'share_missed', "{$payer->first_name}'s share hasn't arrived", "{$payer->fullName()}'s ₦{$this->naira($amount)} into {$to->name} didn't go through after 2 days.", ['wallet_id' => $to->id]);
        }

        return $result;
    }

    /** SAV-06 "Tell me — Push and SMS". */
    private function sms(SavingsPlan $plan, User $saver, string $text): void
    {
        if ($plan->notify_sms && $saver->phone) {
            SmsService::make()->send($saver->phone, $text);
        }
    }

    /** SAV-06 "Tell Emeka too": the wallet's owner and co-owners hear when a saver misses. */
    private function tellOthers(SavingsPlan $plan, Wallet $savings, User $saver, string $what): void
    {
        if (!$plan->notify_others_on_miss) {
            return;
        }
        $ids = $savings->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id')
            ->push($savings->user_id)->unique()->reject(fn ($id) => $id === $saver->id);
        foreach (User::whereIn('id', $ids)->get() as $user) {
            $this->notifications->push($user, 'savings_missed', "A save into {$savings->name} was missed", "{$what}.", ['wallet_id' => $savings->id]);
        }
    }

    /**
     * SAV-02 "A share of every salary": a salary-sized bank deposit landed in a
     * Main wallet — every salary rule saving from it moves its share, at most once
     * a month, never more than is there.
     */
    public function runIncome(Wallet $main, Transaction $credit): array
    {
        if ($main->type !== 'main' || $credit->direction !== 'credit' || $credit->type !== 'fund' || $credit->amount < SavingsInsights::SALARY_FLOOR) {
            return [];
        }

        $results = [];
        $rules = AutomationRule::where('from_wallet_id', $main->id)->where('trigger', 'salary')->where('enabled', true)->get();
        foreach ($rules as $rule) {
            try {
                $results[] = DB::transaction(function () use ($rule, $main, $credit) {
                    $locked = AutomationRule::whereKey($rule->id)->lockForUpdate()->first();
                    $period = $locked->currentPeriod(now());
                    if (!$locked->enabled || $locked->last_run_period === $period) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Already saved from a salary this month'];
                    }
                    $to = Wallet::find($locked->to_wallet_id);
                    $owner = $locked->user;
                    if (!$to || !$owner || $main->user_id !== $owner->id || !$to->canFund($owner)) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Wallet or owner missing'];
                    }

                    $amount = min(intdiv($credit->amount * (int) $locked->percent, 100), $main->fresh()->availableToSpend());
                    if ($amount <= 0) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Nothing available'];
                    }

                    $result = $this->wallets->transferBetweenWallets($main, $to, $amount, $owner, 'Automation: ' . $locked->name);
                    $locked->update(['last_run_period' => $period, 'last_run_at' => now()]);
                    $this->notifications->push(
                        $owner,
                        'automation_run',
                        "Saved ₦{$this->naira($amount)} into {$to->name}",
                        "{$locked->percent}% of the ₦{$this->naira($credit->amount)} that just landed in {$main->name}.",
                        ['automation_rule_id' => $locked->id, 'reference' => $result['reference'], 'amount' => $this->naira($amount)],
                    );

                    return ['rule_id' => $locked->id, 'status' => 'ran', 'amount' => $this->naira($amount), 'reference' => $result['reference']];
                });
            } catch (\Throwable $e) {
                Log::warning("Salary rule {$rule->id} failed: {$e->getMessage()}");
                $results[] = ['rule_id' => $rule->id, 'status' => 'error', 'reason' => $e->getMessage()];
            }
        }

        return $results;
    }

    /**
     * A bank deposit landed in $wallet: every "share of every deposit" rule on it
     * moves its share at once (client: "percentage of deposits from 1 or more
     * wallets"). Each deposit is taken from once — the rule remembers it.
     */
    public function runDeposits(Wallet $wallet, Transaction $credit): array
    {
        if ($credit->direction !== 'credit' || $credit->type !== 'fund') {
            return [];
        }

        $results = [];
        $rules = AutomationRule::where('from_wallet_id', $wallet->id)->where('trigger', 'deposit')->where('enabled', true)->get();
        foreach ($rules as $rule) {
            try {
                $results[] = DB::transaction(function () use ($rule, $wallet, $credit) {
                    $locked = AutomationRule::whereKey($rule->id)->lockForUpdate()->first();
                    $key = "txn:{$credit->id}";
                    if (!$locked->enabled || $locked->last_run_period === $key) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Already taken from this deposit'];
                    }
                    $to = Wallet::find($locked->to_wallet_id);
                    $owner = $locked->user;
                    if (!$to || !$owner || $wallet->user_id !== $owner->id || !$to->canFund($owner)) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Wallet or owner missing'];
                    }

                    $amount = min(intdiv($credit->amount * (int) $locked->percent, 100), $wallet->fresh()->availableToSpend());
                    if ($amount <= 0) {
                        return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Nothing available'];
                    }

                    $result = $this->wallets->transferBetweenWallets($wallet, $to, $amount, $owner, 'Automation: ' . $locked->name);
                    $locked->update(['last_run_period' => $key, 'last_run_at' => now()]);
                    $this->notifications->push(
                        $owner,
                        'automation_run',
                        "Set aside ₦{$this->naira($amount)} into {$to->name}",
                        "{$locked->percent}% of the ₦{$this->naira($credit->amount)} that just landed in {$wallet->name}.",
                        ['automation_rule_id' => $locked->id, 'reference' => $result['reference'], 'amount' => $this->naira($amount)],
                    );

                    return ['rule_id' => $locked->id, 'status' => 'ran', 'amount' => $this->naira($amount), 'reference' => $result['reference']];
                });
            } catch (\Throwable $e) {
                Log::warning("Deposit rule {$rule->id} failed: {$e->getMessage()}");
                $results[] = ['rule_id' => $rule->id, 'status' => 'error', 'reason' => $e->getMessage()];
            }
        }

        return $results;
    }

    /**
     * Run every enabled rule that is due at $now, collecting each result. One
     * failing rule NEVER aborts the loop (each runRule is wrapped in try/catch),
     * so a single bad rule can't stop the rest of the schedule.
     */
    public function runDue(?Carbon $now = null): array
    {
        $now = $now ?? now();
        $results = [];

        AutomationRule::where('enabled', true)->get()->each(function (AutomationRule $rule) use ($now, &$results) {
            if (!$rule->isDue($now)) {
                return;
            }

            try {
                $results[] = $this->runRule($rule, $now, false);
            } catch (\Throwable $e) {
                Log::warning("Automation rule {$rule->id} run failed: {$e->getMessage()}");
                $results[] = ['rule_id' => $rule->id, 'status' => 'error', 'reason' => $e->getMessage()];
            }
        });

        return $results;
    }
}
