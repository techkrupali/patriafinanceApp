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
        // Sending, holding and wallets come from the tiers (LimitService, ME-23).
        $t = LimitService::make()->tier($tier);

        return [
            'max_wallets' => $t['max_wallets'],
            'daily_transfer_limit' => $t['daily'],
            'single_payment_limit' => $t['single'],
            'max_balance' => $t['max_balance'],
            'loan_cap' => match (true) {
                $tier >= 3 => 100_000_000, // ₦1,000,000
                $tier === 2 => 20_000_000, // ₦200,000
                default => 5_000_000, // ₦50,000
            },
        ];
    }

    /**
     * What each tier asks for (ME-23, KYC-02/03/05/07/08): Tier 1 the BVN; Tier 2
     * the NIN and a selfie; Tier 3 an ID document and proof of address.
     */
    public function requirements(int $tier): array
    {
        return match ($tier) {
            1 => ['bvn'],
            2 => ['nin', 'selfie'],
            3 => ['id_type', 'id_photo', 'address', 'city', 'state', 'proof'],
            default => [],
        };
    }

    /** The photos and files a tier keeps (stored privately; admin views them). */
    public const FILES = ['selfie', 'id_photo', 'id_back', 'proof'];

    /** Validation rules for the payload of a given target tier. */
    private function rules(int $tier): array
    {
        return match ($tier) {
            1 => [
                'bvn' => ['required', 'digits:11'],
            ],
            2 => [
                'nin' => ['required', 'digits:11'],
                'selfie' => ['required', 'file', 'image', 'max:8192'],
            ],
            3 => [
                'id_type' => ['required', 'in:passport,drivers_licence,voters_card,national_id'],
                'id_photo' => ['required', 'file', 'image', 'max:8192'],
                'id_back' => ['nullable', 'file', 'image', 'max:8192'],
                'address' => ['required', 'string', 'max:200'],
                'city' => ['required', 'string', 'max:100'],
                'state' => ['required', 'string', 'max:100'],
                'proof' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,pdf', 'max:10240'],
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
        // Photos and documents are kept privately; the payload holds where.
        foreach (self::FILES as $key) {
            if (($clean[$key] ?? null) instanceof \Illuminate\Http\UploadedFile) {
                $clean[$key] = $clean[$key]->store("kyc/{$u->id}", 'local');
            }
        }

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
        // Tier 3 (KYC-08 "Where do you live?"): the checked address becomes the profile's.
        if ((int) $s->target_tier === 3) {
            $s->user->forceFill(collect($s->payload)->only(['address', 'city', 'state'])->all());
        }
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
