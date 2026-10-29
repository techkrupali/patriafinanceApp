<?php

namespace App\Services;

use App\Models\Device;
use App\Models\LoginEvent;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The account's protections (client prototype ME-05…10, ME-18, ME-24,
 * ACC-02…07): strong PINs, trusted devices and their 24-hour send hold,
 * the login history, two-step verification (authenticator app, SMS or email)
 * and the security score.
 */
class SecurityService
{
    /** ACC-06 / ME-09: a new device sends only after this many hours. */
    public const NEW_DEVICE_HOURS = 24;

    /** ACC-05: after a PIN reset, payments over this (kobo) wait 24 hours. */
    public const PIN_RESET_HOLD_OVER = 5_000_000;

    /** ME-08: two-step verification is asked for on payments over this (kobo). */
    public const TWO_FACTOR_OVER = 50_000_000;

    /** ME-07 default: the PIN is asked for on payments over this (kobo), even with Face ID. */
    public const PIN_PROMPT_OVER = 10_000_000;

    public const TWO_FACTOR_METHODS = ['authenticator', 'sms', 'email'];

    /** Wrong two-step codes before two-step checks stop for 30 minutes (as with the PIN). */
    public const TWO_FACTOR_TRIES = 5;

    public static function make(): self
    {
        return new self;
    }

    // ------------------------------------------------------------------ PIN

    /** ME-06 / ONB-06 "6 digits. Not your birthday or 123456." Null when strong. */
    public function weakPinReason(string $pin, ?User $user = null, ?string $birthDate = null): ?string
    {
        if (!preg_match('/^\d{6}$/', $pin)) {
            return 'Use 6 digits.';
        }
        if (count(array_unique(str_split($pin))) === 1) {
            return 'Avoid one digit repeated.';
        }
        $up = $down = true;
        for ($i = 1; $i < 6; $i++) {
            $up = $up && (int) $pin[$i] === ((int) $pin[$i - 1] + 1) % 10;
            $down = $down && (int) $pin[$i] === ((int) $pin[$i - 1] + 9) % 10;
        }
        if ($up || $down || in_array($pin, ['121212', '112233', '123123', '111222', '000111'], true)) {
            return 'Avoid easy patterns like 123456.';
        }
        $dob = $birthDate ?? $user?->date_of_birth?->toDateString();
        if ($dob) {
            $d = Carbon::parse($dob);
            if (in_array($pin, [$d->format('dmy'), $d->format('mdy'), $d->format('ymd'), $d->format('ydm')], true)) {
                return 'Avoid your birthday.';
            }
        }
        if ($user?->phone && str_ends_with(preg_replace('/\D/', '', $user->phone), $pin)) {
            return 'Avoid the end of your phone number.';
        }

        return null;
    }

    public function assertStrongPin(string $pin, ?User $user = null, ?string $birthDate = null): void
    {
        if ($reason = $this->weakPinReason($pin, $user, $birthDate)) {
            throw ValidationException::withMessages(['pin' => $reason]);
        }
    }

    /** Set a PIN (already checked), and note when. */
    public function setPin(User $user, string $pin): void
    {
        $user->forceFill(['pin' => Hash::make($pin), 'pin_length' => strlen($pin), 'pin_changed_at' => now()])->save();
        app(PinService::class)->clear($user);
    }

    // -------------------------------------------------------------- devices

    /** The device a request comes from: its session's device, or the id it sent. */
    public function currentDevice(Request $request, User $user): ?Device
    {
        $name = $request->user()?->currentAccessToken()?->name;
        if ($name && str_starts_with($name, 'device:')) {
            return $user->devices()->where('device_id', substr($name, 7))->first();
        }
        $id = $request->input('device_id') ?: $request->header('X-Device-Id');

        return $id ? $user->devices()->where('device_id', $id)->first() : null;
    }

    /** ACC-01 → ACC-02: a phone this person proved before, holding its secret. */
    public function isTrusted(User $user, ?string $deviceId, ?string $secret): bool
    {
        if (!$deviceId || !$secret) {
            return false;
        }
        $device = $user->devices()->where('device_id', $deviceId)->whereNotNull('trusted_at')->first();

        return $device && $device->secret_hash && hash_equals($device->secret_hash, hash('sha256', $secret));
    }

    /** Has this person signed in anywhere before? The very first phone needs no selfie. */
    public function hasTrustedDevices(User $user): bool
    {
        return $user->devices()->whereNotNull('trusted_at')->exists();
    }

    /**
     * Record the device a sign-in came from and trust it. A new device (not the
     * person's first) keeps a selfie and may only send after 24 hours. Returns
     * the device and a fresh secret the app keeps to skip the code next time.
     *
     * @return array{device: Device, secret: string, new: bool}
     */
    public function trustDevice(Request $request, User $user, bool $holdSends, ?UploadedFile $selfie = null): array
    {
        $id = (string) ($request->input('device_id') ?: Str::uuid());
        $device = $user->devices()->firstOrNew(['device_id' => $id]);
        $new = !$device->exists || $device->trusted_at === null;
        $secret = Str::random(64);
        $device->fill([
            'device_name' => $request->input('device_name') ?: $device->device_name,
            'platform' => $request->input('platform') ?: $device->platform,
            'last_active_at' => now(),
            'ip' => $request->ip(),
        ]);
        $device->forceFill([
            'trusted_at' => $device->trusted_at ?? now(),
            'secret_hash' => hash('sha256', $secret),
        ]);
        if ($new && $holdSends) {
            $device->send_after = now()->addHours(self::NEW_DEVICE_HOURS);
        }
        if ($selfie) {
            $device->selfie_path = $selfie->store("selfies/{$user->id}", 'local');
        }
        $device->save();

        return ['device' => $device, 'secret' => $secret, 'new' => $new];
    }

    /** A session for this device, named after it so logging it out ends exactly it. */
    public function issueToken(User $user, Device $device): string
    {
        return $user->createToken($device->tokenName())->plainTextToken;
    }

    /** ME-24: end a device's sessions; "also stop trusting" makes the next sign-in a new device. */
    public function logOutDevice(User $user, Device $device, bool $forget): int
    {
        $ended = $user->tokens()->where('name', $device->tokenName())->delete();
        if ($forget) {
            $device->forceFill(['trusted_at' => null, 'secret_hash' => null])->save();
        }

        return $ended;
    }

    // -------------------------------------------------------- login history

    public function recordLogin(?User $user, Request $request, string $status, ?string $reason = null, bool $newDevice = false): void
    {
        LoginEvent::create([
            'user_id' => $user?->id,
            'device_id' => $request->input('device_id'),
            'device_name' => $request->input('device_name'),
            'platform' => $request->input('platform'),
            'ip' => $request->ip(),
            'status' => $status,
            'reason' => $reason,
            'new_device' => $newDevice,
        ]);
    }

    // ------------------------------------------------- two-step verification

    /**
     * ME-08 "Set up authenticator": a new secret (not yet on) and the otpauth
     * link the app shows as a QR code. SMS and email send a first code.
     *
     * @return array{method: string, secret?: string, otpauth?: string, sent_to?: string}
     */
    public function startTwoFactor(User $user, string $method): array
    {
        if (!in_array($method, self::TWO_FACTOR_METHODS, true)) {
            throw ValidationException::withMessages(['method' => 'Choose authenticator, SMS or email.']);
        }
        if ($method === 'email' && !$user->email) {
            throw ValidationException::withMessages(['method' => 'Add an email address first.']);
        }
        $secret = $method === 'authenticator' ? self::base32Encode(random_bytes(20)) : null;
        $user->forceFill(['two_factor_method' => $method, 'two_factor_secret' => $secret, 'two_factor_confirmed_at' => null])->save();
        if ($method === 'authenticator') {
            $label = rawurlencode('Patriai:' . ($user->phone ?? $user->email));

            return ['method' => $method, 'secret' => $secret, 'otpauth' => "otpauth://totp/{$label}?secret={$secret}&issuer=Patriai&digits=6&period=30"];
        }

        return ['method' => $method, 'sent_to' => $this->sendTwoFactorCode($user)];
    }

    /** For SMS and email: a code to the number or address on file. */
    public function sendTwoFactorCode(User $user): ?string
    {
        $method = $user->two_factor_method;
        if ($method === 'sms' && $user->phone) {
            app(OtpService::class)->issue($user->phone, 'two_factor', 'sms');

            return substr($user->phone, 0, 4) . ' •••• ' . substr($user->phone, -3);
        }
        if ($method === 'email' && $user->email) {
            app(OtpService::class)->issue($user->email, 'two_factor', 'email');

            return $user->email;
        }

        return null;
    }

    public function confirmTwoFactor(User $user, string $code): void
    {
        if (!$user->two_factor_method) {
            throw ValidationException::withMessages(['code' => 'Choose a method first.']);
        }
        $this->verifyTwoFactorCode($user, $code);
        $user->forceFill(['two_factor_confirmed_at' => now()])->save();
    }

    public function disableTwoFactor(User $user): void
    {
        $user->forceFill(['two_factor_method' => null, 'two_factor_secret' => null, 'two_factor_confirmed_at' => null])->save();
    }

    /** Throws when the code is wrong (authenticator: this 30 seconds or either side). */
    public function verifyTwoFactorCode(User $user, ?string $code): void
    {
        $code = preg_replace('/\D/', '', (string) $code);
        if (strlen($code) !== 6) {
            throw ValidationException::withMessages(['two_factor_code' => 'Enter the 6-digit code.']);
        }
        // Like the PIN: 5 wrong codes and two-step checks stop for 30 minutes.
        $key = 'two-factor:' . $user->id;
        if (RateLimiter::tooManyAttempts($key, self::TWO_FACTOR_TRIES)) {
            throw ValidationException::withMessages(['two_factor_code' => 'Too many wrong codes. Try again in ' . max(1, (int) ceil(RateLimiter::availableIn($key) / 60)) . ' minutes.']);
        }
        try {
            $this->checkTwoFactorCode($user, $code);
        } catch (ValidationException $e) {
            RateLimiter::hit($key, 30 * 60);
            throw $e;
        }
        RateLimiter::clear($key);
    }

    private function checkTwoFactorCode(User $user, string $code): void
    {
        if ($user->two_factor_method === 'authenticator') {
            $now = intdiv(time(), 30);
            foreach ([-1, 0, 1] as $drift) {
                if (hash_equals(self::totp((string) $user->two_factor_secret, $now + $drift), $code)) {
                    return;
                }
            }
            throw ValidationException::withMessages(['two_factor_code' => 'That code is wrong or has expired.']);
        }
        $identifier = $user->two_factor_method === 'sms' ? $user->phone : $user->email;
        try {
            app(OtpService::class)->verify((string) $identifier, 'two_factor', $code);
        } catch (ValidationException $e) {
            throw ValidationException::withMessages(['two_factor_code' => collect($e->errors())->flatten()->first() ?? 'That code is wrong.']);
        }
    }

    /** RFC 6238 time-based code (HMAC-SHA1, 6 digits) for one 30-second step. */
    public static function totp(string $base32Secret, int $step): string
    {
        $key = self::base32Decode($base32Secret);
        $hash = hash_hmac('sha1', pack('N*', 0, $step), $key, true);
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24) | (ord($hash[$offset + 1]) << 16) | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);

        return str_pad((string) ($value % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    public static function base32Encode(string $bytes): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = '';
        foreach (str_split($bytes) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= $alphabet[bindec(str_pad($chunk, 5, '0'))];
        }

        return $out;
    }

    public static function base32Decode(string $b32): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = '';
        foreach (str_split(strtoupper(rtrim($b32, '='))) as $c) {
            $i = strpos($alphabet, $c);
            if ($i !== false) {
                $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
            }
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }

        return $out;
    }

    // --------------------------------------------------------- the summary

    /**
     * ME-05 "Strong · 4 of 5 done": a strong PIN, app lock, two-step, a verified
     * identity and an email to reach you.
     *
     * @return array{done: int, total: int, label: string, next: ?string, checks: array<string, bool>}
     */
    public function score(User $user): array
    {
        $checks = [
            'pin' => (bool) $user->pin && (int) $user->pin_length === 6,
            'app_lock' => (bool) $user->setting('app_lock', false),
            'two_factor' => $user->hasTwoFactor(),
            'identity' => (int) $user->kyc_tier >= 2,
            'email' => (bool) $user->email,
        ];
        $done = count(array_filter($checks));
        $next = match (false) {
            $checks['pin'] => 'Change to a 6-digit PIN to finish.',
            $checks['two_factor'] => 'Turn on two-step verification to finish.',
            $checks['app_lock'] => 'Turn on app lock to finish.',
            $checks['identity'] => 'Verify your NIN and a selfie to finish.',
            $checks['email'] => 'Add an email address to finish.',
            default => null,
        };

        return [
            'done' => $done,
            'total' => count($checks),
            'label' => $done >= 4 ? 'Strong' : ($done >= 3 ? 'Good' : 'Weak'),
            'next' => $next,
            'checks' => $checks,
        ];
    }
}
