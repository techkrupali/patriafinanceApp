<?php

namespace App\Services;

use App\Models\AutomationRule;
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
            'day_of_month' => $data['day_of_month'] ?? null,
            'min_balance' => $data['min_balance'] ?? null,
            'enabled' => $data['enabled'] ?? true,
        ]);
    }

    /** Owner-only edit. Re-validates wallet ownership on any wallet change. */
    public function updateRule(AutomationRule $rule, User $user, array $data): AutomationRule
    {
        if ($rule->user_id !== $user->id) {
            throw ValidationException::withMessages(['rule' => 'You do not own this automation.']);
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

            // Primary idempotency guard: already ran for this period.
            if ($locked->last_run_period === $period) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Already ran this period', 'period' => $period];
            }

            // A disabled rule never runs, even via a manual force.
            if (!$locked->enabled) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Rule disabled', 'period' => $period];
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

            // Defense-in-depth money guards (in addition to the create-time validation):
            // never move a non-positive amount, and re-confirm BOTH wallets still belong
            // to the rule's owner at execution time, so no post-creation change can move
            // money across users or reverse the flow.
            if ((int) $locked->amount <= 0) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Non-positive amount', 'period' => $period];
            }
            if ($from->user_id !== $owner->id || $to->user_id !== $owner->id) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Wallets not both owned by the rule owner', 'period' => $period];
            }

            $amount = (int) $locked->amount;
            $available = $from->availableToSpend();

            // Must not overdraw funds already committed to approvals/milestones.
            if ($available < $amount) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Insufficient available balance', 'period' => $period];
            }

            // min_balance floor: the from-wallet must still hold >= min_balance
            // (and never go negative) after the move.
            if ($locked->min_balance !== null && ($available - $amount) < (int) $locked->min_balance) {
                return ['rule_id' => $locked->id, 'status' => 'skipped', 'reason' => 'Would breach minimum balance', 'period' => $period];
            }

            // The ONLY money-mover — row-locked and overdraft-guarded internally.
            $result = $this->wallets->transferBetweenWallets($from, $to, $amount, $owner, 'Automation: ' . $locked->name);

            // Stamp under the same rule lock so a racing runner sees it as done.
            $locked->update([
                'last_run_period' => $period,
                'last_run_at' => $now,
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
