<?php

namespace App\Http\Controllers\Api;

use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends ApiController
{
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
        ]);
    }
}
