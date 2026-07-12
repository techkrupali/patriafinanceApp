<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends ApiController
{
    /**
     * POST /webhooks/banking — deposit notifications from the banking rails.
     * Payload (Matrix Banking contract): accountName, accountNumber, amount,
     * tranxfee, narration, sessionId, sourceAccountNumber, sourceAccountName.
     */
    public function banking(Request $request): JsonResponse
    {
        // Shared-secret guard against spoofed deposit notifications.
        $secret = config('services.matrix.webhook_secret');
        if ($secret && !hash_equals($secret, (string) $request->header('x-webhook-secret'))) {
            return $this->fail('Unauthorized', 401);
        }

        $payload = $request->all();
        Log::info('Banking webhook received', $payload);

        $accountNumber = $payload['accountNumber'] ?? null;
        $amount = $payload['amount'] ?? null;
        $sessionId = $payload['sessionId'] ?? null;

        if (!$accountNumber || !is_numeric($amount) || (float) $amount <= 0) {
            return $this->fail('Invalid payload', 400);
        }

        $wallet = Wallet::where('virtual_account', $accountNumber)->first();
        if (!$wallet) {
            // Not one of ours — acknowledge so the provider stops retrying.
            return $this->ok('Ignored');
        }

        WalletService::make()->credit(
            $wallet,
            (int) round(((float) $amount) * 100),
            'fund',
            [
                'kind' => 'bank_deposit',
                'source_account' => $payload['sourceAccountNumber'] ?? null,
                'source_name' => $payload['sourceAccountName'] ?? null,
            ],
            $sessionId,
            $payload['narration'] ?? 'Wallet funding',
        );

        return $this->ok('Wallet credited');
    }
}
