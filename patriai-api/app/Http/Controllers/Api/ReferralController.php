<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReferralController extends ApiController
{
    /**
     * Fixed display bonus per verified referral, in kobo (₦1,000).
     *
     * TRACKING ONLY — this figure is surfaced as an earned/pending amount for the
     * UI. No money is moved or credited here; an admin/automated payout is a future
     * step.
     */
    private const REWARD_PER_REFERRAL_KOBO = 100000;

    // GET /referrals
    public function index(Request $request): JsonResponse
    {
        return $this->ok('Referrals fetched', $this->referralSummary($request->user()));
    }

    // POST /referrals/apply  { code }
    public function apply(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
        ]);

        $user = $request->user();

        if ($user->referred_by !== null) {
            return $this->fail('You have already used a referral code', 422);
        }

        $owner = User::whereRaw('lower(referral_code) = ?', [strtolower(trim($data['code']))])->first();
        if (!$owner) {
            return $this->fail('Invalid referral code', 404);
        }
        if ($owner->id === $user->id) {
            return $this->fail('You cannot use your own referral code', 422);
        }

        $user->referred_by = $owner->id;
        $user->save();

        NotificationService::make()->push(
            $owner,
            'referral_joined',
            'New referral',
            "{$user->fullName()} joined with your code.",
            ['user_id' => $user->id],
        );

        return $this->ok('Referral code applied', $this->referralSummary($user));
    }

    /**
     * Shared serialization for index/apply. Ensures the user has a referral code,
     * builds a share URL, and returns tracked (display-only) reward stats plus a
     * privacy-limited list of who joined. NO money movement.
     */
    private function referralSummary(User $user): array
    {
        $code = $user->ensureReferralCode();
        $shareUrl = rtrim(config('app.url'), '/') . '/r/' . $code;

        $referrals = $user->referrals()
            ->select(['id', 'first_name', 'last_name', 'name', 'kyc_tier', 'created_at'])
            ->latest()
            ->get();

        $totalReferred = $referrals->count();
        $verifiedReferred = $referrals->where('kyc_tier', '>=', 1)->count();
        $rewardsEarnedKobo = $verifiedReferred * self::REWARD_PER_REFERRAL_KOBO;

        return [
            'code' => $code,
            'share_url' => $shareUrl,
            'stats' => [
                'total_referred' => $totalReferred,
                'verified_referred' => $verifiedReferred,
                // Display-only tracked figures (naira strings). Not credited.
                'rewards_earned' => number_format($rewardsEarnedKobo / 100, 2, '.', ''),
                'reward_per_referral' => number_format(self::REWARD_PER_REFERRAL_KOBO / 100, 2, '.', ''),
            ],
            'referred' => $referrals->map(fn (User $r) => [
                // Privacy: no id/email — just a display name and join state.
                'name' => $r->fullName(),
                'joined_at' => $r->created_at?->toIso8601String(),
                'verified' => (int) $r->kyc_tier >= 1,
            ])->values(),
        ];
    }
}
