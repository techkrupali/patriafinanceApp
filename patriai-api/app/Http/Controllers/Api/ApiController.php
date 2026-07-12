<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\JsonResponse;

abstract class ApiController extends Controller
{
    protected function ok(string $message, mixed $data = null, int $code = 200): JsonResponse
    {
        $payload = ['status' => true, 'message' => $message];
        if ($data !== null) {
            $payload['data'] = $data;
        }

        return response()->json($payload, $code);
    }

    protected function fail(string $message, int $code = 422, mixed $errors = null): JsonResponse
    {
        $payload = ['status' => false, 'message' => $message];
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }

        return response()->json($payload, $code);
    }

    protected function serializeUser(User $user): array
    {
        return [
            'id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'full_name' => $user->fullName(),
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar_url' => $user->avatar_url,
            'kyc_tier' => $user->kyc_tier,
            'role' => $user->role,
            'status' => $user->status,
            'email_verified' => (bool) $user->email_verified_at,
            'phone_verified' => (bool) $user->phone_verified_at,
            'has_pin' => (bool) $user->pin,
            'created_at' => $user->created_at?->toIso8601String(),
        ];
    }

    protected function serializeWallet(Wallet $wallet, bool $withOwner = false): array
    {
        $data = [
            'id' => $wallet->id,
            'type' => $wallet->type,
            'name' => $wallet->name,
            'currency' => $wallet->currency,
            'balance' => $wallet->balanceNaira(),
            'virtual_account' => $wallet->virtual_account,
            'virtual_account_bank' => $wallet->virtual_account_bank,
            'status' => $wallet->status,
            'created_at' => $wallet->created_at?->toIso8601String(),
        ];

        if ($withOwner) {
            $data['owner'] = [
                'id' => $wallet->owner->id,
                'name' => $wallet->owner->fullName(),
                'email' => $wallet->owner->email,
            ];
        }

        return $data;
    }

    protected function serializeTransaction(Transaction $txn): array
    {
        return [
            'id' => $txn->id,
            'reference' => $txn->reference,
            'wallet_id' => $txn->wallet_id,
            'type' => $txn->type,
            'direction' => $txn->direction,
            'amount' => number_format($txn->amount / 100, 2, '.', ''),
            'fee' => number_format($txn->fee / 100, 2, '.', ''),
            'balance_after' => $txn->balance_after !== null ? number_format($txn->balance_after / 100, 2, '.', '') : null,
            'status' => $txn->status,
            'description' => $txn->description,
            'counterparty' => $txn->counterparty,
            'created_at' => $txn->created_at?->toIso8601String(),
        ];
    }

    /** Parse a naira amount ("1500" / "1500.50") into kobo int. */
    protected function toKobo(string|int|float $naira): int
    {
        return (int) round(((float) $naira) * 100);
    }
}
