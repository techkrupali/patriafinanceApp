<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\ChildTask;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The child wallet once it's set up: linking the child's own phone with its
 * code (CHW-06), the child's app (CHD-03…06), what parents see (CHD-09), a
 * co-parent (WPV-04) and a relative (WPV-05), changing limits later, notes
 * and gifts. Amounts are kobo.
 */
class ChildAppService
{
    public function __construct(private readonly NotificationService $notifications, private readonly WalletService $wallets) {}

    public static function make(): self
    {
        return app(self::class);
    }

    // ----------------------------------------------------------------- linking

    /**
     * CHW-06 "Install Patriai on Kamsi's phone, tap I have a code": the code
     * shown to the parent, while it lasts, becomes the child's own sign-in with
     * their PIN. A new phone for the same child replaces the old one.
     *
     * @return array{0: User, 1: Wallet, 2: string} the child, their wallet, a token
     */
    public function link(string $code, string $pin, string $deviceName): array
    {
        $code = strtoupper(trim($code));
        $wallet = Wallet::where('type', 'child')->where('status', '!=', 'closed')->where('meta->child->phone->code', $code)->first();
        $phone = $wallet?->meta['child']['phone'] ?? null;
        if (!$wallet || !$phone || empty($phone['expires_at']) || Carbon::parse($phone['expires_at'])->isPast()) {
            throw ValidationException::withMessages(['code' => 'That code didn\'t work. Ask a parent to show a new one.']);
        }
        $settings = $wallet->meta['child'];

        return DB::transaction(function () use ($wallet, $settings, $pin, $deviceName) {
            $member = $wallet->members()->where('role', 'child')->first();
            $child = $member?->user;
            if (!$child) {
                $child = new User;
                // role and status aren't fillable on purpose: set them here, deliberately.
                $child->forceFill([
                    'first_name' => $settings['first_name'],
                    'last_name' => $settings['last_name'] ?? null,
                    'name' => trim($settings['first_name'] . ' ' . ($settings['last_name'] ?? '')),
                    // Children have no email or phone of their own; this address is never written to.
                    'email' => 'child-' . $wallet->id . '-' . Str::lower(Str::random(8)) . '@children.patriai.app',
                    'password' => Hash::make(Str::random(40)),
                    'role' => 'child',
                    'status' => 'active',
                    'kyc_tier' => 0,
                ])->save();
                WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $child->id, 'role' => 'child', 'status' => 'active', 'permissions' => ['view' => true, 'fund' => false, 'request' => true, 'withdraw' => false]]);
            }
            $child->forceFill(['pin' => Hash::make($pin), 'pin_length' => strlen($pin)])->save();
            $child->tokens()->delete(); // one phone at a time

            $meta = $wallet->meta;
            $meta['child']['phone'] = ['mode' => 'own', 'linked' => true, 'linked_at' => now()->toIso8601String(), 'device' => $deviceName];
            $wallet->update(['meta' => $meta]);
            foreach ($this->parents($wallet) as $parent) {
                $this->notifications->push($parent, 'child_linked', "{$child->first_name}'s phone is linked", "{$child->first_name} can see their balance, save and ask for money now.", ['wallet_id' => $wallet->id]);
            }

            return [$child, $wallet, $child->createToken('child:' . Str::limit($deviceName, 40, ''))->plainTextToken];
        });
    }

    /** The wallet a child's own sign-in belongs to. */
    public function walletOf(User $child): ?Wallet
    {
        return Wallet::where('type', 'child')->whereHas('members', fn ($q) => $q->where('user_id', $child->id)->where('role', 'child')->where('status', 'active'))->first();
    }

    /** Owner and co-parents (who decide). */
    public function parents(Wallet $wallet): \Illuminate\Support\Collection
    {
        return collect([$wallet->owner])->merge($wallet->members()->with('user')->where('status', 'active')->where('role', 'co_owner')->get()->pluck('user'))->filter()->unique('id')->values();
    }

    // ----------------------------------------------------------------- the child's app

    /** CHD-03 "Hi Tolu · My money · You can spend ₦2,000 today · Football boots · Ask · Tasks · Waiting". */
    public function home(User $child): array
    {
        $wallet = $this->walletOf($child) ?? throw ValidationException::withMessages(['wallet' => 'This phone isn\'t linked to a wallet.']);
        $s = $wallet->meta['child'];
        $spentToday = (int) Transaction::where('wallet_id', $wallet->id)->where('user_id', $child->id)->where('direction', 'debit')
            ->whereIn('status', ['successful', 'pending'])->where('created_at', '>=', now()->setTimezone(ChildService::TIMEZONE)->startOfDay()->utc())->sum('amount');

        return [
            'first_name' => $child->first_name,
            'last_name' => $child->last_name,
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'balance' => $this->naira((int) $wallet->balance), 'paused' => $wallet->isFrozen()],
            'spend_today' => $this->naira(max(0, min((int) $wallet->balance, (int) $s['controls']['daily_limit'] - $spentToday))),
            'daily_limit' => $this->naira((int) $s['controls']['daily_limit']),
            'auto_limit' => $this->naira((int) $s['requests']['auto_limit']),
            'controls' => $s['controls'],
            'reason_required' => (bool) $s['requests']['reason_required'],
            'goal' => $this->goal($wallet, $child),
            'tasks_open' => ChildTask::where('wallet_id', $wallet->id)->where('status', 'todo')->count(),
            'waiting' => $this->requestsOf($wallet, $child)->where('status', 'pending')->values()->all(),
            'notes' => array_slice(array_reverse($s['notes'] ?? []), 0, 3),
            'parents' => $this->parents($wallet)->map(fn (User $u) => $u->first_name)->values(),
        ];
    }

    /** CHD-05 "My requests": waiting, yes (by whom, or automatically) and no, with what they said. */
    public function requests(User $child): array
    {
        $wallet = $this->walletOf($child) ?? throw ValidationException::withMessages(['wallet' => 'This phone isn\'t linked to a wallet.']);

        return $this->requestsOf($wallet, $child)->values()->all();
    }

    private function requestsOf(Wallet $wallet, User $child): \Illuminate\Support\Collection
    {
        return ApprovalRequest::with('responses.approver')->where('wallet_id', $wallet->id)->where('initiator_id', $child->id)->latest('id')->limit(50)->get()
            ->map(function (ApprovalRequest $r) {
                $answer = $r->responses->sortByDesc('created_at')->first();
                $status = match (true) {
                    in_array($r->status, ['approved', 'executed'], true) => 'yes',
                    in_array($r->status, ['rejected', 'declined'], true) => 'no',
                    $r->status === 'pending' => 'pending',
                    default => 'closed', // expired, cancelled, failed
                };

                return [
                    'id' => $r->id,
                    'amount' => $this->naira($r->amount),
                    'title' => $r->description ?: 'Request',
                    'category' => $r->payload['child_category'] ?? null,
                    'status' => $status,
                    'auto' => (bool) ($r->payload['auto_approved'] ?? false),
                    'by' => $answer?->approver?->first_name,
                    'said' => $answer?->note,
                    'reason' => $r->status === 'failed' ? $r->fail_reason : ($r->status === 'expired' ? 'Nobody answered in time' : null),
                    'created_at' => $r->created_at?->toIso8601String(),
                ];
            });
    }

    /** CHD-06 "You saved ₦14,000 · Mum added ₦7,000 · At this pace, boots by 19 Dec". */
    public function goal(Wallet $wallet, ?User $child = null): ?array
    {
        $s = $wallet->meta['child'];
        $goal = !empty($s['goal_wallet_id']) ? Wallet::find($s['goal_wallet_id']) : null;
        if (!$goal) {
            return null;
        }
        $credits = Transaction::where('wallet_id', $goal->id)->where('direction', 'credit')->where('status', 'successful')->get();
        $mine = (int) $credits->filter(fn ($t) => (int) ($t->counterparty['wallet_id'] ?? 0) === $wallet->id)->sum('amount');
        $others = (int) $credits->sum('amount') - $mine;
        $target = (int) $goal->target_amount;
        $balance = (int) $goal->balance;
        $rules = AutomationRule::where('to_wallet_id', $goal->id)->where('enabled', true)->where('trigger', 'schedule')->get();
        $perWeek = (int) $rules->sum(fn ($r) => $r->frequency === 'monthly' ? $r->amount * 12 / 52 : $r->amount / max(1, (int) $r->interval_weeks));
        $left = max(0, $target - $balance);
        $save = (int) ($s['goal']['save_percent'] ?? 0);
        $match = (int) ($s['goal']['match_percent'] ?? 0);

        return [
            'wallet_id' => $goal->id,
            'name' => $goal->name,
            'target' => $this->naira($target),
            'saved' => $this->naira($balance),
            'percent' => $target ? min(100, (int) floor($balance * 100 / $target)) : 0,
            'to_go' => $this->naira($left),
            'you_saved' => $this->naira($mine),
            'others_added' => $this->naira($others),
            'save_percent' => $save,
            'match_percent' => $match,
            'per_allowance' => $this->naira(intdiv((int) $s['allowance']['amount'] * $save, 100)),
            'reach_on' => $left > 0 && $perWeek > 0 ? now()->addDays((int) ceil($left / $perWeek * 7))->toDateString() : null,
        ];
    }

    /** CHD-06 "Add to my goal": from the child's wallet into their goal; it stays family savings. */
    public function addToGoal(User $child, int $kobo, string $pin): array
    {
        app(PinService::class)->verify($child, $pin);
        $wallet = $this->walletOf($child) ?? throw ValidationException::withMessages(['wallet' => 'This phone isn\'t linked to a wallet.']);
        $goal = !empty($wallet->meta['child']['goal_wallet_id']) ? Wallet::find($wallet->meta['child']['goal_wallet_id']) : null;
        if (!$goal) {
            throw ValidationException::withMessages(['goal' => 'There\'s no goal yet. Ask a parent to set one.']);
        }
        if ($kobo < 100 || $kobo > $wallet->availableToSpend()) {
            throw ValidationException::withMessages(['amount' => 'You don\'t have that much to add.']);
        }
        $result = $this->wallets->transferBetweenWallets($wallet, $goal, $kobo, $child, "{$child->first_name} saved for {$goal->name}");
        foreach ($this->parents($wallet) as $parent) {
            $this->notifications->push($parent, 'child_saved', "{$child->first_name} saved ₦" . number_format($kobo / 100), "Into {$goal->name}.", ['wallet_id' => $wallet->id]);
        }

        return ['reference' => $result['reference'], 'goal' => $this->goal($wallet->fresh(), $child)];
    }

    // ----------------------------------------------------------------- parents, co-parents, relatives

    /**
     * CHD-09 for a parent, WPV-04 for a co-parent (asks, this week, tasks), and
     * WPV-05 for a relative — gifts only: the goal, no balance or spending.
     */
    public function view(Wallet $wallet, User $viewer): array
    {
        $s = $wallet->meta['child'];
        $role = $wallet->roleOf($viewer);
        $base = [
            'first_name' => $s['first_name'],
            'age_band' => $s['age_band'],
            'role' => $role === 'owner' ? 'parent' : ($role === 'co_owner' ? 'coparent' : 'relative'),
            'parents' => $this->parents($wallet)->map(fn (User $u) => ['id' => $u->id, 'first_name' => $u->first_name])->values(),
            'goal' => $this->goal($wallet),
            'gifts' => (bool) ($s['gifts'] ?? true),
        ];
        if (!in_array($role, ['owner', 'co_owner'], true)) {
            return $base;
        }
        $children = $wallet->members()->where('role', 'child')->pluck('user_id');
        $weekStart = now()->setTimezone(ChildService::TIMEZONE)->startOfWeek()->utc();
        $asks = ApprovalRequest::with('initiator')->where('wallet_id', $wallet->id)->where('status', 'pending')->whereIn('initiator_id', $children)->latest('id')->get();
        $others = $this->parents($wallet)->reject(fn (User $u) => $u->id === $viewer->id)->map(fn (User $u) => $u->first_name)->values()->all();
        $auto = (int) $s['requests']['auto_limit'];

        return $base + [
            'balance' => $this->naira((int) $wallet->balance),
            'allowance' => ['amount' => $this->naira((int) $s['allowance']['amount']), 'frequency' => $s['allowance']['frequency'], 'starts_on' => $s['allowance']['starts_on']],
            'daily_limit' => $this->naira((int) $s['controls']['daily_limit']),
            'controls' => $s['controls'],
            'requests' => ['auto_limit' => $this->naira($auto), 'auto_per_week' => (int) $s['requests']['auto_per_week'], 'reason_required' => (bool) $s['requests']['reason_required']],
            // Spending, not saving: what went into the child's own goal doesn't count.
            'spent_this_week' => $this->naira((int) Transaction::where('wallet_id', $wallet->id)->where('direction', 'debit')->where('status', 'successful')->whereIn('user_id', $children)->where('created_at', '>=', $weekStart)->get()
                ->reject(fn ($t) => !empty($s['goal_wallet_id']) && (int) ($t->counterparty['wallet_id'] ?? 0) === (int) $s['goal_wallet_id'])->sum('amount')),
            'asks' => $asks->map(fn (ApprovalRequest $r) => [
                'id' => $r->id,
                'amount' => $this->naira($r->amount),
                'title' => $r->description ?: 'Request',
                'category' => $r->payload['child_category'] ?? null,
                'by' => $r->initiator?->first_name,
                // WPV-04 "Over ₦2,000 · needs you or Ngozi".
                'needs' => ($auto > 0 && $r->amount > $auto ? 'Over ₦' . number_format($auto / 100) . ' · ' : '') . 'needs ' . implode(' or ', array_merge(['you'], $others)),
                'created_at' => $r->created_at?->toIso8601String(),
            ])->values(),
            'tasks_waiting' => ChildTask::where('wallet_id', $wallet->id)->where('status', 'submitted')->count(),
            'linked' => (bool) ($s['phone']['linked'] ?? false),
            'can_change' => $role === 'owner' || (bool) ($s['coparent']['change'] ?? true),
            'can_approve' => $role === 'owner' || (bool) ($s['coparent']['approve'] ?? true),
            'paused' => $wallet->isFrozen(),
        ];
    }

    /** WPV-04 "Change limits": the allowance, daily limit, what the child can do and auto-approval. */
    public function update(Wallet $wallet, User $user, array $data): void
    {
        $role = $wallet->roleOf($user);
        $s = $wallet->meta['child'];
        if (!($role === 'owner' || ($role === 'co_owner' && ($s['coparent']['change'] ?? true)))) {
            throw ValidationException::withMessages(['wallet' => 'Only a parent can change this.']);
        }
        foreach (['shops', 'friends', 'online', 'cash'] as $k) {
            if (array_key_exists($k, $data)) {
                $s['controls'][$k] = (bool) $data[$k];
            }
        }
        if (isset($data['daily_limit'])) {
            $s['controls']['daily_limit'] = (int) $data['daily_limit'];
        }
        if (array_key_exists('auto_limit', $data)) {
            $s['requests']['auto_limit'] = (int) $data['auto_limit'];
        }
        if (isset($data['auto_per_week'])) {
            $s['requests']['auto_per_week'] = (int) $data['auto_per_week'];
        }
        if (array_key_exists('reason_required', $data)) {
            $s['requests']['reason_required'] = (bool) $data['reason_required'];
        }
        if (isset($data['allowance'])) {
            $s['allowance']['amount'] = (int) $data['allowance'];
            // The pocket-money rule moves the new amount from the next payday.
            $rule = AutomationRule::whereIn('id', $s['rule_ids'] ?? [])->where('to_wallet_id', $wallet->id)->first();
            $rule?->update(['amount' => (int) $data['allowance']]);
        }
        $meta = $wallet->meta;
        $meta['child'] = $s;
        $wallet->update(['meta' => $meta]);
    }

    /** WPV-05 "Send a note": it shows in the child's app; parents see who wrote. */
    public function note(Wallet $wallet, User $from, string $message): void
    {
        $s = $wallet->meta['child'];
        $notes = $s['notes'] ?? [];
        $notes[] = ['from' => $from->first_name, 'message' => $message, 'at' => now()->toIso8601String()];
        $meta = $wallet->meta;
        $meta['child']['notes'] = array_slice($notes, -20);
        $wallet->update(['meta' => $meta]);
        foreach ($wallet->members()->with('user')->where('role', 'child')->where('status', 'active')->get() as $m) {
            $this->notifications->push($m->user, 'child_note', "A note from {$from->first_name}", $message, ['wallet_id' => $wallet->id]);
        }
    }

    /** WPV-05 "Kamsi gets a note saying it's from Aunty Ada": money in from someone who isn't a parent. */
    public function gifted(Wallet $to, User $from, int $kobo): void
    {
        $childWallet = $to->type === 'child' ? $to : (($id = $to->meta['child_wallet_id'] ?? null) ? Wallet::find($id) : null);
        if (!$childWallet || $this->parents($childWallet)->contains('id', $from->id)) {
            return;
        }
        $what = $to->type === 'child' ? 'your wallet' : $to->name;
        foreach ($childWallet->members()->with('user')->where('role', 'child')->where('status', 'active')->get() as $m) {
            $this->notifications->push($m->user, 'child_gift', "{$from->first_name} sent you ₦" . number_format($kobo / 100), "A gift into {$what}.", ['wallet_id' => $childWallet->id]);
        }
        foreach ($this->parents($childWallet) as $parent) {
            $this->notifications->push($parent, 'child_gift', "{$from->first_name} sent {$childWallet->meta['child']['first_name']} ₦" . number_format($kobo / 100), "A gift into {$what}.", ['wallet_id' => $childWallet->id]);
        }
    }

    /** A relative on the child's wallet may add to the child's goal, though it's a parent's wallet. */
    public function canGiftInto(Wallet $goal, User $user): bool
    {
        $childWalletId = $goal->type === 'goal' ? ($goal->meta['child_wallet_id'] ?? null) : null;
        $child = $childWalletId ? Wallet::find($childWalletId) : null;

        return $child && $child->isAccessibleBy($user) && ($child->meta['child']['gifts'] ?? true);
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }
}
