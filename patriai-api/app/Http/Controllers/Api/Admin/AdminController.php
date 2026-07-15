<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\KycSubmission;
use App\Models\Loan;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\KycService;
use App\Services\LoanService;
use App\Services\NotificationService;
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
        ]);
    }

    // GET /admin/users?search=&status=&page=
    public function users(Request $request): JsonResponse
    {
        $users = User::query()
            ->where('role', 'user')
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
        $user->name = trim("{$user->first_name} {$user->last_name}");
        $user->save();

        return $this->ok('User updated', ['user' => $this->serializeUser($user)]);
    }

    // PATCH /admin/users/{user}/kyc-tier  { tier: 0..3 }
    public function setUserKycTier(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['tier' => ['required', 'integer', 'between:0,3']]);

        $user->update(['kyc_tier' => $data['tier']]);

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
        ]);
    }

    // GET /admin/kyc?status=
    public function kyc(Request $request): JsonResponse
    {
        $submissions = KycSubmission::with('user')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('KYC submissions fetched', [
            'submissions' => collect($submissions->items())->map(fn ($s) => [
                'id' => $s->id,
                'user' => $s->user ? ['name' => $s->user->fullName(), 'email' => $s->user->email] : null,
                'target_tier' => (int) $s->target_tier,
                'type' => $s->type,
                'status' => $s->status,
                'created_at' => $s->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $submissions->currentPage(),
                'per_page' => $submissions->perPage(),
                'total' => $submissions->total(),
                'last_page' => $submissions->lastPage(),
            ],
        ]);
    }

    // GET /admin/kyc/{submission}
    public function kycShow(KycSubmission $submission): JsonResponse
    {
        $submission->load('user');

        return $this->ok('KYC submission fetched', [
            'submission' => $this->serializeKycSubmission($submission, withPayload: true),
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
        $data = $request->validate(['status' => ['required', 'in:active,frozen,closed']]);

        $wallet->update(['status' => $data['status']]);

        NotificationService::make()->push(
            $wallet->owner,
            'wallet_status_changed',
            'Wallet status updated',
            "Your wallet \"{$wallet->name}\" was set to {$data['status']} by support",
            ['wallet_id' => $wallet->id, 'status' => $data['status']],
        );

        return $this->ok("Wallet {$data['status']}", [
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
        $reversal = DB::transaction(function () use ($transaction, $wallet, $admin, $reason, $counterparty, $meta, $isStuckPayout) {
            if ($transaction->direction === 'debit') {
                $rev = WalletService::make()->credit(
                    $wallet,
                    $transaction->amount + $transaction->fee,
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
                    $transaction->amount,
                    0,
                    'reversal',
                    $counterparty,
                    "Reversal: {$reason}",
                    $admin->id,
                );
            }

            $transaction->update([
                // A reversed stuck payout is now definitively failed; a reversed
                // successful txn keeps its original status (reversal-first ledger).
                'status' => $isStuckPayout ? 'failed' : $transaction->status,
                'meta' => array_merge($meta, [
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
}
