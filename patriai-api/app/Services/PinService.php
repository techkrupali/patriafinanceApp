<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Transaction-PIN verification with a per-user failed-attempt lockout.
 *
 * The 4-digit PIN is the second factor guarding withdrawals and transfers,
 * so a stolen Sanctum token alone must not be able to brute-force it. Per-IP
 * route throttling is not enough (IP rotation defeats it) — this locks the
 * *account's* PIN after too many wrong tries regardless of source.
 */
class PinService
{
    private const MAX_ATTEMPTS = 5;
    private const LOCK_MINUTES = 15;

    private function key(User $user): string
    {
        return "pin_attempts:{$user->id}";
    }

    /** Verify the PIN or throw. Resets the counter on success; locks after MAX_ATTEMPTS. */
    public function verify(User $user, string $pin): void
    {
        $cacheKey = $this->key($user);
        $attempts = (int) Cache::get($cacheKey, 0);

        if ($attempts >= self::MAX_ATTEMPTS) {
            throw ValidationException::withMessages([
                'pin' => 'Too many incorrect PIN attempts. Try again in ' . self::LOCK_MINUTES . ' minutes.',
            ]);
        }

        if (!$user->pin || !Hash::check($pin, $user->pin)) {
            // Seed the counter (with its lock-window TTL) on the first failure, then
            // atomically increment. Cache::increment alone can't create a missing key
            // on the database/Redis stores, so Cache::add must run first.
            Cache::add($cacheKey, 0, now()->addMinutes(self::LOCK_MINUTES));
            $new = (int) Cache::increment($cacheKey);

            $remaining = max(self::MAX_ATTEMPTS - $new, 0);
            throw ValidationException::withMessages([
                'pin' => $remaining > 0
                    ? "Invalid transaction PIN. {$remaining} attempt(s) remaining."
                    : 'Too many incorrect PIN attempts. Your PIN is locked for ' . self::LOCK_MINUTES . ' minutes.',
            ]);
        }

        Cache::forget($cacheKey);
    }
}
