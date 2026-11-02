<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\GoalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Goal wallets after setup: cancelling one gives everyone back what they put in (GLW-05). */
class GoalController extends ApiController
{
    // POST /wallets/{wallet}/goal/thanks  {note?} — GOL-10 "Send a thank-you to everyone"
    public function thanks(Request $request, Wallet $wallet): JsonResponse
    {
        if (!in_array($wallet->type, \App\Services\SavingsService::TYPES, true) || !$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Goal not found', 404);
        }
        $data = $request->validate(['note' => ['nullable', 'string', 'max:300']]);
        $sent = GoalService::make()->thank($wallet, $request->user(), isset($data['note']) ? trim($data['note']) : null);

        return $this->ok($sent ? "Sent to {$sent} " . ($sent === 1 ? 'person' : 'people') : 'Nobody else to thank', ['sent' => $sent]);
    }

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
