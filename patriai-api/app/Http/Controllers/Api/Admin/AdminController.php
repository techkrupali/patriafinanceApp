<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\ApprovalRequest;
use App\Models\Loan;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\LoanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        ]);
    }

    // GET /admin/users?search=&status=&page=
    public function users(Request $request): JsonResponse
    {
        $users = User::query()
            ->when($request->query('search'), function ($q, $s) {
                $q->where(fn ($w) => $w
                    ->where('email', 'ilike', "%{$s}%")
                    ->orWhere('phone', 'ilike', "%{$s}%")
                    ->orWhere('first_name', 'ilike', "%{$s}%")
                    ->orWhere('last_name', 'ilike', "%{$s}%"));
            })
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->withSum('wallets as total_balance', 'balance')
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Users fetched', [
            'users' => collect($users->items())->map(fn ($u) => $this->serializeUser($u) + [
                'total_balance' => number_format(($u->total_balance ?? 0) / 100, 2, '.', ''),
            ]),
            'pagination' => [
                'page' => $users->currentPage(),
                'per_page' => $users->perPage(),
                'total' => $users->total(),
                'last_page' => $users->lastPage(),
            ],
        ]);
    }

    // GET /admin/users/{user}
    public function user(User $user): JsonResponse
    {
        return $this->ok('User fetched', [
            'user' => $this->serializeUser($user),
            'wallets' => $user->wallets()->get()->map(fn ($w) => $this->serializeWallet($w)),
            'devices' => $user->devices()->latest('last_active_at')->get()->map(fn ($d) => [
                'device_name' => $d->device_name,
                'platform' => $d->platform,
                'last_active_at' => $d->last_active_at?->toIso8601String(),
            ]),
            'recent_transactions' => Transaction::whereIn('wallet_id', $user->wallets()->pluck('id'))
                ->latest()->limit(20)->get()->map(fn ($t) => $this->serializeTransaction($t)),
        ]);
    }

    // PATCH /admin/users/{user}/status  { status: active|suspended }
    public function updateUserStatus(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:active,suspended']]);

        if ($user->isAdmin()) {
            return $this->fail('Cannot change an admin account status', 403);
        }

        $user->update(['status' => $data['status']]);
        if ($data['status'] === 'suspended') {
            $user->tokens()->delete();
        }

        return $this->ok("User {$data['status']}", ['user' => $this->serializeUser($user)]);
    }

    // GET /admin/wallets
    public function wallets(Request $request): JsonResponse
    {
        $wallets = Wallet::with('owner')
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('search'), fn ($q, $s) => $q->where('virtual_account', 'ilike', "%{$s}%"))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Wallets fetched', [
            'wallets' => collect($wallets->items())->map(fn ($w) => $this->serializeWallet($w, withOwner: true)),
            'pagination' => [
                'page' => $wallets->currentPage(),
                'per_page' => $wallets->perPage(),
                'total' => $wallets->total(),
                'last_page' => $wallets->lastPage(),
            ],
        ]);
    }

    // GET /admin/transactions
    public function transactions(Request $request): JsonResponse
    {
        $txns = Transaction::with(['wallet.owner'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('search'), fn ($q, $s) => $q->where('reference', 'ilike', "%{$s}%"))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

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
            'recent_transactions' => $wallet->transactions()->latest()->limit(15)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
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
}
