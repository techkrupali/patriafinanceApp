<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\KycSubmission;
use App\Models\Loan;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\SupportRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Services\KycService;
use App\Services\LoanService;
use App\Services\NotificationService;
use App\Services\SupportService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminController extends ApiController
{
    // GET /admin/stats
    public function stats(): JsonResponse
    {
        $volume30d = Transaction::where('status', 'successful')
            ->where('created_at', '>=', now()->subDays(30));

        return $this->ok('Stats fetched', [
            'users' => [
                'total' => User::where('role', 'user')->count(),
                'active' => User::where('role', 'user')->where('status', 'active')->count(),
                'new_7d' => User::where('role', 'user')->where('created_at', '>=', now()->subDays(7))->count(),
            ],
            'wallets' => [
                'total' => Wallet::count(),
                'by_type' => Wallet::selectRaw('type, count(*) as count')->groupBy('type')->pluck('count', 'type'),
                'total_balance' => number_format(Wallet::sum('balance') / 100, 2, '.', ''),
            ],
            'transactions' => [
                'total' => Transaction::count(),
                'volume_in_30d' => number_format((clone $volume30d)->where('direction', 'credit')->sum('amount') / 100, 2, '.', ''),
                'volume_out_30d' => number_format((clone $volume30d)->where('direction', 'debit')->sum('amount') / 100, 2, '.', ''),
                'pending' => Transaction::where('status', 'pending')->count(),
                'failed' => Transaction::where('status', 'failed')->count(),
            ],
            'approvals' => [
                'pending' => ApprovalRequest::where('status', 'pending')->count(),
            ],
            'loans' => [
                'active' => Loan::where('status', 'active')->count(),
                'pending' => Loan::where('status', 'pending')->count(),
                'outstanding' => number_format(
                    (int) Loan::whereIn('status', Loan::OWED_STATUSES)->sum(DB::raw('outstanding + penalty_accrued')) / 100,
                    2, '.', ''
                ),
            ],
            'projects' => [
                'active' => Project::where('status', 'active')->count(),
                'escrow' => number_format(
                    (int) Milestone::whereIn('status', Project::RESERVED_MILESTONE_STATUSES)
                        ->whereIn('project_id', Project::where('status', 'active')->select('id'))
                        ->sum('amount') / 100,
                    2, '.', ''
                ),
            ],
            'kyc' => [
                'pending' => KycSubmission::where('status', 'pending')->count(),
            ],
            'signups' => $this->signupStats(),
            'rules' => [
                'active' => AutomationRule::where('enabled', true)->count(),
                'paused' => AutomationRule::where('enabled', false)->count(),
            ],
            'invitations' => [
                'pending' => WalletInvitation::where('status', 'pending')
                    ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                    ->count(),
            ],
            // The dashboard's chart, recent list and sparkline.
            'trend' => $this->flowTrend(),
            'recent' => $this->recentTransactions(),
            'signups_daily' => $this->signupsDaily(),
            'balance_by_type' => Wallet::selectRaw('type, sum(balance) as total')->groupBy('type')->pluck('total', 'type')
                ->map(fn ($kobo) => number_format(((int) $kobo) / 100, 2, '.', '')),
            // Without these keys phone sign-up codes are only logged, and Steward answers offline.
            'system' => [
                'sms_configured' => !empty(config('services.termii.api_key')),
                'ai_configured' => !empty(config('services.anthropic.api_key')),
            ],
        ]);
    }

    /** Money coming into Patriai (bank deposits) and leaving it (payouts to banks). */
    private const MONEY_IN = ['fund', 'funding'];
    private const MONEY_OUT = ['withdrawal'];

    /** A date bucket in SQL, for SQLite and Postgres. */
    private function bucket(string $format): string
    {
        return DB::getDriverName() === 'pgsql'
            ? "to_char(created_at AT TIME ZONE 'Africa/Lagos', '" . ($format === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD') . "')"
            : "strftime('" . ($format === 'month' ? '%Y-%m' : '%Y-%m-%d') . "', created_at, '+1 hour')";
    }

    /**
     * Cash flow trend: money in vs out for the last 12 months, and each day of
     * the last 30 (naira strings).
     *
     * @return array{monthly: list<array{key: string, label: string, in: string, out: string}>, daily: list<array{key: string, label: string, in: string, out: string}>}
     */
    private function flowTrend(): array
    {
        $sum = function (string $format, $since) {
            $b = $this->bucket($format);

            return Transaction::where('status', 'successful')->where('created_at', '>=', $since)
                ->whereIn('type', [...self::MONEY_IN, ...self::MONEY_OUT])
                ->selectRaw("{$b} as k, sum(case when type in ('" . implode("','", self::MONEY_IN) . "') then amount else 0 end) as money_in, sum(case when type in ('" . implode("','", self::MONEY_OUT) . "') then amount else 0 end) as money_out")
                ->groupBy('k')->get()->keyBy('k');
        };
        $naira = fn ($kobo) => number_format(((int) $kobo) / 100, 2, '.', '');
        $now = now()->setTimezone('Africa/Lagos');

        $months = $sum('month', $now->copy()->startOfMonth()->subMonths(11)->utc());
        $monthly = [];
        for ($i = 11; $i >= 0; $i--) {
            $m = $now->copy()->startOfMonth()->subMonths($i);
            $row = $months->get($m->format('Y-m'));
            $monthly[] = ['key' => $m->format('Y-m'), 'label' => $m->format('M'), 'in' => $naira($row?->money_in), 'out' => $naira($row?->money_out)];
        }

        $days = $sum('day', $now->copy()->startOfDay()->subDays(29)->utc());
        $daily = [];
        for ($i = 29; $i >= 0; $i--) {
            $d = $now->copy()->startOfDay()->subDays($i);
            $row = $days->get($d->format('Y-m-d'));
            $daily[] = ['key' => $d->format('Y-m-d'), 'label' => $d->format('j M'), 'in' => $naira($row?->money_in), 'out' => $naira($row?->money_out)];
        }

        return ['monthly' => $monthly, 'daily' => $daily];
    }

    /** The latest money movements, for the dashboard's table. */
    private function recentTransactions(): array
    {
        return Transaction::with(['wallet:id,name,user_id', 'wallet.owner:id,first_name,last_name'])
            ->latest('id')->limit(6)->get()
            ->map(fn (Transaction $t) => [
                'id' => $t->id,
                'reference' => $t->reference,
                'description' => $t->description ?: ucfirst(str_replace('_', ' ', $t->type)),
                'type' => $t->type,
                'direction' => $t->direction,
                'amount' => number_format($t->amount / 100, 2, '.', ''),
                'status' => $t->status,
                'created_at' => $t->created_at?->toIso8601String(),
                'wallet' => $t->wallet?->name,
                'owner' => $t->wallet?->owner ? trim($t->wallet->owner->first_name . ' ' . $t->wallet->owner->last_name) : null,
            ])->all();
    }

    /** New customers each day for the last 14 days. */
    private function signupsDaily(): array
    {
        $now = now()->setTimezone('Africa/Lagos');
        $b = $this->bucket('day');
        $rows = User::where('role', 'user')->where('created_at', '>=', $now->copy()->startOfDay()->subDays(13)->utc())
            ->selectRaw("{$b} as k, count(*) as n")->groupBy('k')->pluck('n', 'k');
        $out = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = $now->copy()->startOfDay()->subDays($i);
            $out[] = ['key' => $d->format('Y-m-d'), 'label' => $d->format('D j'), 'count' => (int) ($rows[$d->format('Y-m-d')] ?? 0)];
        }

        return $out;
    }

    /**
     * How customers joined (phone + PIN vs the older email + password), the
     * app language they use, and what brought them (onboarding ONB-09).
     */
    private function signupStats(): array
    {
        $customers = User::where('role', 'user');
        $purposes = array_fill_keys(User::ONBOARDING_PURPOSES, 0);
        (clone $customers)->whereNotNull('onboarding_purposes')->select(['id', 'onboarding_purposes'])
            ->chunkById(500, function ($users) use (&$purposes) {
                foreach ($users as $u) {
                    foreach ((array) $u->onboarding_purposes as $p) {
                        if (array_key_exists($p, $purposes)) {
                            $purposes[$p]++;
                        }
                    }
                }
            });

        return [
            'phone' => (clone $customers)->whereNull('password')->count(),
            'password' => (clone $customers)->whereNotNull('password')->count(),
            'languages' => [
                'en' => (clone $customers)->where('language', 'en')->count(),
                'pcm' => (clone $customers)->where('language', 'pcm')->count(),
            ],
            'purposes' => $purposes,
            'answered_purposes' => (clone $customers)->whereNotNull('onboarding_purposes')->count(),
        ];
    }

    // GET /admin/users?search=&status=&page=
    public function users(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $base = User::query()->where('role', 'user')
            // Name, @username, email or phone (any database).
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . mb_strtolower(ltrim($search, '@')) . '%';
                $q->where(fn ($w) => $w
                    ->whereRaw('LOWER(email) LIKE ?', [$like])
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like])
                    ->orWhereRaw('LOWER(username) LIKE ?', [$like]));
            })
            // signup=phone: joined with phone + PIN; signup=password: older email + password accounts.
            ->when($request->query('signup') === 'phone', fn ($q) => $q->whereNull('password'))
            ->when($request->query('signup') === 'password', fn ($q) => $q->whereNotNull('password'))
            ->when($request->query('tier') !== null && $request->query('tier') !== '', fn ($q) => $q->where('kyc_tier', (int) $request->query('tier')));
        $users = (clone $base)
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->withSum('wallets as total_balance', 'balance')
            ->withCount('wallets')
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        $all = User::where('role', 'user');
        $byStatus = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return $this->ok('Users fetched', [
            'users' => collect($users->items())->map(fn ($u) => $this->serializeUser($u) + [
                'total_balance' => number_format(($u->total_balance ?? 0) / 100, 2, '.', ''),
                'wallets_count' => (int) $u->wallets_count,
            ]),
            'pagination' => [
                'page' => $users->currentPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'last_page' => $users->lastPage(),
            ],
            // The page's summary: every customer, and the status counts for these filters.
            'summary' => [
                'total' => (clone $all)->count(),
                'active' => (clone $all)->where('status', 'active')->count(),
                'suspended' => (clone $all)->where('status', 'suspended')->count(),
                'new_7d' => (clone $all)->where('created_at', '>=', now()->subDays(7))->count(),
                'verified' => (clone $all)->where('kyc_tier', '>=', 1)->count(),
                'by_tier' => (clone $all)->selectRaw('kyc_tier, count(*) as n')->groupBy('kyc_tier')->orderBy('kyc_tier')->pluck('n', 'kyc_tier'),
                'by_status' => ['active' => (int) ($byStatus['active'] ?? 0), 'suspended' => (int) ($byStatus['suspended'] ?? 0)],
                'matching' => (int) $byStatus->sum(),
            ],
        ]);
    }

    // GET /admin/users/{user}
    public function user(User $user): JsonResponse
    {
        $walletIds = $user->wallets()->pluck('id');

        return $this->ok('User fetched', [
            'user' => $this->serializeUser($user),
            'wallets' => $user->wallets()->get()->map(fn ($w) => $this->serializeWallet($w)),
            'devices' => $user->devices()->latest('last_active_at')->get()->map(fn ($d) => [
                'device_name' => $d->device_name,
                'platform' => $d->platform,
                'last_active_at' => $d->last_active_at?->toIso8601String(),
            ]),
            'recent_transactions' => Transaction::whereIn('wallet_id', $walletIds)
                ->latest()->limit(20)->get()->map(fn ($t) => $this->serializeTransaction($t)),
            'loans' => Loan::where('user_id', $user->id)->latest()->get()
                ->map(fn ($l) => $this->serializeLoan($l)),
            'projects' => Project::with(['wallet', 'owner', 'vendor'])
                ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id))
                ->latest()->get()
                ->map(fn ($p) => $this->serializeProject($p, $user) + ['role' => $p->roleOf($user)]),
            'approvals' => ApprovalRequest::with(['wallet', 'initiator'])
                ->where('initiator_id', $user->id)->latest()->limit(10)->get()
                ->map(fn ($r) => $this->serializeApprovalRequest($r)),
            'kyc_submissions' => KycSubmission::where('user_id', $user->id)->latest()->get()
                ->map(fn ($s) => $this->serializeKycSubmission($s)),
            // Money the user has set to move on its own (Rules tab), and invites waiting.
            'automations' => AutomationRule::with(['fromWallet:id,name', 'toWallet:id,name'])
                ->where('user_id', $user->id)->latest()->get()
                ->map(fn (AutomationRule $r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'from_wallet' => $r->fromWallet?->name,
                    'to_wallet' => $r->toWallet?->name,
                    'amount' => number_format($r->amount / 100, 2, '.', ''),
                    'frequency' => $r->frequency,
                    'day_of_week' => $r->day_of_week,
                    'day_of_month' => $r->day_of_month,
                    'enabled' => (bool) $r->enabled,
                    'last_run_at' => $r->last_run_at?->toIso8601String(),
                    'next_run_on' => $r->nextRunOn(now())?->toDateString(),
                ]),
            // SND-14/15 payments set to go out on a date, and REQ/SPL money asked for either way.
            'scheduled_payments' => \App\Models\ScheduledPayment::with('fromWallet:id,name')
                ->where('user_id', $user->id)->latest()->limit(20)->get()
                ->map(fn (\App\Models\ScheduledPayment $p) => [
                    'id' => $p->id,
                    'to_name' => $p->to_name,
                    'kind' => $p->destination['kind'] ?? null,
                    'from_wallet' => $p->fromWallet?->name,
                    'amount' => number_format($p->amount / 100, 2, '.', ''),
                    'when' => $p->when(),
                    'status' => $p->status,
                    'runs' => $p->runs,
                    'ends_after' => $p->ends_after,
                    'next_run_at' => $p->next_run_at?->toIso8601String(),
                    'last_result' => $p->last_result,
                    'last_reason' => $p->last_reason,
                ]),
            'money_requests' => \App\Models\MoneyRequest::with(['requester:id,first_name,last_name,name', 'payer:id,first_name,last_name,name', 'wallet:id,name'])
                ->where(fn ($q) => $q->where('requester_id', $user->id)->orWhere('payer_user_id', $user->id))
                ->latest()->limit(20)->get()
                ->map(fn (\App\Models\MoneyRequest $r) => [
                    'code' => $r->code,
                    'direction' => $r->requester_id === $user->id ? 'asked' : 'asked_of',
                    'other' => $r->requester_id === $user->id ? $r->payerName() : $r->requester?->fullName(),
                    'other_on_patriai' => $r->requester_id === $user->id ? $r->payer_user_id !== null : true,
                    'wallet' => $r->wallet?->name,
                    'amount' => number_format($r->amount / 100, 2, '.', ''),
                    'paid_amount' => number_format($r->paid_amount / 100, 2, '.', ''),
                    'note' => $r->note,
                    'split' => $r->split_title,
                    'status' => $r->status,
                    'due_on' => $r->due_on?->toDateString(),
                    'created_at' => $r->created_at?->toIso8601String(),
                ]),
            'invitations' => WalletInvitation::with(['wallet:id,name', 'inviter:id,first_name,last_name,name'])
                ->where('status', 'pending')
                ->where(function ($q) use ($user) {
                    $q->where('inviter_id', $user->id)->orWhere('invitee_user_id', $user->id);
                    if ($user->phone) {
                        $q->orWhere('invitee_identifier', $user->phone);
                    }
                })
                ->latest()->limit(20)->get()
                ->map(fn (WalletInvitation $i) => [
                    'id' => $i->id,
                    'direction' => $i->inviter_id === $user->id ? 'sent' : 'received',
                    'wallet' => $i->wallet?->name,
                    'invitee' => $i->invitee_identifier,
                    'inviter' => $i->inviter?->fullName(),
                    'role' => $i->role,
                    'created_at' => $i->created_at?->toIso8601String(),
                    'expires_at' => $i->expires_at?->toIso8601String(),
                ]),
            'summary' => [
                'total_in' => number_format(
                    (int) Transaction::whereIn('wallet_id', $walletIds)
                        ->where('status', 'successful')->where('direction', 'credit')->sum('amount') / 100,
                    2, '.', ''
                ),
                'total_out' => number_format(
                    (int) Transaction::whereIn('wallet_id', $walletIds)
                        ->where('status', 'successful')->where('direction', 'debit')->sum('amount') / 100,
                    2, '.', ''
                ),
                'wallet_count' => $walletIds->count(),
            ],
        ]);
    }

    // PATCH /admin/users/{user}  { first_name?, last_name?, phone?, email? }
    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:80'],
            'last_name' => ['sometimes', 'string', 'max:80'],
            'phone' => ['sometimes', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($user->id)],
            'email' => ['sometimes', 'email', 'max:120', Rule::unique('users', 'email')->ignore($user->id)],
        ]);

        if ($user->isAdmin()) {
            return $this->fail('Cannot edit an admin account', 403);
        }

        $user->fill($data);
        // A new address must re-verify — don't let the verified badge survive an email swap.
        if ($user->isDirty('email')) {
            $user->email_verified_at = null;
        }
        $user->name = trim("{$user->first_name} {$user->last_name}");
        $user->save();

        return $this->ok('User updated', ['user' => $this->serializeUser($user)]);
    }

    // PATCH /admin/users/{user}/kyc-tier  { tier: 0..3 }
    public function setUserKycTier(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['tier' => ['required', 'integer', 'between:0,' . \App\Services\KycService::maxTier()]]);

        // kyc_tier is not mass-assignable (privilege field) — set it explicitly.
        $user->forceFill(['kyc_tier' => $data['tier']])->save();

        NotificationService::make()->push(
            $user,
            'kyc_tier_adjusted',
            'Verification tier updated',
            "Your verification tier was updated to Tier {$data['tier']} by support",
            ['kyc_tier' => (int) $data['tier']],
        );

        return $this->ok('KYC tier updated', ['user' => $this->serializeUser($user)]);
    }

    // PATCH /admin/users/{user}/status  { status: active|suspended }
    public function updateUserStatus(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:active,suspended']]);

        if ($user->isAdmin()) {
            return $this->fail('Cannot change an admin account status', 403);
        }

        // status is not mass-assignable (privilege field) — set it explicitly.
        $user->forceFill(['status' => $data['status']])->save();
        if ($data['status'] === 'suspended') {
            $user->tokens()->delete();
        }

        return $this->ok("User {$data['status']}", ['user' => $this->serializeUser($user)]);
    }

    // GET /admin/wallets
    public function wallets(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $filtered = Wallet::query()
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            // By wallet name, account number, or the owner's name or phone (any database).
            ->when($search !== '', fn ($q) => $q->where(function ($w) use ($search) {
                $like = '%' . mb_strtolower($search) . '%';
                $w->whereRaw('LOWER(name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(virtual_account) LIKE ?', [$like])
                    ->orWhereHas('owner', fn ($o) => $o->whereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like])->orWhere('phone', 'like', "%{$search}%"));
            }));
        $sort = $request->query('sort', 'newest');
        $wallets = (clone $filtered)->with('owner')
            // Members besides the owner: "shared with 3".
            ->withCount(['members as others_count' => fn ($m) => $m->where('status', 'active')->whereColumn('wallet_members.user_id', '!=', 'wallets.user_id')])
            ->when($sort === 'balance', fn ($q) => $q->orderByDesc('balance'), fn ($q) => $q->latest())
            ->paginate(min((int) $request->query('per_page', 20), 100));

        $naira = fn ($kobo) => number_format(((int) $kobo) / 100, 2, '.', '');
        $byType = Wallet::selectRaw('type, count(*) as n, sum(balance) as total')->groupBy('type')->get()
            ->mapWithKeys(fn ($r) => [$r->type => ['count' => (int) $r->n, 'balance' => $naira($r->total)]]);
        $byStatus = Wallet::selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return $this->ok('Wallets fetched', [
            'wallets' => collect($wallets->items())->map(fn ($w) => $this->serializeWallet($w, withOwner: true) + [
                'members_count' => (int) $w->others_count,
                'owner_phone' => $w->owner?->phone,
            ]),
            'pagination' => [
                'page' => $wallets->currentPage(),
                'per_page' => $wallets->perPage(),
                'total' => $wallets->total(),
                'last_page' => $wallets->lastPage(),
            ],
            // The page's summary: all wallets, and what the filters match.
            'summary' => [
                'total' => Wallet::count(),
                'total_balance' => $naira(Wallet::sum('balance')),
                'matching_balance' => $naira((clone $filtered)->sum('balance')),
                'shared' => Wallet::whereHas('members', fn ($m) => $m->where('status', 'active')->whereColumn('wallet_members.user_id', '!=', 'wallets.user_id'))->count(),
                'by_status' => [
                    'active' => (int) ($byStatus['active'] ?? 0),
                    'frozen' => (int) ($byStatus['frozen'] ?? 0),
                    'suspended' => (int) ($byStatus['suspended'] ?? 0),
                    'closed' => (int) ($byStatus['closed'] ?? 0),
                ],
                'by_type' => $byType,
            ],
        ]);
    }

    // GET /admin/transactions
    public function transactions(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        // Today / last 7 / last 30 days (Lagos).
        $since = match ($request->query('period')) {
            'today' => now('Africa/Lagos')->startOfDay()->utc(),
            '7d' => now('Africa/Lagos')->startOfDay()->subDays(6)->utc(),
            '30d' => now('Africa/Lagos')->startOfDay()->subDays(29)->utc(),
            default => null,
        };
        // Everything but the status, so the status tabs can show their counts.
        $base = Transaction::query()
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when(in_array($request->query('direction'), ['credit', 'debit'], true), fn ($q) => $q->where('direction', $request->query('direction')))
            ->when($since, fn ($q) => $q->where('created_at', '>=', $since))
            // Reference, description, wallet or owner (any database).
            ->when($search !== '', fn ($q) => $q->where(function ($w) use ($search) {
                $like = '%' . mb_strtolower($search) . '%';
                $w->whereRaw('LOWER(reference) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(description) LIKE ?', [$like])
                    ->orWhereHas('wallet', fn ($x) => $x->whereRaw('LOWER(name) LIKE ?', [$like])
                        ->orWhereHas('owner', fn ($o) => $o->whereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like])));
            }));
        $filtered = (clone $base)->when($request->query('status'), fn ($q, $s) => $q->where('status', $s));

        $txns = (clone $filtered)->with(['wallet.owner'])
            ->latest('id')
            ->paginate(min((int) $request->query('per_page', 20), 100));

        $naira = fn ($kobo) => number_format(((int) $kobo) / 100, 2, '.', '');
        $ok = (clone $filtered)->where('status', 'successful');
        $in = (int) (clone $ok)->where('direction', 'credit')->sum('amount');
        $out = (int) (clone $ok)->where('direction', 'debit')->sum('amount');
        $byStatus = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return $this->ok('Transactions fetched', [
            'transactions' => collect($txns->items())->map(fn ($t) => $this->serializeTransaction($t) + [
                'wallet' => [
                    'id' => $t->wallet->id,
                    'name' => $t->wallet->name,
                    'type' => $t->wallet->type,
                    'owner' => $t->wallet->owner->fullName(),
                ],
            ]),
            'pagination' => [
                'page' => $txns->currentPage(),
                'per_page' => $txns->perPage(),
                'total' => $txns->total(),
                'last_page' => $txns->lastPage(),
            ],
            // What the filters match: money in and out (successful only) and the counts per status.
            'summary' => [
                'money_in' => $naira($in),
                'money_out' => $naira($out),
                'net' => $naira($in - $out),
                'fees' => $naira((clone $ok)->sum('fee')),
                'by_status' => [
                    'successful' => (int) ($byStatus['successful'] ?? 0),
                    'pending' => (int) ($byStatus['pending'] ?? 0),
                    'failed' => (int) ($byStatus['failed'] ?? 0),
                ],
                'all' => (int) $byStatus->sum(),
            ],
        ]);
    }

    // GET /admin/approvals?status=
    public function approvals(Request $request): JsonResponse
    {
        $requests = ApprovalRequest::with(['wallet', 'initiator'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Approvals fetched', [
            'approvals' => collect($requests->items())->map(fn ($r) => [
                'id' => $r->id,
                'wallet' => $r->wallet ? ['id' => $r->wallet->id, 'name' => $r->wallet->name] : null,
                'initiator' => $r->initiator ? ['name' => $r->initiator->fullName(), 'email' => $r->initiator->email] : null,
                'action' => $r->action,
                'amount' => number_format($r->amount / 100, 2, '.', ''),
                'fee' => number_format($r->fee / 100, 2, '.', ''),
                'status' => $r->status,
                'approvals_count' => (int) $r->approvals_count,
                'required_approvals' => (int) $r->required_approvals,
                'created_at' => $r->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $requests->currentPage(),
                'per_page' => $requests->perPage(),
                'total' => $requests->total(),
                'last_page' => $requests->lastPage(),
            ],
        ]);
    }

    // GET /admin/wallets/{wallet}
    public function walletDetail(Wallet $wallet): JsonResponse
    {
        $members = $wallet->members()->with('user')->get()->map(fn ($m) => [
            'user_id' => $m->user_id,
            'name' => $m->user?->fullName(),
            'email' => $m->user?->email,
            'role' => $m->role,
            'can_approve' => (bool) $m->can_approve,
            'status' => $m->status,
        ]);

        return $this->ok('Wallet fetched', [
            'wallet' => $this->serializeWallet($wallet, withOwner: true),
            'members' => $members,
            'approval' => [
                'enabled' => (bool) $wallet->approval_enabled,
                'threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
                'required_approvals' => (int) $wallet->required_approvals,
            ],
            // People invited at creation (WCR-08) or later who haven't answered yet.
            'invitations' => $wallet->invitations()->with(['invitee', 'inviter'])
                ->where('status', 'pending')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->latest()->get()
                ->map(fn ($i) => [
                    'id' => $i->id,
                    'invitee' => $i->invitee?->fullName() ?: $i->invitee_identifier,
                    'role' => $i->role,
                    'inviter' => $i->inviter?->fullName(),
                    'created_at' => $i->created_at?->toIso8601String(),
                    'expires_at' => $i->expires_at?->toIso8601String(),
                ]),
            'recent_transactions' => $wallet->transactions()->latest()->limit(15)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
            // Savings and goal wallets: how everyone saves (salary share, round-ups, schedule) and missed saves.
            'savings_plan' => \App\Services\SavingsService::make()->invitationSummary($wallet),
            // Emergency wallets: lock state + whether the owner allowed a national-crisis override.
            'emergency' => $wallet->type === 'emergency' && $wallet->emergencySetting ? [
                'purpose' => $wallet->emergencySetting->purpose,
                'purposes' => $wallet->emergencySetting->purposes ?? [$wallet->emergencySetting->purpose],
                // EMG-03 keyholders (owner first) and how many must agree; EMG-04 fast release.
                'keyholders' => \App\Models\User::whereIn('id', $wallet->emergencySetting->dual_approval ? $wallet->emergencySetting->keyholders($wallet->user_id) : [$wallet->user_id])
                    ->get()->map(fn ($u) => $u->fullName())->values(),
                'required_keyholders' => $wallet->emergencySetting->dual_approval ? $wallet->emergencySetting->requiredYeses($wallet->user_id) : 1,
                'request_expiry_hours' => $wallet->emergencySetting->request_expiry_hours,
                'fast_release_limit' => $wallet->emergencySetting->fast_release_limit !== null ? number_format($wallet->emergencySetting->fast_release_limit / 100, 2, '.', '') : null,
                'fast_release_every_days' => $wallet->emergencySetting->fast_release_every_days,
                'manual_unlock' => $wallet->emergencySetting->manual_unlock,
                'unlock_on_document' => $wallet->emergencySetting->unlock_on_document,
                'beneficiaries' => $wallet->emergencyBeneficiaries()->with('user')->get()->map(fn ($b) => $b->user?->fullName())->filter()->values(),
                'pay_directly' => $wallet->emergencySetting->pay_directly,
                // EMG-05: people without the app who can ask for a release from an SMS link.
                'trusted_contacts' => $wallet->emergencyTrustedContacts()->orderBy('id')->get()->map(fn ($c) => trim($c->name . ($c->relation ? " ({$c->relation})" : '')))->values(),
                'locked' => $wallet->emergencySetting->isLocked(),
                'unlocked_at' => $wallet->emergencySetting->unlocked_at?->toIso8601String(),
                'unlocked_via' => $wallet->emergencySetting->unlocked_via,
                'override_national_crisis' => $wallet->emergencySetting->override_national_crisis,
            ] : null,
            // Spending wallets (SPD/WAL-09): the budget this period, by category, and who may spend what.
            'budget' => $wallet->budget() ? \App\Services\BudgetService::make()->detail($wallet, $wallet->owner) : null,
            // Giving wallets (GIV/WAL-18): set aside, given, coming up, pledge, recipients, settings.
            'giving' => $wallet->type === 'giving' ? \App\Services\GivingService::make()->detail($wallet) : null,
            // CHD-07/12: the child's tasks and rewards.
            'child_tasks' => $wallet->type === 'child' ? \App\Services\ChildTaskService::make()->list($wallet) : null,
            // Savings broken early pay a fee, half to the charity picked (SAV-05).
            'early_break' => ($lock = $wallet->savingsLock()) && $lock['early_break'] ? [
                'fee_percent' => $lock['fee_percent'],
                'charity' => $lock['charity_id'] ? \App\Models\Organisation::find($lock['charity_id'])?->name : null,
            ] : null,
            // WAL-12 how the wallet shows (paused by, suspended, locked, archived) as its owner sees it.
            'state' => \App\Services\WalletManageService::make()->state($wallet, $wallet->owner),
            'paused_by' => isset($wallet->meta['paused']['by']) ? User::find($wallet->meta['paused']['by'])?->fullName() : null,
            'suspended' => $wallet->meta['suspended'] ?? null,
            'closed' => isset($wallet->meta['closed']) ? [...$wallet->meta['closed'], ...[
                'by_name' => User::find($wallet->meta['closed']['by'] ?? 0)?->fullName(),
                'moved' => collect($wallet->meta['closed']['moved'] ?? [])->map(fn ($m) => [
                    'to' => User::find($m['user_id'] ?? 0)?->fullName(),
                    'wallet' => $m['wallet'] ?? null,
                    'amount' => number_format(((int) ($m['amount'] ?? 0)) / 100, 2, '.', ''),
                ])->values(),
            ]] : null,
            // WAL-08: named approvers and a rule change waiting for the other owners.
            'named_approvers' => $wallet->approvalMode() === 'named' ? User::whereIn('id', $wallet->namedApprovers())->get()->map(fn ($u) => $u->fullName())->values() : null,
            'pending_change' => ($p = $wallet->approvalRequests()->with(['wallet', 'initiator'])->where('status', 'pending')->whereIn('action', \App\Services\ApprovalService::GOVERNANCE_ACTIONS)->latest()->first())
                ? $this->serializeApprovalRequest($p) : null,
            // WAL-14: the latest of the append-only audit log.
            'audit_log' => \App\Models\WalletAuditLog::with('actor')->where('wallet_id', $wallet->id)->latest()->orderByDesc('id')->limit(30)->get()
                ->map(fn ($l) => \App\Http\Controllers\Api\WalletAuditLogController::serialize($l)),
        ]);
    }

    // GET /admin/loans?status=
    public function loans(Request $request): JsonResponse
    {
        $loans = Loan::with('user')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Loans fetched', [
            'loans' => collect($loans->items())->map(fn ($l) => [
                'id' => $l->id,
                'reference' => $l->reference,
                'user' => $l->user ? ['name' => $l->user->fullName(), 'email' => $l->user->email] : null,
                'category' => $l->category,
                'principal' => number_format($l->principal / 100, 2, '.', ''),
                'total_repayable' => number_format($l->total_repayable / 100, 2, '.', ''),
                'outstanding' => number_format($l->outstanding / 100, 2, '.', ''),
                'status' => $l->status,
                'created_at' => $l->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $loans->currentPage(),
                'per_page' => $loans->perPage(),
                'total' => $loans->total(),
                'last_page' => $loans->lastPage(),
            ],
        ]);
    }

    // GET /admin/loans/{loan}
    public function loanShow(Loan $loan): JsonResponse
    {
        $loan->load('user');

        return $this->ok('Loan fetched', [
            'loan' => $this->serializeLoan($loan),
            'user' => $loan->user ? [
                'id' => $loan->user->id,
                'name' => $loan->user->fullName(),
                'email' => $loan->user->email,
                'kyc_tier' => $loan->user->kyc_tier,
            ] : null,
            'repayments' => $loan->repayments()->orderBy('sequence')->get()
                ->map(fn ($r) => $this->serializeLoanRepayment($r)),
        ]);
    }

    // POST /admin/loans/{loan}/approve
    public function approveLoan(Request $request, Loan $loan): JsonResponse
    {
        $loan = LoanService::make()->approveAndDisburse($loan, $request->user());

        return $this->ok('Loan approved and disbursed', ['loan' => $this->serializeLoan($loan)]);
    }

    // POST /admin/loans/{loan}/reject  { reason }
    public function rejectLoan(Request $request, Loan $loan): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);

        $loan = LoanService::make()->reject($loan, $request->user(), $data['reason']);

        return $this->ok('Loan rejected', ['loan' => $this->serializeLoan($loan)]);
    }

    // POST /admin/loans/{loan}/default
    public function defaultLoan(Request $request, Loan $loan): JsonResponse
    {
        $loan = LoanService::make()->markDefaulted($loan, $request->user());

        return $this->ok('Loan marked as defaulted', ['loan' => $this->serializeLoan($loan)]);
    }

    // POST /admin/loans/run-due
    public function runDueLoans(): JsonResponse
    {
        return $this->ok('Overdue loans processed', LoanService::make()->accrueOverdue());
    }

    // POST /admin/loans/{loan}/recover  { wallet_id, amount, reason? }
    public function recoverLoan(Request $request, Loan $loan): JsonResponse
    {
        $data = $request->validate([
            'wallet_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reason' => ['nullable', 'string', 'max:200'],
        ]);

        // The recovery wallet must belong to the borrower — funds are pulled from
        // the borrower to settle their own loan.
        $wallet = Wallet::where('id', $data['wallet_id'])
            ->where('user_id', $loan->user_id)
            ->first();
        if (!$wallet) {
            return $this->fail('Wallet does not belong to the borrower', 422);
        }

        // Overdraft-guarded, row-locked debit inside LoanService/WalletService.
        $result = LoanService::make()->recover($loan, $request->user(), $wallet, $this->toKobo($data['amount']));

        return $this->ok('Loan recovery successful', ['loan' => $this->serializeLoan($result['loan'])]);
    }

    // GET /admin/projects?status=
    public function projects(Request $request): JsonResponse
    {
        $projects = Project::with(['owner', 'vendor', 'wallet'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Projects fetched', [
            'projects' => collect($projects->items())->map(fn ($p) => [
                'id' => $p->id,
                'title' => $p->title,
                'owner' => $p->owner ? ['name' => $p->owner->fullName()] : null,
                'vendor' => $p->vendor ? ['name' => $p->vendor->fullName()] : null,
                'budget' => number_format($p->budget / 100, 2, '.', ''),
                'wallet_balance' => $p->wallet ? $p->wallet->balanceNaira() : number_format(0, 2, '.', ''),
                'reserved' => number_format($p->reservedAmount() / 100, 2, '.', ''),
                'released' => number_format($p->releasedAmount() / 100, 2, '.', ''),
                'status' => $p->status,
                'milestones_count' => (int) $p->milestones()->count(),
                'created_at' => $p->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $projects->currentPage(),
                'per_page' => $projects->perPage(),
                'total' => $projects->total(),
                'last_page' => $projects->lastPage(),
            ],
        ]);
    }

    // GET /admin/projects/{project}
    public function projectShow(Project $project): JsonResponse
    {
        $project->load(['owner', 'vendor', 'wallet', 'milestones' => fn ($q) => $q->orderBy('sequence')]);

        return $this->ok('Project fetched', [
            'project' => $this->serializeProject($project),
            'owner' => $project->owner ? [
                'id' => $project->owner->id,
                'name' => $project->owner->fullName(),
                'email' => $project->owner->email,
            ] : null,
            'vendor' => $project->vendor ? [
                'id' => $project->vendor->id,
                'name' => $project->vendor->fullName(),
                'email' => $project->vendor->email,
            ] : null,
            'wallet' => $this->serializeWallet($project->wallet, withOwner: true),
            'milestones' => $project->milestones->map(fn ($m) => $this->serializeMilestone($m))->values(),
            // MLS-03 who approves; VPJ the builder's proposal it came from; CHT-03 the chat, kept as a record.
            'approvals' => $this->projectApprovals($project),
            'proposal' => ($pp = \App\Models\ProjectProposal::where('project_id', $project->id)->first()) ? [
                'id' => $pp->id,
                'total' => number_format($pp->total / 100, 2, '.', ''),
                'phases' => count($pp->phases),
                'terms' => $pp->terms,
                'sent_at' => $pp->sent_at?->toIso8601String(),
                'accepted_at' => $pp->responded_at?->toIso8601String(),
            ] : null,
            'messages' => \App\Models\ProjectMessage::with('user')->where('project_id', $project->id)->latest('id')->limit(40)->get()->reverse()->map(fn ($m) => [
                'id' => $m->id,
                'kind' => $m->kind,
                'by' => $m->user?->fullName() ?? ($m->kind === 'steward' ? 'Steward' : 'Patriai'),
                'body' => $m->body,
                'at' => $m->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    private function projectApprovals(Project $project): array
    {
        $svc = \App\Services\ProjectApprovalService::make();
        $rules = $svc->rulesFor($project);
        $names = fn (array $ids) => \App\Models\User::whereIn('id', $ids)->get()->map(fn ($u) => $u->fullName())->values();

        return [
            'custom' => $svc->custom($project),
            'mode' => $rules['mode'],
            'needed' => $rules['needed'],
            'approvers' => $names($rules['approver_ids']),
            'overrides' => collect($project->meta['approvals']['overrides'] ?? [])->map(fn ($o, $mid) => [
                'milestone' => $project->milestones->firstWhere('id', (int) $mid)?->title,
                'needed' => (int) $o['needed'],
                'approvers' => $names($o['approver_ids']),
            ])->values(),
            'site_photo_over' => isset($project->meta['approvals']['site_photo_over']) ? number_format($project->meta['approvals']['site_photo_over'] / 100, 2, '.', '') : null,
        ];
    }

    // GET /admin/kyc?status=
    public function kyc(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $base = KycSubmission::query()
            ->when($request->query('tier'), fn ($q, $t) => $q->where('target_tier', (int) $t))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . mb_strtolower(ltrim($search, '#')) . '%';
                $q->where(function ($w) use ($search, $like) {
                    $w->whereHas('user', fn ($u) => $u->whereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like])
                        ->orWhereRaw('LOWER(email) LIKE ?', [$like])->orWhere('phone', 'like', "%{$search}%"));
                    if (ctype_digit(ltrim($search, '#'))) {
                        $w->orWhere('id', (int) ltrim($search, '#'));
                    }
                });
            });
        $submissions = (clone $base)->with('user')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            // The queue reads oldest first; everything else newest first.
            ->when($request->query('status') === 'pending', fn ($q) => $q->oldest(), fn ($q) => $q->latest())
            ->paginate(min((int) $request->query('per_page', 20), 100));
        $byStatus = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $oldest = KycSubmission::where('status', 'pending')->oldest()->value('created_at');
        $reviewed30 = KycSubmission::whereIn('status', ['approved', 'rejected'])->where('reviewed_at', '>=', now()->subDays(30));

        return $this->ok('KYC submissions fetched', [
            'submissions' => collect($submissions->items())->map(fn ($s) => [
                'id' => $s->id,
                'user' => $s->user ? ['id' => $s->user->id, 'name' => $s->user->fullName(), 'email' => $s->user->email, 'phone' => $s->user->phone, 'tier' => (int) $s->user->kyc_tier] : null,
                'target_tier' => (int) $s->target_tier,
                'tier_name' => \App\Services\LimitService::make()->tier((int) $s->target_tier)['name'] ?? "Tier {$s->target_tier}",
                'needs' => \App\Services\LimitService::make()->tier((int) $s->target_tier)['needs'] ?? null,
                'type' => $s->type,
                'status' => $s->status,
                'review_note' => $s->review_note ?? null,
                'reviewed_at' => $s->reviewed_at?->toIso8601String(),
                'created_at' => $s->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $submissions->currentPage(),
                'per_page' => $submissions->perPage(),
                'total' => $submissions->total(),
                'last_page' => $submissions->lastPage(),
            ],
            'summary' => [
                'by_status' => [
                    'pending' => (int) ($byStatus['pending'] ?? 0),
                    'approved' => (int) ($byStatus['approved'] ?? 0),
                    'rejected' => (int) ($byStatus['rejected'] ?? 0),
                ],
                'all' => (int) $byStatus->sum(),
                'oldest_pending_at' => $oldest ? \Illuminate\Support\Carbon::parse($oldest)->toIso8601String() : null,
                'approved_30d' => (clone $reviewed30)->where('status', 'approved')->count(),
                'rejected_30d' => (clone $reviewed30)->where('status', 'rejected')->count(),
                'pending_by_tier' => KycSubmission::where('status', 'pending')->selectRaw('target_tier, count(*) as n')->groupBy('target_tier')->pluck('n', 'target_tier'),
            ],
        ]);
    }

    // GET /admin/kyc/{submission}
    public function kycShow(KycSubmission $submission): JsonResponse
    {
        $submission->load('user');

        return $this->ok('KYC submission fetched', [
            'submission' => $this->serializeKycSubmission($submission, withPayload: true) + [
                // Selfie, ID and proof of address, fetched from /admin/kyc/{id}/files/{key}.
                'files' => collect(\App\Services\KycService::FILES)->filter(fn ($k) => !empty($submission->payload[$k]))->values(),
            ],
            'user' => $submission->user ? [
                'id' => $submission->user->id,
                'name' => $submission->user->fullName(),
                'email' => $submission->user->email,
                'kyc_tier' => (int) $submission->user->kyc_tier,
            ] : null,
        ]);
    }

    // POST /admin/kyc/{submission}/approve
    public function approveKyc(Request $request, KycSubmission $submission): JsonResponse
    {
        $submission = KycService::make()->approve($submission, $request->user());

        return $this->ok('KYC approved', ['submission' => $this->serializeKycSubmission($submission)]);
    }

    // POST /admin/kyc/{submission}/reject  { note? }
    public function rejectKyc(Request $request, KycSubmission $submission): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:200']]);

        $submission = KycService::make()->reject($submission, $request->user(), $data['note'] ?? null);

        return $this->ok('KYC rejected', ['submission' => $this->serializeKycSubmission($submission)]);
    }

    // POST /admin/wallets/{wallet}/adjust  { direction: credit|debit, amount, reason }
    public function adjustWallet(Request $request, Wallet $wallet): JsonResponse
    {
        $data = $request->validate([
            'direction' => ['required', 'in:credit,debit'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reason' => ['required', 'string', 'max:200'],
        ]);

        if ($wallet->owner->isAdmin()) {
            return $this->fail('Cannot adjust an admin-owned wallet', 403);
        }

        $admin = $request->user();
        $amountKobo = $this->toKobo($data['amount']);
        $reason = $data['reason'];
        $meta = ['kind' => 'admin_adjustment', 'reason' => $reason, 'by' => $admin->id];

        if ($data['direction'] === 'credit') {
            $txn = WalletService::make()->credit(
                $wallet,
                $amountKobo,
                'admin_credit',
                $meta,
                null,
                "Admin credit: {$reason}",
                $admin->id,
            );
        } else {
            // Overdraft-guarded: throws ValidationException (422) if insufficient balance.
            $txn = WalletService::make()->debit(
                $wallet,
                $amountKobo,
                0,
                'admin_debit',
                $meta,
                "Admin debit: {$reason}",
                $admin->id,
            );
        }

        NotificationService::make()->push(
            $wallet->owner,
            'admin_adjustment',
            'Wallet adjustment',
            ($data['direction'] === 'credit' ? 'Your wallet was credited ₦' : 'Your wallet was debited ₦')
                . number_format($amountKobo / 100, 2, '.', '') . " by support: {$reason}",
            [
                'wallet_id' => $wallet->id,
                'direction' => $data['direction'],
                'transaction_reference' => $txn->reference,
            ],
        );

        return $this->ok('Wallet adjusted', [
            'transaction' => $this->serializeTransaction($txn),
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
        ]);
    }

    // PATCH /admin/wallets/{wallet}/status  { status: active|frozen|closed }
    public function updateWalletStatus(Request $request, Wallet $wallet): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:' . implode(',', Wallet::STATUSES)],
            'reason' => ['nullable', 'string', 'max:200'],
        ]);
        $status = $data['status'];
        if ($status === $wallet->status) {
            return $this->fail("The wallet is already {$status}", 422);
        }
        if ($wallet->type === 'main' && $status === 'closed') {
            return $this->fail('A main wallet cannot be archived', 422);
        }

        // WAL-12 "Suspended — we stopped this wallet to protect it" is Patriai's; a pause is the owner's.
        $meta = $wallet->meta ?? [];
        unset($meta['suspended'], $meta['paused']);
        if ($status === 'suspended') {
            $meta['suspended'] = ['at' => now()->toIso8601String(), 'by_admin' => $request->user()->id, 'reason' => $data['reason'] ?? null];
        } elseif ($status === 'frozen') {
            $meta['paused'] = ['by' => null, 'at' => now()->toIso8601String()];
        } elseif ($status === 'closed') {
            $meta['closed'] = ['mode' => 'archive', 'at' => now()->toIso8601String(), 'by' => null, 'moved' => []];
        } else {
            unset($meta['closed']);
        }
        $wallet->update(['status' => $status, 'meta' => $meta ?: null]);

        $words = [
            'active' => ['wallet_restored', 'restored the wallet', 'is open again'],
            'frozen' => ['wallet_frozen', 'paused the wallet', 'was paused by Patriai support'],
            'suspended' => ['wallet_suspended', 'suspended the wallet', 'was stopped to protect it. Your money is safe; talk to support'],
            'closed' => ['wallet_archived', 'archived the wallet', 'was archived by Patriai support'],
        ][$status];
        \App\Services\AuditService::make()->log($wallet, null, $words[0], ucfirst($words[1]), ['summary' => $words[1], 'detail' => $data['reason'] ?? null, 'admin_id' => $request->user()->id]);

        $people = $wallet->members()->where('status', 'active')->pluck('user_id')->push($wallet->user_id)->unique();
        foreach (User::whereIn('id', $people)->get() as $person) {
            NotificationService::make()->push(
                $person,
                'wallet_status_changed',
                $status === 'suspended' ? "{$wallet->name} is suspended" : 'Wallet status updated',
                "{$wallet->name} {$words[2]}.",
                ['wallet_id' => $wallet->id, 'status' => $status],
            );
        }

        return $this->ok("Wallet {$status}", [
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
        ]);
    }

    // GET /admin/transactions/{transaction}
    public function transactionShow(Transaction $transaction): JsonResponse
    {
        $transaction->load(['wallet.owner', 'user']);

        $ref = $transaction->reference;
        $meta = $transaction->meta ?? [];
        $cp = $transaction->counterparty ?? [];

        // References this transaction itself points at (its transfer pair / its reversal counterpart).
        $linkedRefs = array_values(array_filter([
            $meta['pair_reference'] ?? null,
            $meta['reversal_reference'] ?? null,
            $meta['original_reference'] ?? null,
            $cp['original_reference'] ?? null,
        ]));

        $related = Transaction::where('id', '!=', $transaction->id)
            ->where(function ($q) use ($ref, $linkedRefs) {
                $q->where('meta->pair_reference', $ref)
                    ->orWhere('meta->original_reference', $ref)
                    ->orWhere('meta->reversal_reference', $ref)
                    ->orWhere('counterparty->original_reference', $ref);
                if ($linkedRefs) {
                    $q->orWhereIn('reference', $linkedRefs);
                }
            })
            ->latest()
            ->get()
            ->map(fn ($t) => $this->serializeTransaction($t));

        $reversible = $transaction->status === 'successful'
            && empty($meta['reversed'])
            && $transaction->type !== 'reversal';

        $wallet = $transaction->wallet;

        return $this->ok('Transaction fetched', [
            'transaction' => $this->serializeTransaction($transaction),
            'wallet' => $wallet ? [
                'id' => $wallet->id,
                'name' => $wallet->name,
                'type' => $wallet->type,
                'status' => $wallet->status,
                'owner' => $wallet->owner ? [
                    'id' => $wallet->owner->id,
                    'name' => $wallet->owner->fullName(),
                    'email' => $wallet->owner->email,
                ] : null,
            ] : null,
            'initiator' => $transaction->user ? [
                'id' => $transaction->user->id,
                'name' => $transaction->user->fullName(),
                'email' => $transaction->user->email,
            ] : null,
            'related' => $related,
            'reversible' => $reversible,
        ]);
    }

    // POST /admin/transactions/{transaction}/reverse  { reason }
    public function reverseTransaction(Request $request, Transaction $transaction): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);

        $meta = $transaction->meta ?? [];

        // A withdrawal left 'pending' with needs_reconciliation is a stuck payout
        // (banking timeout, outcome unknown). Reversing it refunds the wallet and
        // marks the txn failed — the manual counterpart to banking:reconcile.
        $isStuckPayout = $transaction->status === 'pending' && !empty($meta['needs_reconciliation']);

        if ($transaction->status !== 'successful' && !$isStuckPayout) {
            return $this->fail('Only successful transactions can be reversed', 422);
        }
        if (!empty($meta['reversed'])) {
            return $this->fail('Transaction has already been reversed', 422);
        }
        if ($transaction->type === 'reversal') {
            return $this->fail('A reversal cannot itself be reversed', 422);
        }

        $admin = $request->user();
        $wallet = $transaction->wallet;
        $reason = $data['reason'];
        $counterparty = [
            'kind' => 'reversal',
            'original_reference' => $transaction->reference,
            'reason' => $reason,
            'by' => $admin->id,
        ];

        // Reversal-first (doc §16.3): original row preserved, a compensating entry is written.
        // Both the compensating money move and the meta stamp are atomic.
        $reversal = DB::transaction(function () use ($transaction, $admin, $reason, $counterparty) {
            // Re-load under a row lock and re-assert the guards INSIDE the critical
            // section so a concurrent banking:reconcile (or a duplicate reverse)
            // cannot double-refund the same stuck payout.
            $locked = Transaction::whereKey($transaction->id)->lockForUpdate()->first();
            $lockedMeta = $locked->meta ?? [];
            $stuck = $locked->status === 'pending' && !empty($lockedMeta['needs_reconciliation']);

            if ($locked->status !== 'successful' && !$stuck) {
                throw \Illuminate\Validation\ValidationException::withMessages(['transaction' => 'Transaction is no longer reversible.']);
            }
            if (!empty($lockedMeta['reversed']) || !empty($lockedMeta['refunded'])) {
                throw \Illuminate\Validation\ValidationException::withMessages(['transaction' => 'Transaction has already been reversed.']);
            }

            $wallet = $locked->wallet;

            if ($locked->direction === 'debit') {
                $rev = WalletService::make()->credit(
                    $wallet,
                    $locked->amount + $locked->fee,
                    'reversal',
                    $counterparty,
                    null,
                    "Reversal: {$reason}",
                    $admin->id,
                );
            } else {
                // May throw ValidationException (422) if the credited funds were already spent.
                $rev = WalletService::make()->debit(
                    $wallet,
                    $locked->amount,
                    0,
                    'reversal',
                    $counterparty,
                    "Reversal: {$reason}",
                    $admin->id,
                );
            }

            $locked->update([
                // A reversed stuck payout is now definitively failed; a reversed
                // successful txn keeps its original status (reversal-first ledger).
                'status' => $stuck ? 'failed' : $locked->status,
                'meta' => array_merge($lockedMeta, [
                    'reversed' => true,
                    'reversal_reference' => $rev->reference,
                    'reversed_by' => $admin->id,
                    'reversed_at' => now()->toIso8601String(),
                ]),
            ]);

            return $rev;
        });

        NotificationService::make()->push(
            $wallet->owner,
            'transaction_reversed',
            'Transaction reversed',
            "Transaction {$transaction->reference} was reversed by support: {$reason}",
            [
                'transaction_reference' => $transaction->reference,
                'reversal_reference' => $reversal->reference,
            ],
        );

        return $this->ok('Transaction reversed', [
            'original' => $this->serializeTransaction($transaction->refresh()),
            'reversal' => $this->serializeTransaction($reversal),
        ]);
    }

    // GET /admin/approvals/{approvalRequest}
    public function approvalShow(ApprovalRequest $approvalRequest): JsonResponse
    {
        $approvalRequest->load(['wallet', 'initiator', 'responses.approver']);

        return $this->ok('Approval request fetched', [
            'approval' => $this->serializeApprovalRequest($approvalRequest),
            'responses' => $approvalRequest->responses->map(fn ($r) => [
                'approver' => ['name' => $r->approver?->fullName()],
                'decision' => $r->decision,
                'note' => $r->note,
                'created_at' => $r->created_at?->toIso8601String(),
            ]),
        ]);
    }

    // POST /admin/notifications/broadcast  { title, body, target: all|user, user_id? }
    public function broadcastNotification(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'body' => ['required', 'string', 'max:500'],
            'target' => ['required', 'in:all,user'],
            'user_id' => ['required_if:target,user', 'integer', 'exists:users,id'],
        ]);

        if ($data['target'] === 'user') {
            $user = User::findOrFail($data['user_id']);
            NotificationService::make()->push($user, 'admin_message', $data['title'], $data['body']);

            return $this->ok('Notification sent', ['sent' => 1]);
        }

        $now = now();
        $sent = 0;

        User::where('role', 'user')->select('id')->chunkById(500, function ($users) use ($data, $now, &$sent) {
            $rows = $users->map(fn ($u) => [
                'user_id' => $u->id,
                'type' => 'admin_message',
                'title' => $data['title'],
                'body' => $data['body'],
                'data' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all();

            AppNotification::insert($rows);
            $sent += count($rows);
        });

        return $this->ok('Broadcast sent', ['sent' => $sent]);
    }

    // ---- Support requests (backend-team escalations) ------------------------

    /** Allowed forward-only status transitions. */
    private const SUPPORT_TRANSITIONS = [
        'pending' => ['in_review'],
        'in_review' => ['resolved'],
        'resolved' => ['closed'],
        'closed' => [],
    ];

    // GET /admin/support-requests?status=&category=&priority=&search=&per_page=
    public function supportRequests(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $base = SupportRequest::query()
            ->when($request->query('category'), fn ($q, $c) => $q->where('category', $c))
            ->when($request->query('priority'), fn ($q, $p) => $q->where('priority', $p))
            // #id, subject, reference or the person's name (any database).
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . mb_strtolower(ltrim($search, '#')) . '%';
                $q->where(function ($w) use ($search, $like) {
                    $w->whereRaw('LOWER(subject) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(reference) LIKE ?', [$like])
                        ->orWhereHas('user', fn ($u) => $u->whereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like]));
                    if (ctype_digit(ltrim($search, '#'))) {
                        $w->orWhere('id', (int) ltrim($search, '#'));
                    }
                });
            });
        $items = (clone $base)->with('user')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));
        $byStatus = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');
        $open = SupportRequest::whereIn('status', ['pending', 'in_review']);

        return $this->ok('Support requests fetched', [
            'support_requests' => collect($items->items())->map(fn ($r) => $this->serializeSupportRequest($r)),
            'pagination' => [
                'page' => $items->currentPage(),
                'per_page' => $items->perPage(),
                'total' => $items->total(),
                'last_page' => $items->lastPage(),
            ],
            'summary' => [
                'by_status' => [
                    'pending' => (int) ($byStatus['pending'] ?? 0),
                    'in_review' => (int) ($byStatus['in_review'] ?? 0),
                    'resolved' => (int) ($byStatus['resolved'] ?? 0),
                    'closed' => (int) ($byStatus['closed'] ?? 0),
                ],
                'all' => (int) $byStatus->sum(),
                'open' => (clone $open)->count(),
                'open_high' => (clone $open)->where('priority', 'high')->count(),
                'oldest_open_at' => ($o = (clone $open)->oldest()->value('created_at')) ? \Illuminate\Support\Carbon::parse($o)->toIso8601String() : null,
                'resolved_7d' => SupportRequest::whereIn('status', ['resolved', 'closed'])->where('updated_at', '>=', now()->subDays(7))->count(),
            ],
        ]);
    }

    // GET /admin/support-requests/{supportRequest}
    public function supportRequestShow(SupportRequest $supportRequest): JsonResponse
    {
        return $this->ok('Support request fetched', [
            'support_request' => $this->serializeSupportRequest($supportRequest->load('user'), withDescription: true),
        ]);
    }

    // PATCH /admin/support-requests/{supportRequest}/status  { status }
    public function updateSupportRequestStatus(Request $request, SupportRequest $supportRequest): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(SupportRequest::STATUSES)],
        ]);

        $from = $supportRequest->status;
        $to = $data['status'];

        // Forward-only transitions; a no-op to the same status is a 422 too.
        if (!in_array($to, self::SUPPORT_TRANSITIONS[$from] ?? [], true)) {
            return $this->fail("Cannot change a {$from} request to {$to}.", 422);
        }

        $supportRequest->update(['status' => $to]);

        // Notify the requesting user — no sensitive details.
        if ($supportRequest->user) {
            NotificationService::make()->push(
                $supportRequest->user,
                'support_request_updated',
                'Support request #'.$supportRequest->id.' updated',
                $this->supportStatusMessage($supportRequest->id, $to),
                ['support_request_id' => $supportRequest->id, 'status' => $to],
            );
        }

        return $this->ok('Support request updated', [
            'support_request' => $this->serializeSupportRequest($supportRequest->refresh()->load('user'), withDescription: true),
        ]);
    }

    private function supportStatusMessage(int $id, string $status): string
    {
        return match ($status) {
            'in_review' => "Your support request #{$id} is now being reviewed.",
            'resolved' => "Your support request #{$id} has been resolved.",
            'closed' => "Your support request #{$id} has been closed.",
            default => "Your support request #{$id} status is now {$status}.",
        };
    }

    /**
     * Serialize a support request for admins. Subject/description/reference are
     * re-run through SupportService's redaction so no secret or full bank account
     * number is ever exposed, regardless of how the row was created.
     */
    private function serializeSupportRequest(SupportRequest $r, bool $withDescription = false): array
    {
        $support = SupportService::make();
        $description = $support->redact((string) $r->description);

        $data = [
            'id' => $r->id,
            'user' => $r->user ? [
                'id' => $r->user->id,
                'name' => $r->user->fullName(),
                'email' => $r->user->email,
            ] : null,
            'subject' => $support->redact((string) $r->subject),
            'category' => $r->category,
            'description_preview' => mb_strlen($description) > 120 ? mb_substr($description, 0, 120).'…' : $description,
            'reference' => $r->reference !== null ? $support->redact((string) $r->reference) : null,
            'priority' => $r->priority,
            'status' => $r->status,
            'created_at' => $r->created_at?->toIso8601String(),
            'updated_at' => $r->updated_at?->toIso8601String(),
        ];

        if ($withDescription) {
            $data['description'] = $description;
        }

        return $data;
    }
}
