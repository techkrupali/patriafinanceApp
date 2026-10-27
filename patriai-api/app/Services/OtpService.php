<?php

namespace App\Services;

use App\Models\OtpCode;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class OtpService
{
    private const TTL_MINUTES = 10;
    private const MAX_ATTEMPTS = 5;
    /** Seconds before another code can go out on the same channel. */
    public const RESEND_SECONDS = 60;
    /** Codes per identifier per hour, across channels. */
    private const HOURLY_CAP = 10;

    /**
     * Create and dispatch an OTP for the identifier (email or phone).
     * Returns the plaintext code so the caller can expose it in debug mode.
     */
    public function issue(string $identifier, string $purpose, string $channel = 'email'): string
    {
        // Invalidate previous, unconsumed codes for the same identifier+purpose.
        OtpCode::where('identifier', $identifier)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $code = (string) random_int(100000, 999999);

        OtpCode::create([
            'identifier' => $identifier,
            'channel' => $channel,
            'purpose' => $purpose,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        $this->deliver($identifier, $purpose, $code, $channel);

        return $code;
    }

    /**
     * Seconds until another code may be sent to this identifier on this channel
     * (0 = now). Also enforces the hourly cap so a number can't be flooded.
     */
    public function cooldown(string $identifier, string $purpose, string $channel): int
    {
        $sentThisHour = OtpCode::where('identifier', $identifier)
            ->where('created_at', '>=', now()->subHour())
            ->count();
        if ($sentThisHour >= self::HOURLY_CAP) {
            throw ValidationException::withMessages(['phone' => 'Too many codes sent to this number. Try again in an hour.']);
        }

        $last = OtpCode::where('identifier', $identifier)
            ->where('purpose', $purpose)
            ->where('channel', $channel)
            ->latest('id')
            ->first();

        return $last ? max(0, self::RESEND_SECONDS - (int) $last->created_at->diffInSeconds(now())) : 0;
    }

    /** Verify and consume an OTP. Throws ValidationException on failure. */
    public function verify(string $identifier, string $purpose, string $code): void
    {
        // Lock the OTP row so the attempts gate and increment are atomic — otherwise
        // concurrent requests could each read attempts < MAX and all proceed.
        DB::transaction(function () use ($identifier, $purpose, $code) {
            $otp = OtpCode::where('identifier', $identifier)
                ->where('purpose', $purpose)
                ->whereNull('consumed_at')
                ->latest()
                ->lockForUpdate()
                ->first();

            if (!$otp || $otp->expires_at->isPast()) {
                throw ValidationException::withMessages(['code' => 'OTP is invalid or has expired. Request a new one.']);
            }

            if ($otp->attempts >= self::MAX_ATTEMPTS) {
                throw ValidationException::withMessages(['code' => 'Too many attempts. Request a new OTP.']);
            }

            $otp->increment('attempts');

            if (!Hash::check($code, $otp->code_hash)) {
                throw ValidationException::withMessages(['code' => 'Incorrect OTP code.']);
            }

            $otp->update(['consumed_at' => now()]);
        });
    }

    private function deliver(string $identifier, string $purpose, string $code, string $channel): void
    {
        // SMS / WhatsApp go through Termii; email through Laravel Mail (log driver
        // in dev, SMTP/Resend in prod). Delivery failures must NOT break auth flows —
        // the code is already persisted and the person can ask for it again.
        if (in_array($channel, ['sms', 'whatsapp'], true)) {
            SmsService::make()->send(
                $identifier,
                "Your Patriai code is {$code}. It expires in " . self::TTL_MINUTES . ' minutes. Never share it with anyone.',
                $channel,
            );

            return;
        }

        if ($channel === 'email' && str_contains($identifier, '@')) {
            try {
                Mail::raw(
                    "Your Patriai {$purpose} code is: {$code}\nIt expires in " . self::TTL_MINUTES . ' minutes.',
                    fn ($m) => $m->to($identifier)->subject("Patriai verification code: {$code}")
                );
            } catch (\Throwable $e) {
                Log::warning("OTP email delivery failed for {$identifier}: {$e->getMessage()}");
            }
        }
    }
}
