<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletLockController extends ApiController
{
    // POST /wallets/{wallet}/freeze
    public function freeze(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwnerControllable($request, $wallet)) {
            return $err;
        }

        $wallet->update(['status' => 'frozen']);
        \App\Services\AuditService::make()->log($wallet, $request->user(), 'wallet_frozen', 'Wallet frozen — spending blocked');

        return $this->ok('Wallet frozen. Spending is blocked until you unfreeze it.', [
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
        ]);
    }

    // POST /wallets/{wallet}/unfreeze
    public function unfreeze(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwnerControllable($request, $wallet)) {
            return $err;
        }

        $wallet->update(['status' => 'active']);
        \App\Services\AuditService::make()->log($wallet, $request->user(), 'wallet_unfrozen', 'Wallet unfrozen — spending re-enabled');

        return $this->ok('Wallet unfrozen. Spending is enabled again.', [
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
        ]);
    }

    // PATCH /wallets/{wallet}/access-schedule  { days?: [1..7], start?: HH:MM, end?: HH:MM, tz? }
    public function setSchedule(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwnerControllable($request, $wallet)) {
            return $err;
        }

        // A null/empty body clears the schedule (wallet becomes always-spendable).
        if (!$request->filled('days') && !$request->filled('start') && !$request->filled('end')) {
            $wallet->update(['access_schedule' => null]);
            \App\Services\AuditService::make()->log($wallet, $request->user(), 'access_schedule_set', 'Scheduled access cleared — spending allowed anytime');

            return $this->ok('Access schedule cleared. Spending is allowed at any time.', [
                'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
            ]);
        }

        $data = $request->validate([
            'days' => ['required', 'array', 'min:1'],
            'days.*' => ['integer', 'between:1,7'],
            'start' => ['required', 'date_format:H:i'],
            'end' => ['required', 'date_format:H:i'],
            'tz' => ['nullable', 'timezone'],
        ]);

        $wallet->update([
            'access_schedule' => [
                'days' => array_values(array_unique(array_map('intval', $data['days']))),
                'start' => $data['start'],
                'end' => $data['end'],
                'tz' => $data['tz'] ?? config('app.timezone', 'Africa/Lagos'),
            ],
        ]);
        \App\Services\AuditService::make()->log($wallet, $request->user(), 'access_schedule_set', 'Scheduled access window updated', ['schedule' => $wallet->access_schedule]);

        return $this->ok('Access schedule updated. Spending is only allowed within the window.', [
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
        ]);
    }

    /**
     * Shared guard: the actor must be able to access the wallet and hold an
     * owner/co_owner role, and the wallet must not be a 'main' wallet (a user's
     * main wallet can never be frozen or time-locked). Returns a JsonResponse on
     * failure, or null when the action may proceed.
     */
    private function guardOwnerControllable(Request $request, Wallet $wallet): ?JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        if (!in_array($wallet->roleOf($request->user()), ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can lock this wallet', 403);
        }

        if ($wallet->type === 'main') {
            return $this->fail('Your main wallet cannot be frozen or time-locked', 422);
        }

        return null;
    }
}
