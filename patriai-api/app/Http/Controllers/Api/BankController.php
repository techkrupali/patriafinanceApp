<?php

namespace App\Http\Controllers\Api;

use App\Services\MatrixBankingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BankController extends ApiController
{
    // GET /banks
    public function index(): JsonResponse
    {
        $banks = MatrixBankingService::make()->getBanks();

        return $this->ok('Banks fetched', [
            'banks' => collect($banks)->map(fn ($b) => [
                'bank_name' => $b['bank_name'],
                'bank_code' => $b['bank_code'],
            ])->values(),
        ]);
    }

    // POST /banks/verify-account
    public function verifyAccount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_number' => ['required', 'digits:10'],
            'bank_code' => ['required', 'string'],
        ]);

        try {
            $result = MatrixBankingService::make()->verifyBankAccount($data['account_number'], $data['bank_code']);
        } catch (\RuntimeException $e) {
            return $this->fail($e->getMessage(), 422);
        }

        return $this->ok('Account verified', [
            'account_name' => trim("{$result['first_name']} {$result['last_name']}"),
            'bank_name' => $result['bank_name'],
        ]);
    }
}
