<?php

namespace App\Services;

use App\Models\KycSubmission;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * KYC / tier verification engine. Progressive tiers — access grows with trust.
 * users.kyc_tier is the source of truth; a user submits an upgrade for the next
 * tier, an admin reviews it, and on approval kyc_tier is bumped. No external
 * BVN/NIN provider in this sandbox: submitted values are stored as data and an
 * admin approves manually (a real provider swaps in later).
 */
class KycService
{
    public const MAX_TIER = 3;

    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    /**
     * Per-tier limits. Money values are kobo (daily_transfer_limit may be null for
     * unlimited). loan_cap MUST stay consistent with LoanService's tier caps.
     */
    public function limits(int $tier): array
    {
        return match (true) {
            $tier >= 3 => ['max_wallets' => 25, 'daily_transfer_limit' => null, 'loan_cap' => 100_000_000], // ₦1,000,000
            $tier === 2 => ['max_wallets' => 10, 'daily_transfer_limit' => 200_000_000, 'loan_cap' => 20_000_000], // ₦2,000,000 / ₦200,000
            default => ['max_wallets' => 5, 'daily_transfer_limit' => 20_000_000, 'loan_cap' => 5_000_000], // ₦200,000 / ₦50,000 (tier 0/1)
        };
    }

    /** Required field names for a given target tier. */
    public function requirements(int $tier): array
    {
        return match ($tier) {
            1 => ['bvn', 'nin', 'id_type', 'id_number'],
            2 => ['address', 'city', 'state'],
            3 => ['source_of_funds', 'occupation'],
            default => [],
        };
    }

    /** Validation rules for the payload of a given target tier. */
    private function rules(int $tier): array
    {
        return match ($tier) {
            1 => [
                'bvn' => ['required', 'digits:11'],
                'nin' => ['required', 'digits:11'],
                'id_type' => ['required', 'in:nin_slip,drivers_license,passport,voters_card'],
                'id_number' => ['required', 'string', 'max:50'],
            ],
            2 => [
                'address' => ['required', 'string', 'max:200'],
                'city' => ['required', 'string', 'max:100'],
                'state' => ['required', 'string', 'max:100'],
            ],
            3 => [
                'source_of_funds' => ['required', 'in:employment,business,investment,other'],
                'occupation' => ['required_without:business_name', 'nullable', 'string', 'max:120'],
                'business_name' => ['required_without:occupation', 'nullable', 'string', 'max:120'],
                'monthly_income' => ['nullable', 'numeric', 'min:0'],
            ],
            default => [],
        };
    }

    /**
     * Submit a KYC upgrade for the next tier. Sequential only (can't skip tiers)
     * and one pending submission at a time. Returns the created pending submission.
     */
    public function submit(User $u, int $targetTier, array $payload): KycSubmission
    {
        if ($targetTier < 1 || $targetTier > self::MAX_TIER) {
            throw ValidationException::withMessages(['target_tier' => 'Invalid target tier']);
        }
        if ((int) $u->kyc_tier >= $targetTier) {
            throw ValidationException::withMessages(['target_tier' => 'Already verified at this level']);
        }
        if ($targetTier !== (int) $u->kyc_tier + 1) {
            throw ValidationException::withMessages(['target_tier' => 'Please complete the previous tier first']);
        }
        if (KycSubmission::where('user_id', $u->id)->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['kyc' => 'You already have a pending verification']);
        }

        $clean = Validator::make($payload, $this->rules($targetTier))->validate();

        return KycSubmission::create([
            'user_id' => $u->id,
            'target_tier' => $targetTier,
            'type' => 'personal',
            'payload' => $clean,
            'status' => 'pending',
        ]);
    }

    /** Approve a pending submission and bump the user's kyc_tier. */
    public function approve(KycSubmission $s, User $admin): KycSubmission
    {
        if ($s->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'This submission has already been reviewed']);
        }

        $s->update([
            'status' => 'approved',
            'reviewed_by' => $admin->id,
            'reviewed_at' => now(),
        ]);

        $s->user->kyc_tier = $s->target_tier;
        $s->user->save();

        $this->notifications->push(
            $s->user,
            'kyc_approved',
            "Tier {$s->target_tier} verified",
            "Your identity verification for Tier {$s->target_tier} has been approved. Your account limits have been upgraded.",
            ['submission_id' => $s->id, 'tier' => $s->target_tier],
        );

        return $s->refresh();
    }

    /** Reject a pending submission with an optional note. */
    public function reject(KycSubmission $s, User $admin, ?string $note): KycSubmission
    {
        if ($s->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'This submission has already been reviewed']);
        }

        $s->update([
            'status' => 'rejected',
            'reviewed_by' => $admin->id,
            'reviewed_at' => now(),
            'review_note' => $note,
        ]);

        $this->notifications->push(
            $s->user,
            'kyc_rejected',
            "Tier {$s->target_tier} verification declined",
            $note
                ? "Your Tier {$s->target_tier} verification was declined. Reason: {$note}"
                : "Your Tier {$s->target_tier} verification was declined. Please review your details and try again.",
            ['submission_id' => $s->id, 'tier' => $s->target_tier],
        );

        return $s->refresh();
    }
}
