<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Joint wallet from the client prototype (JNT-01…05): two people, shared
 * equally.
 *  - each puts money in on the same day: equal halves, a share of income, or
 *    fixed amounts; if one is short, both hear and it tries again in 2 days
 *  - each spends alone up to a payment and a day limit; above that — and for a
 *    new account, money out to a personal wallet, or changing these rules — the
 *    other says yes
 *  - both hear about every payment and every rule change, with a weekly summary,
 *    a monthly statement and a big-payment alert
 *  - if one leaves, the money splits the way they agreed; closing needs both PINs
 *  - nothing opens (account number, contributions) until the partner accepts the
 *    rules with their PIN
 * Settings live in wallets.meta.joint. Amounts are kobo.
 */
class JointService
{
    public const MODES = ['equal', 'income', 'fixed'];

    public const SPLITS = ['contributed', 'equal', 'decide'];

    public const SHORT = ['retry', 'skip'];

    public const NOTICE_DAYS = [0, 7, 14, 30, 60, 90];

    public const TIMEZONE = 'Africa/Lagos';

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly WalletService $wallets,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make(), WalletService::make());
    }

    /** The joint settings, or null for any other wallet. */
    public function settings(Wallet $wallet): ?array
    {
        return $wallet->type === 'joint' && is_array($wallet->meta['joint'] ?? null) ? $wallet->meta['joint'] : null;
    }

    public function isWaiting(Wallet $wallet): bool
    {
        return ($this->settings($wallet)['state'] ?? null) === 'waiting';
    }

    // ----------------------------------------------------------------- setup

    /** WCR-06 "Send to Emeka": the rules as both will agree them. The owner's share waits for the partner. */
    public function configure(Wallet $wallet, User $owner, array $joint, ?Wallet $source): void
    {
        if ((int) $owner->kyc_tier < 1) {
            throw ValidationException::withMessages(['joint' => 'Verify your BVN first. Both of you must be verified for a joint wallet.']);
        }
        $c = $joint['contribution'] ?? [];
        $limits = $joint['limits'] ?? [];
        $always = $joint['always'] ?? [];
        $notify = $joint['notify'] ?? [];
        $leave = $joint['leave'] ?? [];
        $settings = [
            'state' => 'waiting',
            'contribution' => [
                'mode' => in_array($c['mode'] ?? null, self::MODES, true) ? $c['mode'] : 'equal',
                'day' => (int) ($c['day'] ?? 26),
                'mine' => (int) ($c['mine'] ?? 0),
                'partner' => (int) ($c['partner'] ?? 0),
            ],
            'short' => in_array($joint['short'] ?? null, self::SHORT, true) ? $joint['short'] : 'retry',
            'limits' => [
                'per_payment' => (int) ($limits['per_payment'] ?? 5_000_000),
                'per_day' => (int) ($limits['per_day'] ?? 10_000_000),
            ],
            'always' => [
                'new_account' => (bool) ($always['new_account'] ?? true),
                'personal' => (bool) ($always['personal'] ?? true),
                'rules' => (bool) ($always['rules'] ?? true),
            ],
            'notify' => [
                'weekly' => (bool) ($notify['weekly'] ?? true),
                'statement' => (bool) ($notify['statement'] ?? true),
                'big_payment' => (bool) ($notify['big_payment'] ?? true),
                'big_amount' => (int) ($notify['big_amount'] ?? 10_000_000),
            ],
            'leave' => [
                'split' => in_array($leave['split'] ?? null, self::SPLITS, true) ? $leave['split'] : 'contributed',
                'notice_days' => (int) ($leave['notice_days'] ?? 30),
            ],
        ];
        if ($settings['limits']['per_day'] < $settings['limits']['per_payment']) {
            throw ValidationException::withMessages(['joint.limits.per_day' => 'The day limit can\'t be less than one payment.']);
        }

        $meta = $wallet->meta ?? [];
        $meta['joint'] = $settings;
        // Above the limits the other partner decides, within the time they agreed.
        $meta['approval_mode'] = 'all';
        $meta['approval_expiry_hours'] = in_array((int) ($joint['expiry_hours'] ?? 24), Wallet::APPROVAL_EXPIRY_HOURS, true) ? (int) $joint['expiry_hours'] : 24;
        $wallet->update(['meta' => $meta]);

        if ($settings['contribution']['mine'] > 0 && $source) {
            AutomationService::make()->createContributionRule($owner, $source, $wallet, [
                'name' => "My share into {$wallet->name}",
                'amount' => $settings['contribution']['mine'],
                'frequency' => 'monthly',
                'day_of_month' => $settings['contribution']['day'],
                'enabled' => false,
            ]);
        }
    }

    /**
     * INV-O2: the partner accepted the rules with their PIN. The wallet gets its
     * account number, and both contributions start.
     */
    public function accept(Wallet $wallet, User $partner, WalletInvitation $invitation, ?int $sourceWalletId): void
    {
        if ((int) $partner->kyc_tier < 1) {
            throw ValidationException::withMessages(['kyc' => 'Verify your BVN first. Both of you must be verified for a joint wallet.']);
        }
        $settings = $this->settings($wallet);
        $amount = (int) ($invitation->pledge_amount ?? $settings['contribution']['partner'] ?? 0);
        if ($amount > 0) {
            $source = $sourceWalletId
                ? Wallet::where('id', $sourceWalletId)->where('user_id', $partner->id)->first()
                : $partner->mainWallet();
            if (!$source) {
                throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your own wallets to pay your share from.']);
            }
            AutomationService::make()->createContributionRule($partner, $source, $wallet, [
                'name' => "My share into {$wallet->name}",
                'amount' => $amount,
                'frequency' => 'monthly',
                'day_of_month' => $settings['contribution']['day'],
            ]);
        }
        AutomationRule::where('to_wallet_id', $wallet->id)->where('user_id', $wallet->user_id)->update(['enabled' => true]);

        $meta = $wallet->meta;
        $meta['joint']['state'] = 'open';
        $meta['joint']['partner_id'] = $partner->id;
        $meta['joint']['opened_at'] = now()->toIso8601String();
        $wallet->update(['meta' => $meta]);
        $this->wallets->ensureVirtualAccount($wallet);

        if ($owner = $wallet->owner) {
            $account = $wallet->refresh()->virtual_account;
            $this->notifications->push($owner, 'joint_open', "{$partner->first_name} accepted. {$wallet->name} is open", trim("You're both co-owners now." . ($account ? " Its account number is {$account}." : '')), ['wallet_id' => $wallet->id]);
        }
    }

    // ----------------------------------------------------------------- spending

    /**
     * JNT-03 before money leaves: why the other partner has to say yes, or null
     * when it can go alone. $to is the destination: {kind: bank, account_number}
     * | {kind: wallet, wallet_id} | {kind: user, user_id}.
     */
    public function check(Wallet $wallet, User $user, int $amount, ?array $to): ?string
    {
        $settings = $this->settings($wallet);
        if (!$settings) {
            return null;
        }
        if ($settings['state'] === 'waiting') {
            throw ValidationException::withMessages(['wallet' => "{$wallet->name} opens once your partner accepts."]);
        }
        // Closing: nothing leaves but the agreed split.
        if (!empty($settings['closing'])) {
            throw ValidationException::withMessages(['wallet' => "{$wallet->name} is closing. Nothing can be paid out until you both confirm."]);
        }

        $limits = $settings['limits'];
        $always = $settings['always'];
        $kind = $to['kind'] ?? null;

        if ($always['personal'] && $kind === 'wallet' && ($dest = Wallet::find($to['wallet_id'] ?? 0)) && $dest->type !== 'joint') {
            return 'money out to a personal wallet';
        }
        if ($always['personal'] && $kind === 'user' && in_array((int) ($to['user_id'] ?? 0), $this->partnerIds($wallet), true)) {
            return 'money out to a personal wallet';
        }
        if ($always['new_account'] && $kind === 'bank' && !$this->paidBefore($wallet, (string) ($to['account_number'] ?? ''))) {
            return 'a new account';
        }
        if ($amount > $limits['per_payment']) {
            return 'over ' . $this->naira($limits['per_payment']) . ' a payment';
        }
        if ($this->spentToday($wallet, $user) + $amount > $limits['per_day']) {
            return 'over ' . $this->naira($limits['per_day']) . ' alone today';
        }

        return null;
    }

    /** JNT-04 "Every payment notifies both of you", and the big-payment alert. */
    public function paid(Wallet $wallet, User $by, int $amount, ?string $reference): void
    {
        $settings = $this->settings($wallet);
        if (!$settings) {
            return;
        }
        $big = $settings['notify']['big_payment'] && $amount > $settings['notify']['big_amount'];
        $title = ($big ? 'Big payment: ' : '') . "{$by->first_name} paid {$this->naira($amount)} from {$wallet->name}";
        $body = 'Balance now ' . $this->naira((int) $wallet->fresh()->balance) . '.';
        foreach ($this->partners($wallet) as $partner) {
            $this->notifications->push($partner, $big ? 'joint_big_payment' : 'joint_payment', $title, $body, array_filter(['wallet_id' => $wallet->id, 'reference' => $reference]));
            if ($partner->phone) {
                SmsService::make()->send($partner->phone, "Patriai: {$title}. {$body}");
            }
        }
    }

    // ----------------------------------------------------------------- rule changes

    /**
     * JNT-03 "Changing these rules" needs both: the change waits for the other
     * partner's yes. Without that rule it applies now. Either way both hear, with
     * who changed it.
     */
    public function propose(Wallet $wallet, User $by, array $changes): array
    {
        $settings = $this->requireOpen($wallet);
        $changes = $this->cleanChanges($changes);
        if ($changes === []) {
            throw ValidationException::withMessages(['changes' => 'Nothing to change.']);
        }
        if (!$settings['always']['rules']) {
            $this->apply($wallet, $changes);
            $this->tellBoth($wallet, 'joint_rule_change', "{$by->first_name} changed the rules of {$wallet->name}", $this->describe($changes));

            return ['applied' => true];
        }

        $meta = $wallet->meta;
        $meta['joint']['proposal'] = ['by' => $by->id, 'at' => now()->toIso8601String(), 'changes' => $changes];
        $wallet->update(['meta' => $meta]);
        foreach ($this->partners($wallet)->reject(fn (User $u) => $u->id === $by->id) as $other) {
            $this->notifications->push($other, 'joint_rule_change', "{$by->first_name} wants to change the rules of {$wallet->name}", $this->describe($changes) . ' It only changes if you agree.', ['wallet_id' => $wallet->id]);
        }

        return ['applied' => false];
    }

    /** The other partner's answer to a proposed change. */
    public function answer(Wallet $wallet, User $by, bool $agree): void
    {
        $settings = $this->requireOpen($wallet);
        $proposal = $settings['proposal'] ?? null;
        if (!$proposal) {
            throw ValidationException::withMessages(['proposal' => 'There is no change waiting.']);
        }
        if ((int) $proposal['by'] === $by->id) {
            throw ValidationException::withMessages(['proposal' => 'Your partner has to answer this one.']);
        }
        $meta = $wallet->meta;
        unset($meta['joint']['proposal']);
        $wallet->update(['meta' => $meta]);
        if ($agree) {
            $this->apply($wallet, $proposal['changes']);
        }
        $this->tellBoth(
            $wallet,
            'joint_rule_change',
            $agree ? "{$by->first_name} agreed: {$wallet->name}'s rules changed" : "{$by->first_name} said no to the rule change",
            $this->describe($proposal['changes']),
        );
    }

    private function cleanChanges(array $changes): array
    {
        return array_filter([
            'per_payment' => isset($changes['per_payment']) ? (int) $changes['per_payment'] : null,
            'per_day' => isset($changes['per_day']) ? (int) $changes['per_day'] : null,
            'big_amount' => isset($changes['big_amount']) ? (int) $changes['big_amount'] : null,
            'split' => in_array($changes['split'] ?? null, self::SPLITS, true) ? $changes['split'] : null,
            'notice_days' => isset($changes['notice_days']) && in_array((int) $changes['notice_days'], self::NOTICE_DAYS, true) ? (int) $changes['notice_days'] : null,
        ], fn ($v) => $v !== null);
    }

    private function apply(Wallet $wallet, array $changes): void
    {
        $meta = $wallet->fresh()->meta;
        foreach (['per_payment', 'per_day'] as $k) {
            if (isset($changes[$k])) {
                $meta['joint']['limits'][$k] = $changes[$k];
            }
        }
        if (isset($changes['big_amount'])) {
            $meta['joint']['notify']['big_amount'] = $changes['big_amount'];
        }
        foreach (['split', 'notice_days'] as $k) {
            if (isset($changes[$k])) {
                $meta['joint']['leave'][$k] = $changes[$k];
            }
        }
        $wallet->update(['meta' => $meta]);
    }

    private function describe(array $changes): string
    {
        $parts = [];
        if (isset($changes['per_payment'])) {
            $parts[] = 'spend alone up to ' . $this->naira($changes['per_payment']) . ' a payment';
        }
        if (isset($changes['per_day'])) {
            $parts[] = $this->naira($changes['per_day']) . ' a day each';
        }
        if (isset($changes['big_amount'])) {
            $parts[] = 'big payment alert over ' . $this->naira($changes['big_amount']);
        }
        if (isset($changes['split'])) {
            $parts[] = match ($changes['split']) {
                'contributed' => 'split by what each put in',
                'equal' => 'split equally',
                default => 'decide together at the time',
            };
        }
        if (isset($changes['notice_days'])) {
            $parts[] = "{$changes['notice_days']} days' notice";
        }

        return ucfirst(implode(', ', $parts)) . '.';
    }

    // ----------------------------------------------------------------- leaving and closing

    /**
     * JNT-05 "Notice to leave": payments continue during notice; when it ends the
     * money splits as agreed (or, "decide together", waits for both to confirm).
     */
    public function leave(Wallet $wallet, User $by): Carbon
    {
        $settings = $this->requireOpen($wallet);
        $ends = now()->addDays((int) $settings['leave']['notice_days']);
        $meta = $wallet->meta;
        $meta['joint']['state'] = 'leaving';
        $meta['joint']['leaving'] = ['by' => $by->id, 'at' => now()->toIso8601String(), 'ends_on' => $ends->toDateString()];
        $wallet->update(['meta' => $meta]);
        foreach ($this->partners($wallet)->reject(fn (User $u) => $u->id === $by->id) as $other) {
            $this->notifications->push($other, 'joint_leaving', "{$by->first_name} is leaving {$wallet->name}", "Payments continue until {$ends->format('j M')}. Then the money splits the way you agreed.", ['wallet_id' => $wallet->id]);
        }
        if ((int) $settings['leave']['notice_days'] === 0) {
            $this->endNotice($wallet->refresh());
        }

        return $ends;
    }

    /**
     * JNT-05 "Closing the wallet: both must confirm with PIN". The first PIN asks
     * (with the split, when they decide at the time); the other's PIN closes it.
     * Returns true once closed.
     *
     * @param  array<int, int>|null  $shares  user id => kobo, for "decide together"
     */
    public function close(Wallet $wallet, User $by, ?array $shares = null): bool
    {
        $settings = $this->settings($wallet);
        if (!$settings || $settings['state'] === 'closed' || $wallet->status === 'closed') {
            throw ValidationException::withMessages(['wallet' => 'This joint wallet is already closed.']);
        }
        if ($settings['state'] === 'waiting') {
            // Nobody else has joined yet: the owner can just close it.
            $this->split($wallet, [$wallet->user_id => (int) $wallet->balance]);
            $this->finish($wallet, $by);

            return true;
        }

        $closing = $settings['closing'] ?? null;
        if (!$closing || (int) $closing['by'] === $by->id) {
            if ($settings['leave']['split'] === 'decide') {
                $shares = $this->agreedShares($wallet, $shares ?? []);
            }
            $meta = $wallet->meta;
            $meta['joint']['closing'] = ['by' => $by->id, 'at' => now()->toIso8601String(), 'shares' => $shares];
            $wallet->update(['meta' => $meta]);
            foreach ($this->partners($wallet)->reject(fn (User $u) => $u->id === $by->id) as $other) {
                $this->notifications->push($other, 'joint_closing', "{$by->first_name} wants to close {$wallet->name}", 'It closes when you confirm with your PIN. ' . $this->splitLine($wallet, $shares), ['wallet_id' => $wallet->id]);
            }

            return false;
        }

        $this->split($wallet, $closing['shares'] ?? $this->shares($wallet));
        $this->finish($wallet, $by);

        return true;
    }

    /** "Decide together": the amounts the first partner proposed must add up to the balance. */
    private function agreedShares(Wallet $wallet, array $shares): array
    {
        $ids = $this->partnerIds($wallet);
        $clean = [];
        foreach ($ids as $id) {
            $clean[$id] = max(0, (int) ($shares[$id] ?? 0));
        }
        if (array_sum($clean) !== (int) $wallet->balance) {
            throw ValidationException::withMessages(['shares' => 'Say how much each of you gets. It has to add up to ' . $this->naira((int) $wallet->balance) . '.']);
        }

        return $clean;
    }

    /** What each partner gets under the agreed split (kobo, adds up to the balance). */
    public function shares(Wallet $wallet): array
    {
        $ids = $this->partnerIds($wallet);
        $balance = (int) $wallet->fresh()->balance;
        $split = $this->settings($wallet)['leave']['split'] ?? 'contributed';
        $put = collect($ids)->mapWithKeys(fn ($id) => [$id => $split === 'equal' ? 1 : $this->putIn($wallet, $id)]);
        $total = $put->sum();
        if ($total <= 0) {
            $put = collect($ids)->mapWithKeys(fn ($id) => [$id => 1]);
            $total = count($ids);
        }
        $out = [];
        $given = 0;
        foreach ($ids as $i => $id) {
            $out[$id] = $i === count($ids) - 1 ? $balance - $given : intdiv($balance * $put[$id], $total);
            $given += $out[$id];
        }

        return $out;
    }

    /** Each partner's share goes to their Main wallet. */
    private function split(Wallet $wallet, array $shares): void
    {
        DB::transaction(function () use ($wallet, $shares) {
            foreach ($shares as $userId => $amount) {
                $user = User::find($userId);
                $main = $user?->mainWallet();
                if ($amount > 0 && $main) {
                    $this->wallets->transferBetweenWallets($wallet->fresh(), $main, (int) $amount, $user, "Your share of {$wallet->name}");
                }
            }
        });
    }

    private function finish(Wallet $wallet, User $by): void
    {
        AutomationRule::where('to_wallet_id', $wallet->id)->update(['enabled' => false]);
        $meta = $wallet->fresh()->meta;
        $meta['joint']['state'] = 'closed';
        unset($meta['joint']['closing'], $meta['joint']['proposal']);
        $wallet->update(['meta' => $meta, 'status' => 'closed']);
        WalletInvitation::where('wallet_id', $wallet->id)->where('status', 'pending')->update(['status' => 'cancelled', 'responded_at' => now()]);
        $this->tellBoth($wallet, 'joint_closed', "{$wallet->name} is closed", "Closed by {$by->first_name}. Each of you got your share in your Main wallet.");
    }

    private function splitLine(Wallet $wallet, ?array $shares): string
    {
        $shares ??= $this->shares($wallet);
        $names = User::whereIn('id', array_keys($shares))->get()->keyBy('id');

        return collect($shares)->map(fn ($amount, $id) => ($names[$id]?->first_name ?? 'Someone') . ' gets ' . $this->naira((int) $amount))->join(', ', ' and ') . '.';
    }

    // ----------------------------------------------------------------- scheduled

    /**
     * Daily, Sunday-evening and first-of-month work: notice periods that ended,
     * JNT-04's weekly summary and monthly statement.
     *
     * @return array{left: int, summaries: int, statements: int}
     */
    public function runDaily(): array
    {
        $now = now()->setTimezone(self::TIMEZONE);
        $done = ['left' => 0, 'summaries' => 0, 'statements' => 0];
        Wallet::where('type', 'joint')->where('status', 'active')->get()->each(function (Wallet $wallet) use ($now, &$done) {
            $settings = $this->settings($wallet);
            if (!$settings || $settings['state'] === 'waiting') {
                return;
            }
            if ($settings['state'] === 'leaving' && !empty($settings['leaving']['ends_on']) && $now->toDateString() >= $settings['leaving']['ends_on']) {
                $this->endNotice($wallet);
                $done['left']++;

                return;
            }
            if ($now->isSunday() && $settings['notify']['weekly']) {
                $this->weeklySummary($wallet, $now);
                $done['summaries']++;
            }
            if ($now->day === 1 && $settings['notify']['statement']) {
                $this->monthlyStatement($wallet, $now->copy()->subMonthNoOverflow());
                $done['statements']++;
            }
        });

        return $done;
    }

    private function endNotice(Wallet $wallet): void
    {
        $settings = $this->settings($wallet);
        $leaver = User::find($settings['leaving']['by'] ?? 0);
        if ($settings['leave']['split'] === 'decide') {
            // "Money stays locked until you both agree."
            $meta = $wallet->meta;
            $meta['joint']['state'] = 'open';
            $wallet->update(['meta' => $meta]);
            $this->tellBoth($wallet, 'joint_leaving', "Notice is over for {$wallet->name}", 'Agree how to split the money, then both confirm with your PIN to close it.');

            return;
        }
        $this->split($wallet, $this->shares($wallet));
        $this->finish($wallet, $leaver ?? $wallet->owner);
    }

    /** "Weekly summary · Sunday evening, for both of you". */
    public function weeklySummary(Wallet $wallet, Carbon $now): void
    {
        $since = $now->copy()->subDays(6)->startOfDay();
        $in = $this->total($wallet, 'credit', $since);
        $out = $this->spendsSince($wallet, $since);
        $byPerson = $out->groupBy('user_id')->map(fn (Collection $t) => (int) $t->sum('amount'));
        $names = User::whereIn('id', $byPerson->keys())->pluck('first_name', 'id');
        $who = $byPerson->map(fn ($sum, $id) => ($names[$id] ?? 'Someone') . ' ' . $this->naira($sum))->join(', ');
        $this->tellBoth(
            $wallet,
            'joint_summary',
            "{$wallet->name} this week",
            "{$this->naira($in)} in, {$this->naira((int) $out->sum('amount'))} out" . ($who ? " ({$who})" : '') . '. Balance ' . $this->naira((int) $wallet->balance) . '.',
        );
    }

    /** "Monthly statement on the 1st": every payment last month, by email to both. */
    public function monthlyStatement(Wallet $wallet, Carbon $month): void
    {
        $start = $month->copy()->startOfMonth();
        $end = $month->copy()->endOfMonth();
        $rows = Transaction::where('wallet_id', $wallet->id)->whereIn('status', ['successful', 'pending'])
            ->whereBetween('created_at', [$start->copy()->utc(), $end->copy()->utc()])->with('user')->orderBy('created_at')->get();
        $lines = $rows->map(fn (Transaction $t) => $t->created_at->setTimezone(self::TIMEZONE)->format('j M') . '  '
            . ($t->direction === 'credit' ? '+' : '-') . $this->naira((int) $t->amount) . '  '
            . ($t->description ?? $t->type) . ($t->user ? " ({$t->user->first_name})" : ''))->join("\n");
        $in = (int) $rows->where('direction', 'credit')->sum('amount');
        $out = (int) $rows->where('direction', 'debit')->sum('amount');
        $title = "{$wallet->name}: {$month->format('F Y')} statement";
        $body = "{$this->naira($in)} in, {$this->naira($out)} out, closing balance {$this->naira((int) $wallet->balance)}.\n\n" . ($lines ?: 'No payments this month.');
        $this->tellBoth($wallet, 'joint_statement', $title, $body);
    }

    // ----------------------------------------------------------------- detail

    /** What the wallet and the invitation show: the rules both agreed. */
    public function summary(Wallet $wallet): ?array
    {
        $settings = $this->settings($wallet);
        if (!$settings) {
            return null;
        }
        $c = $settings['contribution'];
        $naira = fn (int $kobo) => number_format($kobo / 100, 2, '.', '');
        $partner = isset($settings['partner_id']) ? User::find($settings['partner_id']) : null;
        $invite = $partner ? null : WalletInvitation::where('wallet_id', $wallet->id)->where('status', 'pending')->latest()->first();

        return [
            'state' => $settings['state'],
            'partner' => $partner ? ['id' => $partner->id, 'name' => $partner->fullName()] : null,
            'invitation' => $invite ? ['id' => $invite->id, 'expires_at' => $invite->expires_at?->toIso8601String()] : null,
            'contribution' => ['mode' => $c['mode'], 'day' => $c['day'], 'mine' => $naira($c['mine']), 'partner' => $naira($c['partner'])],
            'short' => $settings['short'],
            'limits' => ['per_payment' => $naira($settings['limits']['per_payment']), 'per_day' => $naira($settings['limits']['per_day'])],
            'expiry_hours' => $wallet->approvalExpiryHours(),
            'always' => $settings['always'],
            'notify' => ['big_amount' => $naira($settings['notify']['big_amount'])] + $settings['notify'],
            'leave' => $settings['leave'],
            'leaving' => $settings['leaving'] ?? null,
            'closing' => isset($settings['closing']) ? ['by' => $settings['closing']['by'], 'at' => $settings['closing']['at']] : null,
            'proposal' => isset($settings['proposal']) ? ['by' => $settings['proposal']['by'], 'summary' => $this->describe($settings['proposal']['changes'])] : null,
        ];
    }

    // ----------------------------------------------------------------- helpers

    private function requireOpen(Wallet $wallet): array
    {
        $settings = $this->settings($wallet);
        if (!$settings || !in_array($settings['state'], ['open', 'leaving'], true) || $wallet->status === 'closed') {
            throw ValidationException::withMessages(['wallet' => 'This joint wallet isn\'t open.']);
        }

        return $settings;
    }

    /** @return list<int> owner first, then the partner */
    private function partnerIds(Wallet $wallet): array
    {
        return $wallet->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id')
            ->prepend($wallet->user_id)->unique()->map(fn ($id) => (int) $id)->values()->all();
    }

    /** @return Collection<int, User> */
    private function partners(Wallet $wallet): Collection
    {
        $ids = $this->partnerIds($wallet);

        return User::whereIn('id', $ids)->get()->sortBy(fn (User $u) => array_search($u->id, $ids, true))->values();
    }

    private function tellBoth(Wallet $wallet, string $type, string $title, string $body): void
    {
        foreach ($this->partners($wallet) as $user) {
            $this->notifications->push($user, $type, $title, $body, ['wallet_id' => $wallet->id]);
        }
    }

    private function paidBefore(Wallet $wallet, string $accountNumber): bool
    {
        return $accountNumber !== '' && Transaction::where('wallet_id', $wallet->id)->where('type', 'withdrawal')
            ->where('status', 'successful')->where('counterparty->account_number', $accountNumber)->exists();
    }

    private function spentToday(Wallet $wallet, User $user): int
    {
        return (int) $this->spendsSince($wallet, now()->setTimezone(self::TIMEZONE)->startOfDay())->where('user_id', $user->id)->sum('amount');
    }

    /** @return Collection<int, Transaction> money paid out (not fees) */
    private function spendsSince(Wallet $wallet, Carbon $since): Collection
    {
        return Transaction::where('wallet_id', $wallet->id)->where('direction', 'debit')
            ->whereIn('type', ['transfer_out', 'withdrawal'])->whereIn('status', ['successful', 'pending'])
            ->where('created_at', '>=', $since->copy()->utc())->get();
    }

    private function total(Wallet $wallet, string $direction, Carbon $since): int
    {
        return (int) Transaction::where('wallet_id', $wallet->id)->where('direction', $direction)->whereIn('status', ['successful', 'pending'])
            ->where('created_at', '>=', $since->copy()->utc())->sum('amount');
    }

    /** What one partner moved in themselves. */
    private function putIn(Wallet $wallet, int $userId): int
    {
        return (int) Transaction::where('wallet_id', $wallet->id)->where('direction', 'credit')->where('type', 'transfer_in')
            ->where('status', 'successful')->where('user_id', $userId)->sum('amount');
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }
}
