<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\SavedAccount;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Managing a wallet after it is set up (client prototype WAL-03…15): how it
 * shows its state (paused, restricted, locked, suspended, archived), who put in
 * what, approval rules that the other owners agree to, the lock and asking to
 * unlock, closing or archiving with what's left moved out, and statements.
 * Money only ever moves through WalletService / ApprovalService. Amounts are kobo.
 */
class WalletManageService
{
    /** Credits that count as someone putting money in (not refunds or reversals). */
    public const PUT_IN_TYPES = ['transfer_in', 'fund'];

    public const THRESHOLDS = [2_000_000, 5_000_000, 10_000_000];

    public const NOTIFY = ['everyone', 'owners', 'off'];

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make(), AuditService::make());
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    private function first(?User $user): string
    {
        return $user ? ($user->first_name ?: $user->fullName()) : 'Someone';
    }

    /** "Ngozi", "Ngozi and Emeka", "Ngozi, Emeka and Ada". */
    public static function names(iterable $names): string
    {
        $list = collect($names)->filter()->values();
        if ($list->count() <= 1) {
            return (string) $list->first();
        }

        return $list->slice(0, -1)->join(', ') . ' and ' . $list->last();
    }

    // ------------------------------------------------------------------ state

    /**
     * WAL-12: the one notice the wallet shows, most serious first. Null when
     * nothing is in the way.
     */
    public function state(Wallet $wallet, User $viewer): ?array
    {
        $meta = $wallet->meta ?? [];
        if ($wallet->isSuspended()) {
            return ['kind' => 'suspended', 'at' => $meta['suspended']['at'] ?? null];
        }
        if ($wallet->status === 'closed') {
            $closed = $meta['closed'] ?? [];

            return [
                'kind' => ($closed['mode'] ?? 'archive') === 'close' ? 'closed' : 'archived',
                'at' => $closed['at'] ?? $wallet->updated_at?->toIso8601String(),
                'by' => isset($closed['by']) ? $this->first(User::find($closed['by'])) : null,
            ];
        }
        if ($wallet->isPaused()) {
            $by = isset($meta['paused']['by']) ? User::find($meta['paused']['by']) : null;

            return ['kind' => 'paused', 'by' => $by ? $this->first($by) : null, 'me' => $by?->id === $viewer->id, 'at' => $meta['paused']['at'] ?? null];
        }
        if ($wallet->isGoalLocked() && ($lock = $wallet->savingsLock())) {
            $others = $wallet->eligibleApprovers($viewer->id);

            return [
                'kind' => 'locked',
                'mode' => $lock['mode'],
                'until' => $lock['until'],
                'opens_at' => $lock['mode'] === 'target' && $wallet->target_amount ? number_format($wallet->target_amount / 100, 2, '.', '') : null,
                'agree' => $lock['mode'] === 'agree' ? self::names($this->governanceNames($wallet)) : null,
                // WAL-11: anyone who may ask, while someone else can say yes.
                'can_ask' => $lock['early_break'] && $wallet->canRequest($viewer) && $others->isNotEmpty(),
            ];
        }
        // "Payments over ₦200,000 are on hold until Emeka finishes verification".
        if ($wallet->members()->where('status', 'active')->where('user_id', '!=', $wallet->user_id)->exists()) {
            $spender = User::whereIn('id', $wallet->governanceApprovers())->where('kyc_tier', '<', 1)->orderByRaw('id = ? desc', [$viewer->id])->first();
            if ($spender) {
                $limit = KycService::make()->limits((int) $spender->kyc_tier)['daily_transfer_limit'];

                return [
                    'kind' => 'restricted',
                    'who' => $this->first($spender),
                    'me' => $spender->id === $viewer->id,
                    'limit' => $limit !== null ? number_format($limit / 100, 2, '.', '') : null,
                ];
            }
        }

        return null;
    }

    /** First names of the owner and co-owners. */
    private function governanceNames(Wallet $wallet): array
    {
        return User::whereIn('id', $wallet->governanceApprovers())->get()->map(fn (User $u) => $this->first($u))->all();
    }

    // ------------------------------------------------------- who put in what

    /**
     * WAL-04 "WHO PUT IN WHAT": money each member paid in — their own transfers,
     * plus bank transfers sent in their name. Everything else is "others".
     *
     * @return array{by_user: array<int, int>, others: int, total: int}
     */
    public function contributions(Wallet $wallet, ?Carbon $from = null, ?Carbon $to = null): array
    {
        $members = $wallet->members()->with('user')->where('status', 'active')->get()->pluck('user')->filter();
        $byName = $members->mapWithKeys(fn (User $u) => [$u->id => $this->nameWords($u->fullName())]);

        $byUser = [];
        $others = 0;
        Transaction::where('wallet_id', $wallet->id)
            ->where('direction', 'credit')
            ->where('status', 'successful')
            ->whereIn('type', self::PUT_IN_TYPES)
            ->when($from, fn ($q) => $q->where('created_at', '>=', $from))
            ->when($to, fn ($q) => $q->where('created_at', '<=', $to))
            ->get(['user_id', 'type', 'amount', 'counterparty'])
            ->each(function (Transaction $t) use (&$byUser, &$others, $byName) {
                $id = $t->user_id;
                if (!$id && $t->type === 'fund') {
                    $sender = $this->nameWords((string) ($t->counterparty['source_name'] ?? ''));
                    $id = $byName->search(fn ($words) => $words && !array_diff($words, $sender)) ?: null;
                }
                if ($id && $byName->has($id)) {
                    $byUser[$id] = ($byUser[$id] ?? 0) + (int) $t->amount;
                } else {
                    $others += (int) $t->amount;
                }
            });

        return ['by_user' => $byUser, 'others' => $others, 'total' => array_sum($byUser) + $others];
    }

    /** "NGOZI OKAFOR" → ['NGOZI', 'OKAFOR'] (first and last name words). */
    private function nameWords(string $name): array
    {
        $words = array_values(array_filter(preg_split('/[^A-Z]+/', strtoupper($name)) ?: []));

        return $words ? array_values(array_unique([$words[0], end($words)])) : [];
    }

    /** May this member see amounts per person ("See who paid what")? */
    public function canSeeContributions(Wallet $wallet, User $user): bool
    {
        if (in_array($wallet->roleOf($user), Wallet::SPENDING_ROLES, true)) {
            return true;
        }
        $member = $wallet->members()->where('user_id', $user->id)->where('status', 'active')->first();

        return ($member?->permissions['see_contributions'] ?? true) !== false;
    }

    // ------------------------------------------------------------------ rules

    /** Fields that change who can spend how much: the other owners agree to them. */
    public const GOVERNANCE_FIELDS = ['approval_enabled', 'approval_threshold', 'required_approvals', 'approval_mode', 'approver_ids', 'lock_until_goal', 'approval_expiry_hours'];

    /** The current value of each rule field, comparable with a change. */
    private function currentRules(Wallet $wallet): array
    {
        return [
            'approval_enabled' => (bool) $wallet->approval_enabled,
            'approval_threshold' => $wallet->approval_threshold,
            'required_approvals' => (int) $wallet->required_approvals,
            'approval_mode' => $wallet->approvalMode(),
            'approver_ids' => $wallet->approvalMode() === 'named' ? $wallet->namedApprovers()->sort()->values()->all() : null,
            'lock_until_goal' => ($wallet->meta['lock_until_goal'] ?? false) === true,
            'approval_expiry_hours' => $wallet->approvalExpiryHours(),
            'target_amount' => $wallet->target_amount,
        ];
    }

    /** Only what actually differs from now. */
    public function diff(Wallet $wallet, array $changes): array
    {
        $now = $this->currentRules($wallet);
        if (isset($changes['approver_ids'])) {
            $changes['approver_ids'] = collect($changes['approver_ids'])->map(fn ($id) => (int) $id)->unique()->sort()->values()->all();
        }

        return array_filter($changes, fn ($value, $key) => !array_key_exists($key, $now) || $now[$key] !== $value, ARRAY_FILTER_USE_BOTH);
    }

    /**
     * WAL-08 "Ask Emeka to approve the change": with other owners, a change waits
     * for all their yeses; alone, it applies now.
     *
     * @return array{applied: bool, request: ?ApprovalRequest}
     */
    public function proposeRules(Wallet $wallet, User $actor, array $changes): array
    {
        $changes = $this->diff($wallet, $changes);
        if (!$changes) {
            return ['applied' => true, 'request' => null];
        }
        $others = $wallet->governanceApprovers($actor->id);
        if ($others->isEmpty()) {
            $this->applyRules($wallet, $actor, $changes, collect());

            return ['applied' => true, 'request' => null];
        }

        [$summary, $detail] = $this->describeRules($wallet, $changes);
        $request = ApprovalService::make()->createGoverned($wallet, $actor, 'rule_change', 0, 0, ucfirst($this->infinitive($summary)) . ($detail ? ": {$detail}" : ''), ['changes' => $changes], $others);
        $this->audit->log($wallet, $actor, 'rule_change_proposed', "Asked to {$this->infinitive($summary)}", ['summary' => 'asked to ' . $this->infinitive($summary), 'detail' => $detail, 'approval_request_id' => $request->id]);

        return ['applied' => false, 'request' => $request];
    }

    private function infinitive(string $summary): string
    {
        return preg_replace('/^changed /', 'change ', $summary);
    }

    /** Apply agreed changes, and log "Emeka changed the approval limit — From ₦20,000 to ₦50,000 · Ngozi approved". */
    public function applyRules(Wallet $wallet, ?User $initiator, array $changes, Collection $approvers): void
    {
        $changes = $this->diff($wallet->fresh(), $changes);
        if (!$changes) {
            return;
        }
        [$summary, $detail] = $this->describeRules($wallet, $changes);

        $update = [];
        $meta = $wallet->meta ?? [];
        foreach ($changes as $key => $value) {
            match ($key) {
                'approval_enabled', 'approval_threshold', 'required_approvals', 'target_amount' => $update[$key] = $value,
                'approval_mode' => $meta['approval_mode'] = $value,
                'approver_ids' => $meta['approver_ids'] = $value,
                'lock_until_goal' => $meta['lock_until_goal'] = $value ?: null,
                'approval_expiry_hours' => $meta['approval_expiry_hours'] = (int) $value,
                default => null,
            };
        }
        // A fixed count replaces the "who decides" rule; only "Named people" keeps names.
        if (array_key_exists('required_approvals', $changes) && !array_key_exists('approval_mode', $changes)) {
            $meta['approval_mode'] = null;
        }
        if (($meta['approval_mode'] ?? null) !== 'named') {
            unset($meta['approver_ids']);
        }
        $update['meta'] = array_filter($meta, fn ($v) => $v !== null) ?: null;
        $wallet->update($update);

        $approvedBy = $approvers->map(fn (User $u) => $this->first($u))->all();
        $this->audit->log($wallet, $initiator, 'rules_changed', ucfirst($summary), [
            'summary' => $summary,
            'detail' => trim($detail . ($approvedBy ? ' · ' . self::names($approvedBy) . ' approved' : ''), ' ·'),
            'changes' => $changes,
            'approved_by' => $approvers->pluck('id')->all(),
        ]);
    }

    /** ['changed the approval limit', 'From ₦20,000 to ₦50,000']. */
    public function describeRules(Wallet $wallet, array $changes): array
    {
        $now = $this->currentRules($wallet);
        $limit = fn (?int $k) => $k === null ? 'any amount' : $this->naira($k);
        $mode = fn (?string $m, ?array $ids) => match ($m) {
            'any' => 'any one approver',
            'all' => 'everyone',
            'majority' => 'most approvers',
            'named' => self::names(User::whereIn('id', $ids ?? [])->get()->map(fn ($u) => $this->first($u))) ?: 'named people',
            default => 'a fixed number of yeses',
        };
        $parts = [];
        if (array_key_exists('approval_enabled', $changes)) {
            $parts[] = ['changed approvals', $changes['approval_enabled'] ? 'Payments now need approval' : 'Approvals turned off'];
        }
        if (array_key_exists('approval_threshold', $changes)) {
            $parts[] = ['changed the approval limit', 'From ' . $limit($now['approval_threshold']) . ' to ' . $limit($changes['approval_threshold'])];
        }
        if (array_key_exists('approval_mode', $changes) || array_key_exists('approver_ids', $changes)) {
            $newMode = array_key_exists('approval_mode', $changes) ? $changes['approval_mode'] : $now['approval_mode'];
            $parts[] = ['changed who decides', 'From ' . $mode($now['approval_mode'], $now['approver_ids']) . ' to ' . $mode($newMode, $changes['approver_ids'] ?? $now['approver_ids'])];
        }
        if (array_key_exists('required_approvals', $changes)) {
            $parts[] = ['changed the yeses needed', "{$now['required_approvals']} to {$changes['required_approvals']}"];
        }
        if (array_key_exists('approval_expiry_hours', $changes)) {
            $parts[] = ['changed when requests expire', "From {$now['approval_expiry_hours']} to {$changes['approval_expiry_hours']} hours"];
        }
        if (array_key_exists('lock_until_goal', $changes)) {
            $parts[] = ['changed the goal lock', $changes['lock_until_goal'] ? 'Locked until the goal is reached' : 'No longer locked until the goal'];
        }
        if (array_key_exists('target_amount', $changes)) {
            $parts[] = ['changed the goal', 'From ' . $limit($now['target_amount']) . ' to ' . $limit($changes['target_amount'])];
        }

        if (count($parts) === 1) {
            return $parts[0];
        }

        return ['changed the approval rules', implode(' · ', array_column($parts, 1))];
    }

    // ------------------------------------------------------------------- lock

    /** WAL-10 "Lock this wallet": money comes in, nothing goes out until it opens. */
    public function setLock(Wallet $wallet, User $actor, string $mode, ?string $until, bool $payPayee): void
    {
        if (in_array($wallet->type, ['main', 'joint', 'emergency', 'project'], true)) {
            throw ValidationException::withMessages(['lock' => match ($wallet->type) {
                'main' => 'Your main wallet cannot be locked.',
                'joint' => 'Joint wallets change their rules together.',
                'emergency' => 'Emergency wallets lock with their release rules.',
                default => 'Project wallets pay out by milestone.',
            }]);
        }
        if ($wallet->isGoalLocked()) {
            throw ValidationException::withMessages(['lock' => 'This wallet is already locked. Ask to unlock it first.']);
        }
        $others = $wallet->eligibleApprovers($actor->id);
        if ($mode === 'date') {
            if (!$until || Carbon::parse($until)->startOfDay()->lte(now()->startOfDay())) {
                throw ValidationException::withMessages(['until' => 'Pick a day after today.']);
            }
        } elseif ($mode === 'target') {
            if (!($wallet->target_amount > 0)) {
                throw ValidationException::withMessages(['mode' => 'Set a goal amount first.']);
            }
            if ($wallet->balance >= $wallet->target_amount) {
                throw ValidationException::withMessages(['mode' => 'The goal is already reached.']);
            }
            $until = null;
        } else {
            if ($wallet->governanceApprovers($actor->id)->isEmpty()) {
                throw ValidationException::withMessages(['mode' => 'Add a co-owner first. Then you unlock it together.']);
            }
            $until = null;
        }

        $old = (array) ($wallet->meta['lock'] ?? []);
        $meta = $wallet->meta ?? [];
        unset($meta['lock_until_goal']);
        $meta['lock'] = [
            'mode' => $mode,
            'until' => $until ? Carbon::parse($until)->toDateString() : null,
            // With others in the wallet, money leaves early only with everyone's yes;
            // alone, nothing leaves before it opens.
            'early_break' => $others->isNotEmpty(),
            'approval' => true,
            'fee_percent' => (int) ($old['fee_percent'] ?? 0),
            'charity_id' => $old['charity_id'] ?? null,
            'pay_payee' => $payPayee,
            'set_by' => $actor->id,
            'set_at' => now()->toIso8601String(),
        ];
        $wallet->update(['meta' => $meta]);

        $detail = match ($mode) {
            'date' => 'Until ' . Carbon::parse($until)->format('j M Y'),
            'target' => 'Until ' . $this->naira((int) $wallet->target_amount) . ' is in',
            default => 'Until ' . self::names($this->governanceNames($wallet)) . ' agree',
        };
        $this->audit->log($wallet, $actor, 'lock_set', "Set a lock. {$detail}", ['summary' => 'set a lock', 'detail' => $detail, 'mode' => $mode, 'until' => $until, 'pay_payee' => $payPayee]);
        foreach ($this->othersIn($wallet, $actor) as $user) {
            $this->notifications->push($user, 'wallet_locked', "{$wallet->name} is locked", "{$this->first($actor)} locked it. {$detail}. Money can still come in.", ['wallet_id' => $wallet->id]);
        }
    }

    /** WAL-10 "Until we both agree": the others say yes; alone, an expired lock just goes. */
    public function askToRemoveLock(Wallet $wallet, User $actor): ?ApprovalRequest
    {
        if (!$wallet->savingsLock()) {
            throw ValidationException::withMessages(['lock' => 'This wallet is not locked.']);
        }
        $others = $wallet->governanceApprovers($actor->id);
        if (!$wallet->isGoalLocked() || $others->isEmpty()) {
            if ($wallet->isGoalLocked()) {
                throw ValidationException::withMessages(['lock' => 'It opens on its own date or at the goal. Nobody else holds it to agree early.']);
            }
            $this->removeLock($wallet, $actor, collect());

            return null;
        }

        return ApprovalService::make()->createGoverned($wallet, $actor, 'unlock_wallet', 0, 0, "Unlock {$wallet->name}", [], $others);
    }

    public function removeLock(Wallet $wallet, ?User $initiator, Collection $approvers): void
    {
        $meta = $wallet->fresh()->meta ?? [];
        unset($meta['lock'], $meta['lock_until_goal']);
        $wallet->update(['meta' => $meta ?: null]);
        $by = $approvers->map(fn (User $u) => $this->first($u))->all();
        $this->audit->log($wallet, $initiator, 'lock_removed', 'Unlocked the wallet', ['summary' => 'unlocked the wallet', 'detail' => $by ? self::names($by) . ' approved' : null]);
    }

    /**
     * WAL-11 "Ask to unlock": take an amount out of a locked wallet, with proof,
     * to the goal's payee, your Main or a saved account. Everyone who approves
     * must say yes; the asker is the first yes.
     */
    public function requestMoney(Wallet $wallet, User $actor, int $amount, string $purpose, ?string $proofPath, array $payTo): ApprovalRequest
    {
        if (!$wallet->isGoalLocked()) {
            throw ValidationException::withMessages(['wallet' => "This wallet isn't locked. Pay from it as usual."]);
        }
        if (!$wallet->canRequest($actor)) {
            throw ValidationException::withMessages(['wallet' => 'Nothing leaves this wallet before it opens.']);
        }
        if ($wallet->isFrozen()) {
            throw ValidationException::withMessages(['wallet' => 'This wallet is paused.']);
        }
        if ($amount > $wallet->availableToSpend()) {
            throw ValidationException::withMessages(['amount' => 'That is more than the wallet has free.']);
        }

        $kind = $payTo['kind'] ?? 'payee';
        if ($kind === 'main') {
            $main = $actor->mainWallet();
            if (!$main || $main->id === $wallet->id) {
                throw ValidationException::withMessages(['pay_to' => 'You have no Main wallet to pay into.']);
            }
            $action = 'transfer_wallet';
            $payload = ['wallet_id' => $main->id, 'description' => $purpose, 'to_name' => "{$this->first($actor)}'s Main wallet"];
        } else {
            $account = $kind === 'payee'
                ? SavedAccount::find($wallet->meta['goal']['payout']['saved_account_id'] ?? 0)
                : SavedAccount::where('user_id', $actor->id)->find((int) ($payTo['saved_account_id'] ?? 0));
            if (!$account) {
                throw ValidationException::withMessages(['pay_to' => 'Choose who gets paid.']);
            }
            $action = 'transfer_bank';
            $payload = [
                'bank_code' => $account->bank_code,
                'account_number' => $account->account_number,
                'account_name' => $account->nickname ?: $account->account_name,
                'bank_name' => $account->bank_name,
                'description' => $purpose,
            ];
        }
        $fee = SpendRules::make()->earlyBreakFee($wallet, $amount);
        $request = ApprovalService::make()->createGoverned($wallet, $actor, $action, $amount, 0, $purpose, $payload + [
            'unlock' => true,
            'purpose' => $purpose,
            'proof_path' => $proofPath,
            'early_fee' => $fee,
        ], $wallet->eligibleApprovers($actor->id));

        $this->audit->log($wallet, $actor, 'unlock_requested', "Asked to take out {$this->naira($amount)}", ['summary' => 'asked to unlock ' . $this->naira($amount), 'detail' => $purpose, 'approval_request_id' => $request->id]);

        return $request;
    }

    // ------------------------------------------------------------------ close

    /** WAL-13: what's left, how it would split, and who must confirm. */
    public function closePreview(Wallet $wallet, User $viewer): array
    {
        $balance = (int) $wallet->balance;
        $payout = $wallet->meta['goal']['payout'] ?? null;
        $paidTo = !empty($payout['paid_at']) ? SavedAccount::find($payout['saved_account_id'] ?? 0)?->nickname : null;
        $each = collect($this->split($wallet, $balance))->map(fn ($kobo, $id) => ['user_id' => $id, 'name' => $this->first(User::find($id)), 'amount' => number_format($kobo / 100, 2, '.', '')])->values();

        return [
            'balance' => number_format($balance / 100, 2, '.', ''),
            'goal_reached' => $wallet->target_amount > 0 && ($paidTo || $balance >= $wallet->target_amount),
            'paid_to' => $paidTo,
            'each' => $each,
            'wallets' => Wallet::where('user_id', $viewer->id)->where('status', 'active')->where('id', '!=', $wallet->id)
                ->whereNotIn('type', ['main', 'project', 'joint'])->orderBy('name')->get(['id', 'name', 'type'])
                ->map(fn ($w) => ['id' => $w->id, 'name' => $w->name, 'type' => $w->type])->values(),
            'main' => ($main = $viewer->mainWallet()) ? ['id' => $main->id, 'name' => $main->name] : null,
            'needs' => User::whereIn('id', $wallet->governanceApprovers($viewer->id))->get()->map(fn ($u) => $this->first($u))->values(),
            'blocked' => $this->closeBlocker($wallet),
        ];
    }

    private function closeBlocker(Wallet $wallet): ?string
    {
        return match (true) {
            $wallet->type === 'main' => 'Your main wallet stays open.',
            $wallet->type === 'project' => 'A project wallet closes when its project is finished.',
            $wallet->type === 'joint' => 'A joint wallet closes from its rules, with 30 days\' notice.',
            $wallet->isSuspended() => 'Patriai stopped this wallet. Talk to support.',
            $wallet->isPaused() => 'Resume the wallet first.',
            $wallet->status === 'closed' => 'This wallet is already closed.',
            // Alone, a lock is a promise to yourself: it opens on its date or at the goal.
            $wallet->balance > 0 && $wallet->isGoalLocked() && $wallet->governanceApprovers()->count() <= 1 => 'It is locked. It opens on its date or at the goal.',
            default => null,
        };
    }

    /**
     * "Back to each person": what's left, in proportion to what each put in;
     * money nobody in the wallet put in, and rounding, goes to the owner.
     *
     * @return array<int, int> user id => kobo
     */
    public function split(Wallet $wallet, int $amount): array
    {
        $in = $this->contributions($wallet);
        $shares = [];
        if ($amount <= 0) {
            return $shares;
        }
        if ($in['total'] > 0) {
            foreach ($in['by_user'] as $id => $kobo) {
                // Whole naira each ("Ngozi ₦8,800 · Emeka ₦8,200"); the kobo left go to the owner.
                $part = intdiv(intdiv($amount * $kobo, $in['total']), 100) * 100;
                if ($part > 0) {
                    $shares[$id] = $part;
                }
            }
        }
        $rest = $amount - array_sum($shares);
        if ($rest > 0) {
            $shares[$wallet->user_id] = ($shares[$wallet->user_id] ?? 0) + $rest;
        }
        arsort($shares);

        return $shares;
    }

    /**
     * WAL-13 "Ask Emeka to confirm": with other owners it waits for their yes;
     * alone it happens now.
     *
     * @return array{done: bool, request: ?ApprovalRequest}
     */
    public function requestClose(Wallet $wallet, User $actor, array $payload): array
    {
        if ($blocker = $this->closeBlocker($wallet)) {
            throw ValidationException::withMessages(['wallet' => $blocker]);
        }
        $this->destination($wallet, $actor, $payload); // validate now, not after the yes
        $others = $wallet->governanceApprovers($actor->id);
        if ($others->isEmpty()) {
            $this->close($wallet, $actor, $payload, collect());

            return ['done' => true, 'request' => null];
        }
        $left = $this->naira((int) $wallet->balance);
        $where = match ($payload['move_to'] ?? 'main') {
            'each' => 'back to each person',
            'main' => "to {$this->first($actor)}'s Main wallet",
            default => 'to ' . (Wallet::find($payload['wallet_id'] ?? 0)?->name ?? 'another wallet'),
        };
        $verb = ($payload['mode'] ?? 'archive') === 'close' ? 'Close' : 'Archive';
        $description = $wallet->balance > 0 ? "{$verb} {$wallet->name} and move {$left} {$where}" : "{$verb} {$wallet->name}";

        return ['done' => false, 'request' => ApprovalService::make()->createGoverned($wallet, $actor, 'close_wallet', 0, 0, $description, $payload, $others)];
    }

    /** Where what's left goes: [user_id => [Wallet, kobo]]. */
    private function destination(Wallet $wallet, User $actor, array $payload): array
    {
        $balance = (int) $wallet->balance;
        if ($balance <= 0) {
            return [];
        }

        return match ($payload['move_to'] ?? null) {
            'each' => collect($this->split($wallet, $balance))->mapWithKeys(function ($kobo, $id) {
                $main = User::find($id)?->mainWallet();
                if (!$main) {
                    throw ValidationException::withMessages(['move_to' => 'Someone has no Main wallet to pay back into.']);
                }

                return [$id => [$main, $kobo]];
            })->all(),
            'main' => ($main = $actor->mainWallet()) && $main->id !== $wallet->id
                ? [$actor->id => [$main, $balance]]
                : throw ValidationException::withMessages(['move_to' => 'You have no Main wallet.']),
            'wallet' => ($to = Wallet::where('status', 'active')->find((int) ($payload['wallet_id'] ?? 0))) && $to->id !== $wallet->id && $to->canFund($actor)
                ? [$actor->id => [$to, $balance]]
                : throw ValidationException::withMessages(['wallet_id' => 'Choose one of your wallets.']),
            default => throw ValidationException::withMessages(['move_to' => "Choose where what's left goes."]),
        };
    }

    /** Move what's left, stop its rules and requests, and archive or close it. */
    public function close(Wallet $wallet, ?User $initiator, array $payload, Collection $approvers): void
    {
        $wallet = $wallet->fresh();
        $actor = $initiator ?? $wallet->owner;
        if ($blocker = $this->closeBlocker($wallet)) {
            throw ValidationException::withMessages(['wallet' => $blocker]);
        }
        // Waiting payments would otherwise pay out of a closed wallet.
        $wallet->approvalRequests()->where('status', 'pending')->update(['status' => 'cancelled']);

        $moved = [];
        DB::transaction(function () use ($wallet, $actor, $payload, &$moved) {
            foreach ($this->destination($wallet->fresh(), $actor, $payload) as $userId => [$to, $kobo]) {
                $this->wallets->transferBetweenWallets($wallet, $to, $kobo, $actor, "{$wallet->name} closed — what was left");
                $moved[] = ['user_id' => $userId, 'wallet_id' => $to->id, 'wallet' => $to->name, 'amount' => $kobo];
            }
            AutomationRule::where(fn ($q) => $q->where('to_wallet_id', $wallet->id)->orWhere('from_wallet_id', $wallet->id))->update(['enabled' => false]);
            $mode = ($payload['mode'] ?? 'archive') === 'close' ? 'close' : 'archive';
            // Closed with everyone's yes: its lock has nothing left to hold.
            $meta = $wallet->fresh()->meta ?? [];
            unset($meta['lock'], $meta['lock_until_goal']);
            $wallet->update(['status' => 'closed', 'meta' => array_merge($meta, [
                'closed' => ['mode' => $mode, 'at' => now()->toIso8601String(), 'by' => $actor->id, 'moved' => $moved, 'move_to' => $payload['move_to'] ?? null],
            ])]);
        });

        $mode = ($payload['mode'] ?? 'archive') === 'close' ? 'close' : 'archive';
        $by = $approvers->map(fn (User $u) => $this->first($u))->all();
        $detail = collect($moved)->map(fn ($m) => $this->first(User::find($m['user_id'])) . ' ' . $this->naira($m['amount']))->join(' · ');
        $this->audit->log($wallet, $actor, $mode === 'close' ? 'wallet_closed' : 'wallet_archived', $mode === 'close' ? 'Closed the wallet' : 'Archived the wallet', [
            'summary' => $mode === 'close' ? 'closed the wallet' : 'archived the wallet',
            'detail' => trim(($detail ? "Moved {$detail}" : 'Nothing was left') . ($by ? ' · ' . self::names($by) . ' approved' : '')),
            'moved' => $moved,
        ]);
        foreach ($this->othersIn($wallet, $actor) as $user) {
            $mine = collect($moved)->firstWhere('user_id', $user->id);
            $this->notifications->push($user, 'wallet_closed', "{$wallet->name} was " . ($mode === 'close' ? 'closed' : 'archived'), $mine ? "{$this->naira($mine['amount'])} is back in your {$mine['wallet']}." : 'Its history and statements stay available.', ['wallet_id' => $wallet->id]);
        }
    }

    /** @return Collection<int, User> active members other than $actor */
    private function othersIn(Wallet $wallet, User $actor): Collection
    {
        $ids = $wallet->members()->where('status', 'active')->pluck('user_id')->push($wallet->user_id)->unique()->reject(fn ($id) => $id === $actor->id);

        return User::whereIn('id', $ids)->get();
    }

    // ----------------------------------------------------------- notifications

    /**
     * WAL-06 "Notifications — Every payment, for all members": who hears about
     * money moving. Unset keeps the default (the owner hears about deposits).
     */
    public function notifyPayment(Wallet $wallet, Transaction $txn, ?User $actor): void
    {
        $mode = $wallet->meta['notify'] ?? null;
        if (!in_array($mode, ['everyone', 'owners'], true)) {
            return;
        }
        try {
            $ids = $mode === 'everyone'
                ? $wallet->members()->where('status', 'active')->pluck('user_id')->push($wallet->user_id)
                : $wallet->governanceApprovers();
            $ids = $ids->unique()->reject(fn ($id) => $actor && $id === $actor->id);
            $in = $txn->direction === 'credit';
            $who = $actor ? $this->first($actor) : ($txn->counterparty['source_name'] ?? null);
            foreach (User::whereIn('id', $ids)->get() as $user) {
                $this->notifications->push($user, $in ? 'money_received' : 'wallet_payment', ($in ? '+' : '−') . $this->naira((int) $txn->amount) . " · {$wallet->name}", $in ? (($who ? "{$who} added money" : 'Money came in') . '.') : (($who ? "{$who} paid " : 'Paid ') . ($txn->description ?: 'out') . '.'), ['wallet_id' => $wallet->id, 'transaction_reference' => $txn->reference]);
            }
        } catch (\Throwable $e) {
            report($e); // a missed alert never undoes a payment
        }
    }

    // ------------------------------------------------------------- statements

    /** [from, to] for This month · Last 3 months · Since start · Pick dates (Lagos days). */
    public function range(Wallet $wallet, string $period, ?string $from, ?string $to): array
    {
        $tz = 'Africa/Lagos';
        $now = now($tz);
        [$start, $end] = match ($period) {
            'this_month' => [$now->copy()->startOfMonth(), $now->copy()->endOfDay()],
            'last_3_months' => [$now->copy()->subMonthsNoOverflow(3)->startOfDay(), $now->copy()->endOfDay()],
            'custom' => [
                Carbon::parse($from ?: $now->toDateString(), $tz)->startOfDay(),
                Carbon::parse($to ?: $now->toDateString(), $tz)->endOfDay(),
            ],
            // Since the wallet opened, or its first money if that came earlier (moved in from elsewhere).
            default => [collect([$wallet->created_at, Transaction::where('wallet_id', $wallet->id)->min('created_at')])
                ->filter()->map(fn ($d) => Carbon::parse($d))->min()?->setTimezone($tz)->startOfDay() ?? $now->copy()->startOfDay(), $now->copy()->endOfDay()],
        };
        if ($start->gt($end)) {
            throw ValidationException::withMessages(['from' => 'The start date is after the end date.']);
        }

        return [$start->utc(), $end->utc()];
    }

    /** WAL-15 card "24 Aug 2026 to 24 Oct 2026 · 7 transactions · ₦680,000 in". */
    public function statement(Wallet $wallet, Carbon $from, Carbon $to): array
    {
        $txns = Transaction::with('user:id,first_name,last_name,name')
            ->where('wallet_id', $wallet->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['successful', 'pending'])
            ->orderBy('created_at')->orderBy('id')
            ->get();
        $before = Transaction::where('wallet_id', $wallet->id)->where('created_at', '<', $from)->orderByDesc('created_at')->orderByDesc('id')->first();

        $in = (int) $txns->where('direction', 'credit')->sum('amount');
        $out = (int) $txns->where('direction', 'debit')->sum(fn ($t) => $t->amount + $t->fee);
        $opening = (int) ($before?->balance_after ?? 0);

        return [
            'from' => $from,
            'to' => $to,
            'transactions' => $txns,
            'count' => $txns->count(),
            'in' => $in,
            'out' => $out,
            'opening' => $opening,
            'closing' => (int) ($txns->last()?->balance_after ?? $opening),
        ];
    }

    /** The rows a statement shows: [date, description, by, in, out, balance]. */
    public function statementRows(array $statement): array
    {
        return $statement['transactions']->map(fn (Transaction $t) => [
            $t->created_at->copy()->setTimezone('Africa/Lagos')->format('j M Y, g:i a'),
            // "Automation: Save from every salary" reads "Save from every salary (rule)".
            preg_replace('/^Automation: (.*?)(?: \(part\))?$/', '$1 (rule)', (string) $t->description) ?: ucfirst(str_replace('_', ' ', $t->type)),
            $t->user ? ($t->user->first_name ?: $t->user->fullName()) : ($t->counterparty['source_name'] ?? ''),
            $t->direction === 'credit' ? $t->amount : null,
            $t->direction === 'debit' ? $t->amount + $t->fee : null,
            $t->balance_after,
        ])->all();
    }

    /** CSV (spreadsheet) or PDF bytes, with each person's contributions and the audit log if asked. */
    public function statementFile(Wallet $wallet, string $format, Carbon $from, Carbon $to, bool $contributions, bool $audit): array
    {
        $s = $this->statement($wallet, $from, $to);
        $rows = $this->statementRows($s);
        $range = $from->copy()->setTimezone('Africa/Lagos')->format('j M Y') . ' to ' . $to->copy()->setTimezone('Africa/Lagos')->format('j M Y');
        $money = fn (?int $k) => $k === null ? '' : number_format($k / 100, 2);
        $people = [];
        if ($contributions) {
            $c = $this->contributions($wallet, $from, $to);
            foreach ($c['by_user'] as $id => $kobo) {
                $people[] = [User::find($id)?->fullName() ?? 'Member', $kobo, $c['total'] ? (int) round($kobo * 100 / $c['total']) : 0];
            }
            if ($c['others'] > 0) {
                $people[] = ['Others (bank transfers and links)', $c['others'], $c['total'] ? (int) round($c['others'] * 100 / $c['total']) : 0];
            }
            usort($people, fn ($a, $b) => $b[1] <=> $a[1]);
        }
        $log = $audit
            ? WalletAuditLog::with('actor')->where('wallet_id', $wallet->id)->whereBetween('created_at', [$from, $to])->orderBy('created_at')->get()
                ->map(fn ($l) => [$l->created_at->copy()->setTimezone('Africa/Lagos')->format('j M Y, g:i a'), $l->actor?->fullName() ?? 'Patriai', $l->description . (($l->meta['detail'] ?? null) ? ' — ' . $l->meta['detail'] : '')])->all()
            : [];
        $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($wallet->name)) ?: 'wallet';
        $name = "{$slug}-statement-" . $from->copy()->setTimezone('Africa/Lagos')->format('Ymd') . '-' . $to->copy()->setTimezone('Africa/Lagos')->format('Ymd');

        if ($format === 'csv') {
            $out = fopen('php://temp', 'r+');
            fputcsv($out, ["{$wallet->name} statement", $range]);
            fputcsv($out, ['Account', $wallet->virtual_account ?? '', $wallet->virtual_account_bank ?? '']);
            fputcsv($out, ['Opening balance', $money($s['opening']), 'Money in', $money($s['in']), 'Money out', $money($s['out']), 'Closing balance', $money($s['closing'])]);
            fputcsv($out, []);
            fputcsv($out, ['Date', 'Description', 'By', 'In (NGN)', 'Out (NGN)', 'Balance (NGN)']);
            foreach ($rows as $r) {
                fputcsv($out, [$r[0], $r[1], $r[2], $money($r[3]), $money($r[4]), $money($r[5])]);
            }
            if ($people) {
                fputcsv($out, []);
                fputcsv($out, ['Who put in what', 'Amount (NGN)', 'Share']);
                foreach ($people as $p) {
                    fputcsv($out, [$p[0], $money($p[1]), "{$p[2]}%"]);
                }
            }
            if ($log) {
                fputcsv($out, []);
                fputcsv($out, ['Audit log', 'Who', 'What']);
                foreach ($log as $l) {
                    fputcsv($out, $l);
                }
            }
            rewind($out);

            return ['name' => "{$name}.csv", 'mime' => 'text/csv', 'bytes' => stream_get_contents($out)];
        }

        $pdf = new \App\Support\SimplePdf;
        $pdf->text("{$wallet->name}", 18, true);
        $pdf->text('Statement · ' . $range, 11);
        $pdf->text('Account ' . ($wallet->virtual_account ?? '—') . ' · ' . ($wallet->virtual_account_bank ?? 'Patriai') . ' · ' . $wallet->owner?->fullName(), 9);
        $pdf->gap(8);
        $pdf->columns(['Opening balance', 'Money in', 'Money out', 'Closing balance'], [130, 130, 130, 130], 9);
        $pdf->columns(['NGN ' . $money($s['opening']), 'NGN ' . $money($s['in']), 'NGN ' . $money($s['out']), 'NGN ' . $money($s['closing'])], [130, 130, 130, 130], 11, true);
        $pdf->gap(10);
        $widths = [92, 170, 70, 62, 62, 66];
        $pdf->columns(['Date', 'Description', 'By', 'In', 'Out', 'Balance'], $widths, 9, true);
        $pdf->rule();
        foreach ($rows as $r) {
            $pdf->columns([$r[0], $r[1], $r[2], $money($r[3]), $money($r[4]), $money($r[5])], $widths, 8.5);
        }
        if (!$rows) {
            $pdf->text('No money moved in this period.', 9);
        }
        if ($people) {
            $pdf->gap(12);
            $pdf->text('Who put in what', 12, true);
            foreach ($people as $p) {
                $pdf->columns([$p[0], 'NGN ' . $money($p[1]), "{$p[2]}%"], [260, 120, 60], 9);
            }
        }
        if ($log) {
            $pdf->gap(12);
            $pdf->text('Audit log', 12, true);
            foreach ($log as $l) {
                $pdf->columns($l, [100, 100, 322], 8.5);
            }
        }
        $pdf->gap(14);
        $pdf->text('Generated by Patriai on ' . now('Africa/Lagos')->format('j M Y, g:i a') . '. Amounts in Nigerian naira.', 8);

        return ['name' => "{$name}.pdf", 'mime' => 'application/pdf', 'bytes' => $pdf->output()];
    }
}
