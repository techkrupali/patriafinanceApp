<?php

namespace App\Http\Controllers\Api;

use App\Models\KycSubmission;
use App\Services\KycService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KycController extends ApiController
{
    /** Present tier limits with money as naira strings (or null for unlimited). */
    private function presentLimits(array $limits): array
    {
        return [
            'max_wallets' => (int) $limits['max_wallets'],
            'daily_transfer_limit' => $limits['daily_transfer_limit'] !== null
                ? number_format($limits['daily_transfer_limit'] / 100, 2, '.', '')
                : null,
            'loan_cap' => number_format($limits['loan_cap'] / 100, 2, '.', ''),
        ];
    }

    // GET /kyc
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $svc = KycService::make();
        $tier = (int) $user->kyc_tier;

        $pending = KycSubmission::where('user_id', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->first();

        $lastRejected = KycSubmission::where('user_id', $user->id)
            ->where('status', 'rejected')
            ->latest()
            ->first();

        $status = $pending ? 'pending' : ($tier >= 1 ? 'verified' : 'unverified');

        return $this->ok('KYC status fetched', [
            'tier' => $tier,
            'max_tier' => KycService::MAX_TIER,
            'status' => $status,
            'pending_submission' => $pending ? $this->serializeKycSubmission($pending) : null,
            'last_rejected' => $lastRejected ? $this->serializeKycSubmission($lastRejected) : null,
            'limits' => $this->presentLimits($svc->limits($tier)),
            'next_tier' => $tier < KycService::MAX_TIER ? [
                'tier' => $tier + 1,
                'requirements' => $svc->requirements($tier + 1),
                'benefits' => $this->presentLimits($svc->limits($tier + 1)),
            ] : null,
        ]);
    }

    // POST /kyc/submit  { target_tier, ...fields }
    public function submit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'target_tier' => ['required', 'integer', 'min:1', 'max:' . KycService::MAX_TIER],
        ]);

        $submission = KycService::make()->submit(
            $request->user(),
            (int) $data['target_tier'],
            $request->except('target_tier'),
        );

        return $this->ok('Verification submitted', [
            'submission' => $this->serializeKycSubmission($submission),
        ], 201);
    }
}
