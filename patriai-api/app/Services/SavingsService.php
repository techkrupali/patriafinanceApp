<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\SavingsMilestone;
use App\Models\SavingsPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Savings Goals wallets (client sheet "Savings Wallets", 2026-10-18): a target
 * amount and date, optional milestones, contributors invited with their own
 * permissions, and ONE savings plan (amount + frequency) that applies to every
 * saver. Each saver's auto-save is an AutomationRule from a wallet they own into
 * the savings wallet; money only ever moves through AutomationService →
 * WalletService. Amounts are kobo.
 */
class SavingsService
{
    public const TYPES = ['savings', 'goal'];

    public const MAX_MILESTONES = 10;

    public const MAX_CONTRIBUTORS = 10;

    /** Default access for an invited saver: see it, add to it, ask — never withdraw. */
    public const DEFAULT_PERMISSIONS = ['view' => true, 'fund' => true, 'request' => true, 'withdraw' => false];

    /** Average periods per month, for projections. */
    private const PER_MONTH = ['daily' => 30.44, 'weekly' => 4.345, 'monthly' => 1.0];

    public function __construct(
        private readonly AutomationService $automations,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(AutomationService::make(), NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /** Fill schedule defaults and keep the day fields consistent with the frequency. */
    public function normaliseTerms(array $terms, ?SavingsPlan $fallback = null): array
    {
        $frequency = $terms['frequency'] ?? $fallback?->frequency ?? 'monthly';

        return [
            'amount' => (int) ($terms['amount'] ?? $fallback?->amount ?? 0),
            'frequency' => $frequency,
            'day_of_week' => $frequency === 'weekly'
                ? (int) ($terms['day_of_week'] ?? $fallback?->day_of_week ?? now()->isoWeekday())
                : null,
            'day_of_month' => $frequency === 'monthly'
                ? (int) ($terms['day_of_month'] ?? $fallback?->day_of_month ?? min(now()->day, 28))
                : null,
        ];
    }

    // ------------------------------------------------------------------ setup

    /**
     * Milestones, the savings plan (+ the owner's own auto-save from $source) and
     * contributor invitations for a freshly created savings wallet. Runs inside the
     * caller's transaction, so any rejection rolls the wallet back too.
     */
    public function configure(Wallet $wallet, User $owner, array $data, ?Wallet $source): void
    {
        $this->addMilestones($wallet, $data['milestones'] ?? [], 1);

        if (!empty($data['savings_plan'])) {
            $plan = $data['savings_plan'];
            $terms = $this->normaliseTerms($plan);
            // SAV-02: a fixed amount on a schedule, a share of salary, round-ups — or by hand.
            $schedule = (bool) ($plan['schedule'] ?? true);
            $salary = !empty($plan['salary_percent']) ? (int) $plan['salary_percent'] : null;
            $roundup = !empty($plan['roundup_to']) ? (int) $plan['roundup_to'] : null;
            $autoSave = (bool) ($plan['auto_save'] ?? true);
            if ($schedule && $terms['amount'] <= 0) {
                throw ValidationException::withMessages(['savings_plan.amount' => 'Enter how much each person saves.']);
            }
            if ($autoSave && !$schedule && !$salary && !$roundup) {
                throw ValidationException::withMessages(['savings_plan' => 'Choose how money comes in.']);
            }

            $row = SavingsPlan::create($terms + [
                'wallet_id' => $wallet->id,
                'schedule' => $schedule,
                'salary_percent' => $salary,
                'roundup_to' => $roundup,
                'auto_save' => $autoSave,
                'allow_contributor_edit' => (bool) ($plan['allow_contributor_edit'] ?? false),
                'missed_policy' => $plan['missed_policy'] ?? 'skip',
                'notify_others_on_miss' => (bool) ($plan['notify_others_on_miss'] ?? false),
                'notify_sms' => (bool) ($plan['notify_sms'] ?? false),
            ]);
            $wallet->unsetRelation('savingsPlan');

            if ($autoSave) {
                if (!$source) {
                    throw ValidationException::withMessages(['source_wallet_id' => 'Choose the wallet your savings come from.']);
                }
                $this->createSaverRules($owner, $source, $wallet, $row);
            }
        }

        $contributors = array_values($data['contributors'] ?? []);
        if (count($contributors) > self::MAX_CONTRIBUTORS) {
            throw ValidationException::withMessages(['contributors' => 'You can invite up to ' . self::MAX_CONTRIBUTORS . ' people.']);
        }
        $seen = [];
        foreach ($contributors as $i => $c) {
            $user = isset($c['user_id']) ? User::find((int) $c['user_id']) : null;
            if (!$user || $user->status !== 'active') {
                throw ValidationException::withMessages(["contributors.{$i}.user_id" => 'Choose a Patriai user to invite.']);
            }
            if ($user->id === $owner->id) {
                throw ValidationException::withMessages(["contributors.{$i}.user_id" => "You're already saving in this wallet."]);
            }
            if (isset($seen[$user->id])) {
                throw ValidationException::withMessages(["contributors.{$i}.user_id" => "{$user->fullName()} is already on the list."]);
            }
            $seen[$user->id] = true;
            $this->invite($wallet, $owner, $user, $c['permissions'] ?? [], (bool) ($c['can_approve'] ?? false));
        }
    }

    /** Tell every invited saver about the plan, except invites told another way. Call after commit. */
    public function notifyInvited(Wallet $wallet, User $owner, array $exceptInvitationIds = []): void
    {
        $plan = $wallet->savingsPlan;
        $pace = $plan ? ' — ' . $this->methodsLabel($plan->salary_percent, $plan->roundup_to, $plan->schedule ? $plan : null) : '';

        $wallet->invitations()->where('status', 'pending')->whereNotIn('id', $exceptInvitationIds)->with('invitee')->get()->each(function (WalletInvitation $inv) use ($wallet, $owner, $pace) {
            if (!$inv->invitee) {
                return;
            }
            $this->notifications->push(
                $inv->invitee,
                'invitation_received',
                "Save together: {$wallet->name}",
                "{$owner->fullName()} invited you to save toward {$wallet->name}{$pace}.",
                ['invitation_id' => $inv->id, 'wallet_id' => $wallet->id, 'wallet_name' => $wallet->name, 'role' => $inv->role],
            );
        });
    }

    private function invite(Wallet $wallet, User $owner, User $invitee, array $permissions, bool $canApprove): WalletInvitation
    {
        return WalletInvitation::create([
            'wallet_id' => $wallet->id,
            'inviter_id' => $owner->id,
            'invitee_user_id' => $invitee->id,
            'invitee_identifier' => $invitee->username ? '@' . $invitee->username : ($invitee->email ?? (string) $invitee->id),
            'role' => 'contributor',
            'can_approve' => $canApprove,
            'permissions' => self::normalisePermissions($permissions),
            'status' => 'pending',
            'token' => Str::random(40),
            'expires_at' => now()->addDays(7),
        ]);
    }

    /** view/fund/request/withdraw with defaults; can_spend mirrors withdraw (see WalletMemberController). */
    public static function normalisePermissions(array $permissions): array
    {
        $out = [];
        foreach (self::DEFAULT_PERMISSIONS as $key => $default) {
            $out[$key] = array_key_exists($key, $permissions) ? (bool) $permissions[$key] : $default;
        }
        $out['can_spend'] = $out['withdraw'];
        // SPD-05 spenders: which budget categories (ids; absent = all) and a daily limit (kobo).
        if (array_key_exists('categories', $permissions)) {
            $out['categories'] = $permissions['categories'] === null ? null : array_values(array_map('intval', (array) $permissions['categories']));
        }
        if (array_key_exists('daily_limit', $permissions)) {
            $out['daily_limit'] = $permissions['daily_limit'] !== null ? (int) $permissions['daily_limit'] : null;
        }

        return $out;
    }

    // ------------------------------------------------------------- milestones

    private function addMilestones(Wallet $wallet, array $milestones, int $startPosition): void
    {
        if (count($milestones) + $startPosition - 1 > self::MAX_MILESTONES) {
            throw ValidationException::withMessages(['milestones' => 'You can add up to ' . self::MAX_MILESTONES . ' milestones.']);
        }
        foreach (array_values($milestones) as $i => $m) {
            if ((int) ($m['amount'] ?? 0) <= 0) {
                throw ValidationException::withMessages(["milestones.{$i}.amount" => 'Each milestone needs an amount.']);
            }
            if ($wallet->target_amount && (int) $m['amount'] > $wallet->target_amount) {
                throw ValidationException::withMessages(["milestones.{$i}.amount" => 'A milestone can\'t be more than the target amount.']);
            }
            SavingsMilestone::create([
                'wallet_id' => $wallet->id,
                'title' => trim((string) $m['title']),
                'amount' => (int) $m['amount'],
                'due_date' => $m['due_date'] ?? null,
                'position' => $startPosition + $i,
            ]);
        }
    }

    public function addMilestone(Wallet $wallet, User $owner, array $milestone): void
    {
        $this->requireOwner($wallet, $owner);
        $next = (int) $wallet->savingsMilestones()->max('position') + 1;
        $this->addMilestones($wallet, [$milestone], $next);
    }

    public function removeMilestone(Wallet $wallet, User $owner, SavingsMilestone $milestone): void
    {
        $this->requireOwner($wallet, $owner);
        if ($milestone->wallet_id !== $wallet->id) {
            throw ValidationException::withMessages(['milestone' => 'Milestone not found.']);
        }
        $milestone->delete();
    }

    // --------------------------------------------------------------- savers

    private function requireOwner(Wallet $wallet, User $user): void
    {
        if ($wallet->user_id !== $user->id) {
            throw ValidationException::withMessages(['wallet' => 'Only the wallet owner can change the savings plan.']);
        }
    }

    /** A saver's rules into this wallet: scheduled, salary share and round-ups. */
    private function contributionRulesOf(Wallet $wallet, User $user): Collection
    {
        return AutomationRule::where('user_id', $user->id)
            ->where('to_wallet_id', $wallet->id)
            ->where('savings_contribution', true)
            ->get();
    }

    /**
     * Start a saver's own auto-save into the wallet (on joining, or later). The
     * plan's amount and schedule apply unless the owner lets contributors pick.
     */
    public function startContribution(Wallet $wallet, User $user, int $sourceWalletId, array $overrides = []): Collection
    {
        $plan = $wallet->savingsPlan;
        if (!$plan) {
            throw ValidationException::withMessages(['wallet' => 'This wallet has no savings plan yet.']);
        }
        if ($this->contributionRulesOf($wallet, $user)->isNotEmpty()) {
            throw ValidationException::withMessages(['wallet' => "You're already auto-saving into {$wallet->name} — edit it instead."]);
        }
        $source = Wallet::where('id', $sourceWalletId)->where('user_id', $user->id)->first();
        if (!$source) {
            throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your own wallets to save from.']);
        }

        return $this->createSaverRules($user, $source, $wallet, $plan, $overrides);
    }

    /**
     * One rule per way the plan saves: the scheduled amount from $from, a share of
     * each salary and round-ups on spending — both from the saver's Main, where
     * salary lands and spending happens. The saver's own amount and schedule apply
     * only when the owner lets contributors choose.
     */
    public function createSaverRules(User $user, Wallet $from, Wallet $savings, SavingsPlan $plan, array $overrides = []): Collection
    {
        $rules = collect();
        $mayChoose = $plan->allow_contributor_edit || $savings->user_id === $user->id;
        $main = $from->type === 'main' ? $from : $user->mainWallet();

        if ($plan->schedule && $plan->amount > 0) {
            $terms = $this->normaliseTerms($mayChoose ? $overrides : [], $plan);
            $rules->push($this->automations->createContributionRule($user, $from, $savings, $terms + ['enabled' => $plan->auto_save]));
        }
        if ($plan->salary_percent && $main) {
            $rules->push($this->automations->createSalaryRule($user, $main, $savings, $plan->salary_percent, $plan->auto_save));
        }
        if ($plan->roundup_to && $main) {
            $rules->push($this->automations->createRoundUpRule($user, $main, $savings, $plan->roundup_to, $plan->auto_save));
        }

        return $rules;
    }

    /** A saver changes their own auto-save: source and pause always; amount/schedule if allowed. */
    public function updateMyContribution(Wallet $wallet, User $user, array $data): AutomationRule
    {
        $rules = $this->contributionRulesOf($wallet, $user);
        if ($rules->isEmpty()) {
            throw ValidationException::withMessages(['wallet' => "You aren't auto-saving into {$wallet->name} yet."]);
        }
        if (array_intersect(array_keys($data), ['amount', 'frequency', 'day_of_week', 'day_of_month']) && !$rules->firstWhere('trigger', 'schedule')) {
            throw ValidationException::withMessages(['amount' => 'This plan saves from salary or round-ups, not a set amount.']);
        }

        foreach ($rules as $rule) {
            $update = [];
            // Salary and round-ups always come from Main; the source applies to the scheduled save.
            if (array_key_exists('source_wallet_id', $data) && $rule->trigger === 'schedule') {
                $update['from_wallet_id'] = $data['source_wallet_id'];
            }
            if (array_key_exists('enabled', $data)) {
                $update['enabled'] = (bool) $data['enabled'];
            }
            if ($rule->trigger === 'schedule' && array_intersect(array_keys($data), ['amount', 'frequency', 'day_of_week', 'day_of_month'])) {
                $update += $this->normaliseTerms($data + $rule->only(['amount', 'frequency', 'day_of_week', 'day_of_month']));
            }
            // AutomationService enforces "own wallet only" and the owner's edit setting.
            if ($update) {
                $this->automations->updateRule($rule, $user, $update);
            }
        }

        return ($rules->firstWhere('trigger', 'schedule') ?? $rules->first())->refresh();
    }

    /**
     * The owner changes the plan. A new amount/schedule applies to every saver who
     * hadn't set their own; auto-save on/off pauses or resumes everyone. Creates the
     * plan when the wallet doesn't have one yet.
     */
    public function updatePlan(Wallet $wallet, User $owner, array $data): SavingsPlan
    {
        $this->requireOwner($wallet, $owner);

        return DB::transaction(function () use ($wallet, $data) {
            $plan = $wallet->savingsPlan;

            if (array_key_exists('target_date', $data) || array_key_exists('target_amount', $data)) {
                $wallet->update(array_intersect_key($data, array_flip(['target_date', 'target_amount'])));
            }

            if (!$plan) {
                $terms = $this->normaliseTerms($data);
                if ($terms['amount'] <= 0) {
                    throw ValidationException::withMessages(['amount' => 'Enter how much each person saves.']);
                }

                return SavingsPlan::create($terms + [
                    'wallet_id' => $wallet->id,
                    'auto_save' => (bool) ($data['auto_save'] ?? true),
                    'allow_contributor_edit' => (bool) ($data['allow_contributor_edit'] ?? false),
                ]);
            }

            $old = $plan->only(['amount', 'frequency', 'day_of_week', 'day_of_month']);
            $new = array_intersect(array_keys($data), ['amount', 'frequency', 'day_of_week', 'day_of_month'])
                ? $this->normaliseTerms($data, $plan)
                : $old;

            $plan->update($new + array_intersect_key($data, array_flip(['auto_save', 'allow_contributor_edit', 'missed_policy', 'notify_others_on_miss', 'notify_sms', 'salary_percent'])));

            foreach ($this->contributionRules($wallet) as $rule) {
                $change = [];
                if ($rule->trigger === 'schedule' && $rule->amount === $old['amount']) {
                    $change['amount'] = $new['amount'];
                }
                if ($rule->trigger === 'schedule' && $rule->frequency === $old['frequency'] && $rule->day_of_week == $old['day_of_week'] && $rule->day_of_month == $old['day_of_month']) {
                    $change += array_intersect_key($new, array_flip(['frequency', 'day_of_week', 'day_of_month']));
                }
                if ($rule->trigger === 'salary' && !empty($data['salary_percent'])) {
                    $change += ['percent' => (int) $data['salary_percent'], 'name' => "Save {$data['salary_percent']}% from every salary"];
                }
                if (array_key_exists('auto_save', $data)) {
                    $change['enabled'] = (bool) $data['auto_save'];
                }
                if ($change) {
                    $rule->update($change);
                }
            }

            return $plan->refresh();
        });
    }

    private function contributionRules(Wallet $wallet): Collection
    {
        return AutomationRule::where('to_wallet_id', $wallet->id)->where('savings_contribution', true)->get();
    }

    // ----------------------------------------------------------- serialization

    private function frequencyLabel(SavingsPlan|AutomationRule $terms): string
    {
        $days = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

        return match ($terms->frequency) {
            'weekly' => 'every ' . ($days[$terms->day_of_week] ?? 'week'),
            'monthly' => 'monthly on day ' . $terms->day_of_month,
            default => 'every day',
        };
    }

    private function terms(SavingsPlan|AutomationRule $t): array
    {
        return [
            'amount' => $this->naira($t->amount),
            'frequency' => $t->frequency,
            'day_of_week' => $t->day_of_week,
            'day_of_month' => $t->day_of_month,
            'label' => '₦' . $this->naira($t->amount) . ' ' . $this->frequencyLabel($t),
        ];
    }

    /** "15% of each salary + round-ups to ₦100 + ₦20,000 every Friday", or "When you add money". */
    private function methodsLabel(?int $salaryPercent, ?int $roundupTo, SavingsPlan|AutomationRule|null $scheduled): string
    {
        $parts = array_filter([
            $salaryPercent ? "{$salaryPercent}% of each salary" : null,
            $roundupTo ? 'round-ups to ₦' . number_format($roundupTo / 100) : null,
            $scheduled && $scheduled->amount > 0 ? '₦' . $this->naira($scheduled->amount) . ' ' . $this->frequencyLabel($scheduled) : null,
        ]);

        return $parts ? implode(' + ', $parts) : 'When you add money';
    }

    /** The plan everyone saves by (SAV-02/03/06). */
    private function planTerms(SavingsPlan $plan): array
    {
        return array_merge($this->terms($plan), [
            'label' => $this->methodsLabel($plan->salary_percent, $plan->roundup_to, $plan->schedule ? $plan : null),
            'schedule' => (bool) $plan->schedule,
            'salary_percent' => $plan->salary_percent,
            'roundup_to' => $plan->roundup_to ? $this->naira($plan->roundup_to) : null,
            'missed_policy' => $plan->missed_policy,
            'notify_others_on_miss' => (bool) $plan->notify_others_on_miss,
            'notify_sms' => (bool) $plan->notify_sms,
            'auto_save' => $plan->auto_save,
            'allow_contributor_edit' => $plan->allow_contributor_edit,
        ]);
    }

    /** One saver's auto-save across their rules; the source wallet only for themselves. */
    private function saverTerms(Collection $rules, bool $withSource): ?array
    {
        if ($rules->isEmpty()) {
            return null;
        }
        $scheduled = $rules->firstWhere('trigger', 'schedule');
        $salary = $rules->firstWhere('trigger', 'salary');
        $roundup = $rules->firstWhere('trigger', 'roundup');
        $source = ($scheduled ?? $rules->first())->fromWallet;

        return array_merge($scheduled ? $this->terms($scheduled) : ['amount' => '0.00', 'frequency' => null, 'day_of_week' => null, 'day_of_month' => null], [
            'label' => $this->methodsLabel($salary?->percent, $roundup?->roundup_to, $scheduled),
            'enabled' => $rules->contains(fn ($r) => $r->enabled),
            'source_wallet' => $withSource && $source ? ['id' => $source->id, 'name' => $source->name] : null,
        ]);
    }

    /** What a rule adds in a typical month (kobo): the schedule, or estimates for salary and round-ups. */
    private function monthlyEstimate(AutomationRule $rule): float
    {
        return match ($rule->trigger) {
            'salary' => (float) (SavingsInsights::make()->salaryShare($rule->user, (int) $rule->percent) ?? 0),
            'roundup' => (float) (SavingsInsights::make()->forUser($rule->user)['roundups'][(int) $rule->roundup_to] ?? 0),
            default => $rule->amount * (self::PER_MONTH[$rule->frequency] ?? 1),
        };
    }

    private function person(User $user): array
    {
        return ['id' => $user->id, 'name' => $user->fullName(), 'username' => $user->username, 'avatar_url' => $user->avatar_url];
    }

    /** Plan, progress, milestones, every saver and what the viewer may change. */
    public function detail(Wallet $wallet, User $viewer): array
    {
        $plan = $wallet->savingsPlan;
        $balance = (int) $wallet->balance;
        $target = $wallet->target_amount;
        $isOwner = $wallet->user_id === $viewer->id;
        $all = $this->contributionRules($wallet);
        $rules = $all->groupBy('user_id');

        $saved = Transaction::where('wallet_id', $wallet->id)
            ->where('direction', 'credit')
            ->where('status', 'successful')
            ->whereNotNull('user_id')
            ->groupBy('user_id')
            ->selectRaw('user_id, sum(amount) as total')
            ->pluck('total', 'user_id');

        $saverRow = function (User $user, string $status) use ($rules, $saved, $viewer) {
            return [
                'user' => $this->person($user),
                'status' => $status, // owner | member | invited
                // Which wallet pays is only the saver's business.
                'auto_save' => $this->saverTerms($rules->get($user->id, collect()), $user->id === $viewer->id),
                'total_saved' => $this->naira((int) ($saved[$user->id] ?? 0)),
            ];
        };

        $savers = collect([$saverRow($wallet->owner, 'owner')]);
        $members = $wallet->members()->with('user')->where('status', 'active')->where('user_id', '!=', $wallet->user_id)->get();
        foreach ($members as $m) {
            if ($m->user && $wallet->canFund($m->user)) {
                $savers->push($saverRow($m->user, 'member'));
            }
        }
        foreach ($wallet->invitations()->where('status', 'pending')->with('invitee')->get() as $inv) {
            if ($inv->invitee) {
                $savers->push($saverRow($inv->invitee, 'invited') + ['invitation_id' => $inv->id]);
            }
        }

        // Pace: what the enabled auto-saves add per month, and where that lands.
        $perMonth = $all->filter->enabled->sum(fn (AutomationRule $r) => $this->monthlyEstimate($r));
        $remaining = $target ? max(0, $target - $balance) : null;
        $projected = null;
        if ($remaining && $perMonth > 0) {
            $projected = now()->addDays((int) ceil($remaining / $perMonth * 30.44));
        }
        $targetDate = $wallet->target_date ? Carbon::parse($wallet->target_date)->endOfDay() : null;
        $suggested = null;
        if ($plan && $remaining && $targetDate && $targetDate->isFuture()) {
            $periods = max(1, (int) floor(now()->diffInDays($targetDate) / (30.44 / (self::PER_MONTH[$plan->frequency] ?? 1))));
            $saversCount = max(1, $all->filter->enabled->unique('user_id')->count());
            $suggested = (int) ceil($remaining / $periods / $saversCount);
        }

        $myRules = $rules->get($viewer->id, collect());
        $isSaver = $isOwner || $wallet->canFund($viewer);

        return [
            'wallet_id' => $wallet->id,
            'balance' => $this->naira($balance),
            'target_amount' => $target !== null ? $this->naira($target) : null,
            'target_date' => $wallet->target_date?->toDateString(),
            'progress' => $target ? min(100, round($balance / $target * 100, 1)) : null,
            'days_left' => $targetDate && $targetDate->isFuture() ? (int) now()->diffInDays($targetDate) : ($targetDate ? 0 : null),
            'plan' => $plan ? $this->planTerms($plan) : null,
            'projection' => [
                'per_month' => $this->naira((int) round($perMonth)),
                'projected_date' => $projected?->toDateString(),
                'on_track' => $projected && $targetDate ? $projected->lte($targetDate) : null,
                // Per-person amount (plan frequency) that would hit the target on time.
                'suggested_amount' => $suggested !== null ? $this->naira($suggested) : null,
                'reached' => $target ? $balance >= $target : false,
            ],
            'milestones' => $wallet->savingsMilestones->map(fn (SavingsMilestone $m) => [
                'id' => $m->id,
                'title' => $m->title,
                'amount' => $this->naira($m->amount),
                'due_date' => $m->due_date?->toDateString(),
                'reached' => $balance >= $m->amount,
                'overdue' => $balance < $m->amount && $m->due_date && $m->due_date->endOfDay()->isPast(),
            ])->values(),
            'savers' => $savers->values(),
            'me' => [
                'is_owner' => $isOwner,
                'is_saver' => $isSaver,
                'can_edit_plan' => $isOwner,
                'can_edit_own_terms' => $isOwner || (bool) $plan?->allow_contributor_edit,
                'auto_save' => $this->saverTerms($myRules, true),
                'can_start_auto_save' => $plan !== null && $isSaver && $myRules->isEmpty(),
            ],
        ];
    }

    /** Savings terms shown on an invitation so the invitee knows what they're joining. */
    public function invitationSummary(Wallet $wallet): ?array
    {
        $plan = $wallet->savingsPlan;
        if (!in_array($wallet->type, self::TYPES, true) || !$plan) {
            return null;
        }

        return $this->planTerms($plan) + [
            'target_amount' => $wallet->target_amount !== null ? $this->naira($wallet->target_amount) : null,
            'target_date' => $wallet->target_date?->toDateString(),
        ];
    }

    /** Apply an accepted invitation's chosen permissions to the new membership. */
    public static function applyInvitationPermissions(WalletMember $member, WalletInvitation $invitation): void
    {
        if (!$invitation->permissions) {
            return;
        }
        $permissions = array_merge($member->permissions ?? [], self::normalisePermissions($invitation->permissions));
        // Only admin/contributor may ever hold a spend grant (mirrors WalletMemberController).
        if (!in_array($member->role, ['admin', 'contributor'], true)) {
            $permissions['can_spend'] = false;
            $permissions['withdraw'] = false;
        }
        $member->update(['permissions' => $permissions]);
    }
}
