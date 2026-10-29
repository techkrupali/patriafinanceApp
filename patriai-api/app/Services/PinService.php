<?php

namespace App\Services;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Transaction-PIN verification with a per-user failed-attempt lockout.
 *
 * The transaction PIN (6 digits; 4 on older accounts) is the second factor guarding withdrawals and transfers,
 * so a stolen Sanctum token alone must not be able to brute-force it. Per-IP
 * route throttling is not enough (IP rotation defeats it) — this locks the
 * *account's* PIN after too many wrong tries regardless of source.
 * ACC-07 "Your PIN was wrong 5 times. We locked the app… Try again at 11:52 pm."
 */
class PinService
{
    public const MAX_ATTEMPTS = 5;
    public const LOCK_MINUTES = 30;

    private function key(User $user): string
    {
        return "pin_attempts:{$user->id}";
    }

    private function lockKey(User $user): string
    {
        return "pin_locked_until:{$user->id}";
    }

    /** When the PIN opens again, or null when it isn't locked. */
    public function lockedUntil(User $user): ?Carbon
    {
        $until = Cache::get($this->lockKey($user));
        if (!$until) {
            return null;
        }
        $at = Carbon::parse($until);

        return $at->isFuture() ? $at : null;
    }

    /** "11:52 pm" in Lagos time. */
    private function at(Carbon $until): string
    {
        return $until->copy()->setTimezone('Africa/Lagos')->format('g:i a');
    }

    /** Verify the PIN or throw. Resets the counter on success; locks after MAX_ATTEMPTS. */
    public function verify(User $user, string $pin): void
    {
        if ($until = $this->lockedUntil($user)) {
            throw ValidationException::withMessages([
                'pin' => "Your PIN was wrong " . self::MAX_ATTEMPTS . " times, so it's locked. Try again at {$this->at($until)}.",
            ]);
        }

        $cacheKey = $this->key($user);
        if (!$user->pin || !Hash::check($pin, $user->pin)) {
            // Seed the counter (with its lock-window TTL) on the first failure, then
            // atomically increment. Cache::increment alone can't create a missing key
            // on the database/Redis stores, so Cache::add must run first.
            Cache::add($cacheKey, 0, now()->addMinutes(self::LOCK_MINUTES));
            $new = (int) Cache::increment($cacheKey);

            $remaining = max(self::MAX_ATTEMPTS - $new, 0);
            if ($remaining === 0) {
                $until = now()->addMinutes(self::LOCK_MINUTES);
                Cache::put($this->lockKey($user), $until->toIso8601String(), $until);
                Cache::forget($cacheKey);
                throw ValidationException::withMessages([
                    'pin' => "Your PIN was wrong " . self::MAX_ATTEMPTS . " times. We locked it for " . self::LOCK_MINUTES . " minutes. Try again at {$this->at($until)}.",
                ]);
            }
            throw ValidationException::withMessages([
                'pin' => "Wrong PIN. {$remaining} " . ($remaining === 1 ? 'try' : 'tries') . ' left.',
            ]);
        }

        Cache::forget($cacheKey);
    }

    /** A new PIN, or support unlocking it, starts the count again. */
    public function clear(User $user): void
    {
        Cache::forget($this->key($user));
        Cache::forget($this->lockKey($user));
    }
}
