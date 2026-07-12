<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
}
