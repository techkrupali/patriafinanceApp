<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Client for the client-provided Matrix Banking API.
 *
 * Locally this points at the sandbox implementation in backend/ (Express,
 * same contract as matrixbanking.ggtconnect.com). Swap MATRIX_BASE_URL in
 * production — no code changes needed.
 */
class MatrixBankingService
{
    public function __construct(
        private readonly string $baseUrl = '',
        private readonly string $apiKey = '',
    ) {}

    public static function make(): self
    {
        return new self(
            rtrim(config('services.matrix.base_url'), '/'),
            config('services.matrix.api_key'),
        );
    }

    private function client(): PendingRequest
    {
        return Http::baseUrl($this->baseUrl)->acceptJson()->timeout(20);
    }

    private function apiKeyClient(): PendingRequest
    {
        return $this->client()->withHeaders(['x-api-key' => $this->apiKey]);
    }

    /** Bearer token for endpoints that require an authenticated banking session. */
    private function bearerClient(): PendingRequest
    {
        $token = Cache::remember('matrix.bearer', now()->addMinutes(20), function () {
            $res = $this->client()->post('/users/login', [
                'username' => config('services.matrix.username'),
                'password' => config('services.matrix.password'),
            ]);
            if (!$res->ok() || !$res->json('status')) {
                throw new RuntimeException('Matrix Banking login failed: ' . $res->body());
            }

            return $res->json('data.token');
        });

        return $this->client()->withToken($token);
    }

    /** @return array<int, array{id:int,bank_name:string,bank_code:string}> */
    public function getBanks(): array
    {
        return Cache::remember('matrix.banks', now()->addHours(6), function () {
            $res = $this->client()->get('/get-banks');
            if (!$res->ok() || !$res->json('status')) {
                throw new RuntimeException('Failed to fetch banks from banking provider');
            }

            return $res->json('data');
        });
    }

    /** @return array{first_name:string,last_name:string,bank_name:string} */
    public function verifyBankAccount(string $accountNumber, string $bankCode): array
    {
        $res = $this->bearerClient()->post('/verify-bank-account', [
            'account_number' => $accountNumber,
            'bank_code' => $bankCode,
        ]);

        if (!$res->ok() || !$res->json('status')) {
            throw new RuntimeException($res->json('message') ?? 'Account could not be verified');
        }

        return $res->json('data');
    }

    /** Register a virtual account for wallet funding. */
    public function createVirtualAccount(string $accountNumber, string $accountName): void
    {
        $res = $this->apiKeyClient()->post('/virtual-account/create', [
            'settlement_accountno' => config('services.matrix.settlement_account'),
            'account_name' => $accountName,
            'accountno' => $accountNumber,
        ]);

        if (!$res->ok() || !$res->json('status')) {
            throw new RuntimeException($res->json('message') ?? 'Failed to create virtual account');
        }
    }

    /**
     * Pay out from the settlement account to an external bank account.
     *
     * @return array{statuscode:string,balance:float}
     */
    public function payout(string $reference, string $amountNaira, string $destinationAccount, string $bankCode, string $description): array
    {
        $res = $this->apiKeyClient()->post('/banktransfer-payout', [
            'amount' => $amountNaira,
            'destination_account' => $destinationAccount,
            'bank_code' => $bankCode,
            'username' => config('services.matrix.username'),
            'payment_reference' => $reference,
            'description' => $description,
        ]);

        if (!$res->ok() || !$res->json('status')) {
            throw new RuntimeException($res->json('message') ?? 'Bank payout failed');
        }

        return [
            'statuscode' => $res->json('statuscode', '00'),
            'balance' => (float) $res->json('data.balance', 0),
        ];
    }
}
