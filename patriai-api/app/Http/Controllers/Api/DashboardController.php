<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends ApiController
{
    /** Count of pending approval requests this user can act on. */
    private function pendingApprovalsCount(User $user): int
    {
        $walletIds = Wallet::where('user_id', $user->id)->pluck('id')
            ->concat(
                WalletMember::where('user_id', $user->id)
                    ->where('status', 'active')
                    ->where('role', '!=', 'viewer')
                    ->where(fn ($q) => $q->whereIn('role', ['owner', 'co_owner', 'admin'])->orWhere('can_approve', true))
                    ->pluck('wallet_id')
            )
            ->unique()
            ->values();

        return ApprovalRequest::whereIn('wallet_id', $walletIds)
            ->where('initiator_id', '!=', $user->id)
            ->where('status', 'pending')
            ->whereDoesntHave('responses', fn (Builder $q) => $q->where('approver_id', $user->id))
            ->count();
    }

    // GET /dashboard
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $ownWallets = $user->wallets()->get();
        $memberWallets = $user->memberWallets()->where('wallets.user_id', '!=', $user->id)->get();
        $wallets = $ownWallets->concat($memberWallets);
        $walletIds = $wallets->pluck('id');

        $totalBalance = $ownWallets->sum('balance');

        $recent = Transaction::whereIn('wallet_id', $walletIds)
            ->latest()
            ->limit(10)
            ->get();

        $inflow = Transaction::whereIn('wallet_id', $walletIds)
            ->where('direction', 'credit')
            ->where('status', 'successful')
            ->where('created_at', '>=', now()->subDays(30))
            ->sum('amount');

        $outflow = Transaction::whereIn('wallet_id', $walletIds)
            ->where('direction', 'debit')
            ->where('status', 'successful')
            ->where('created_at', '>=', now()->subDays(30))
            ->sum('amount');

        return $this->ok('Dashboard fetched', [
            'total_balance' => number_format($totalBalance / 100, 2, '.', ''),
            'inflow_30d' => number_format($inflow / 100, 2, '.', ''),
            'outflow_30d' => number_format($outflow / 100, 2, '.', ''),
            'wallets' => $wallets->map(fn ($w) => $this->serializeWallet($w)),
            'recent_transactions' => $recent->map(fn ($t) => $this->serializeTransaction($t)),
            'pending_approvals' => $this->pendingApprovalsCount($user),
            'unread_notifications' => $user->notificationsFeed()->whereNull('read_at')->count(),
        ]);
    }
}
