<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\GoalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Goal wallets after setup: cancelling one gives everyone back what they put in (GLW-05). */
class GoalController extends ApiController
{
    // POST /wallets/{wallet}/goal/cancel  {pin}
    public function cancel(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->type !== 'goal' || $wallet->user_id !== $request->user()->id) {
            return $this->fail('Goal not found', 404);
        }
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);

        $refunds = GoalService::make()->cancel($wallet, $request->user());

        return $this->ok('Goal cancelled — everyone has their money back', [
            'wallet' => $this->serializeWallet($wallet->refresh()),
            'refunds' => array_map(fn ($r) => ['user_id' => $r['user_id'], 'amount' => number_format($r['amount'] / 100, 2, '.', '')], $refunds),
        ]);
    }
}
