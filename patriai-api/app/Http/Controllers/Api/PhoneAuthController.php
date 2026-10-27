<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Services\AccountSetupService;
use App\Services\OtpService;
use App\Services\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Phone-first sign-up and log-in (client prototype ONB-03…ONB-12, ACC-01/02).
 *
 *   start  → a code to the phone by SMS or WhatsApp
 *   verify → a short-lived phone token, plus who owns the number (if anyone)
 *   then either register (new number: details + 6-digit PIN, no password)
 *   or login (existing number: its PIN), or forgot/reset the PIN.
 *
 * The phone token is the proof of the code; it is spent by whichever call
 * opens the session, so one code can't open two sessions.
 */
class PhoneAuthController extends ApiController
{
    private const PURPOSE = 'phone';
    private const TOKEN_MINUTES = 30;

    public function __construct(private readonly OtpService $otp) {}

    // POST /auth/phone/start  { phone, channel: sms|whatsapp }
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'channel' => ['required', 'in:sms,whatsapp'],
        ]);
        $phone = $this->validPhone($data['phone']);

        $wait = $this->otp->cooldown($phone, self::PURPOSE, $data['channel']);
        if ($wait > 0) {
            throw ValidationException::withMessages(['phone' => "Wait {$wait} seconds before asking for another code."]);
        }

        // Same answer whether or not the number has an account; that only comes
        // out after the code proves the person holds the phone.
        $code = $this->otp->issue($phone, self::PURPOSE, $data['channel']);

        return $this->ok('Code sent', [
            'sent_to' => $this->maskPhone($phone),
            'channel' => $data['channel'],
            'resend_in' => OtpService::RESEND_SECONDS,
            ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : []),
        ]);
    }

    // POST /auth/phone/verify  { phone, code }
    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'code' => ['required', 'digits:6'],
        ]);
        $phone = $this->validPhone($data['phone']);

        $this->otp->verify($phone, self::PURPOSE, $data['code']);

        $user = User::where('phone', $phone)->first();
        if ($user && $user->status !== 'active') {
            return $this->fail('Account is suspended. Contact support.', 403);
        }
        if ($user && !$user->phone_verified_at) {
            $user->forceFill(['phone_verified_at' => now()])->save();
        }

        $token = Str::random(48);
        Cache::put($this->tokenKey($token), $phone, now()->addMinutes(self::TOKEN_MINUTES));

        return $this->ok('Phone verified', [
            'phone_token' => $token,
            'account' => $user ? [
                'first_name' => $user->first_name ?: $user->fullName(),
                'initials' => $this->initials($user),
                'avatar_url' => $user->avatar_url,
                'pin_length' => (int) ($user->pin_length ?? 4),
            ] : null,
        ]);
    }

    // POST /auth/phone/register  { phone_token, first_name, last_name, email, date_of_birth, pin, language? }
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_token' => ['required', 'string'],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            // Grown-ups only; children join through a parent's child wallet.
            'date_of_birth' => ['required', 'date_format:Y-m-d', 'before_or_equal:' . now()->subYears(18)->toDateString(), 'after:1900-01-01'],
            'pin' => ['required', 'digits:6'],
            'language' => ['nullable', 'in:en,pcm'],
            'referral_code' => ['nullable', 'string', 'max:64'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ], [
            'date_of_birth.before_or_equal' => 'You must be 18 or older to open an account.',
        ]);
        $phone = $this->phoneFromToken($data['phone_token']);

        if (User::where('phone', $phone)->exists()) {
            throw ValidationException::withMessages(['phone_token' => 'This number already has an account. Log in instead.']);
        }

        $user = DB::transaction(fn () => User::create([
            'first_name' => trim($data['first_name']),
            'last_name' => trim($data['last_name']),
            'name' => trim($data['first_name']) . ' ' . trim($data['last_name']),
            'email' => strtolower($data['email']),
            'phone' => $phone,
            'password' => null,
            'pin' => Hash::make($data['pin']),
            'pin_length' => 6,
            'date_of_birth' => $data['date_of_birth'],
            'language' => $data['language'] ?? 'en',
        ]));
        // The code proved the phone; the email is confirmed later from statements/receipts.
        $user->forceFill(['phone_verified_at' => now(), 'last_login_at' => now()])->save();

        AccountSetupService::make()->setUp($user, $data['referral_code'] ?? null);
        $this->recordDevice($request, $user);
        Cache::forget($this->tokenKey($data['phone_token']));

        return $this->ok('Account created', [
            'user' => $this->serializeUser($user),
            'token' => $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken,
        ], 201);
    }

    // POST /auth/phone/login  { phone_token, pin }
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_token' => ['required', 'string'],
            'pin' => ['required', self::TXN_PIN],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);
        $user = $this->accountFromToken($data['phone_token']);

        // Locks the PIN after repeated misses, whichever device tries.
        app(PinService::class)->verify($user, $data['pin']);

        $user->update(['last_login_at' => now()]);
        $this->recordDevice($request, $user);
        Cache::forget($this->tokenKey($data['phone_token']));

        return $this->ok('Login successful', [
            'user' => $this->serializeUser($user),
            'token' => $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken,
        ]);
    }

    // POST /auth/pin/forgot  { phone_token } — second check: a code to the email on file
    public function forgotPin(Request $request): JsonResponse
    {
        $data = $request->validate(['phone_token' => ['required', 'string']]);
        $user = $this->accountFromToken($data['phone_token'], requirePin: false);

        $code = $this->otp->issue($user->email, 'pin_reset');

        return $this->ok('Code sent', [
            'sent_to' => $this->maskEmail($user->email),
            ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : []),
        ]);
    }

    // POST /auth/pin/reset  { phone_token, code, pin }
    public function resetPin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_token' => ['required', 'string'],
            'code' => ['required', 'digits:6'],
            'pin' => ['required', 'digits:6'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);
        $user = $this->accountFromToken($data['phone_token'], requirePin: false);

        $this->otp->verify($user->email, 'pin_reset', $data['code']);

        $user->update(['pin' => Hash::make($data['pin']), 'pin_length' => 6, 'last_login_at' => now()]);
        $user->tokens()->delete(); // sessions opened with the old PIN end here
        Cache::forget("pin_attempts:{$user->id}"); // PinService lockout counter
        $this->recordDevice($request, $user);
        Cache::forget($this->tokenKey($data['phone_token']));

        return $this->ok('PIN reset', [
            'user' => $this->serializeUser($user),
            'token' => $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken,
        ]);
    }

    private function validPhone(string $raw): string
    {
        $phone = $this->normalizePhone($raw);
        if (!preg_match('/^\+[1-9]\d{7,14}$/', $phone)) {
            throw ValidationException::withMessages(['phone' => 'Enter a valid phone number.']);
        }

        return $phone;
    }

    private function tokenKey(string $token): string
    {
        return 'phone_auth:' . hash('sha256', $token);
    }

    private function phoneFromToken(string $token): string
    {
        $phone = Cache::get($this->tokenKey($token));
        if (!$phone) {
            throw ValidationException::withMessages(['phone_token' => 'Your phone check has expired. Enter your number again.']);
        }

        return $phone;
    }

    private function accountFromToken(string $token, bool $requirePin = true): User
    {
        $user = User::where('phone', $this->phoneFromToken($token))->first();
        if (!$user) {
            throw ValidationException::withMessages(['phone_token' => 'No account uses this number. Create one instead.']);
        }
        if ($user->status !== 'active') {
            throw ValidationException::withMessages(['phone_token' => 'Account is suspended. Contact support.']);
        }
        if ($requirePin && !$user->pin) {
            throw ValidationException::withMessages(['pin' => 'This account has no PIN yet. Use Forgot PIN to set one.']);
        }

        return $user;
    }

    private function initials(User $user): string
    {
        $parts = array_filter([$user->first_name, $user->last_name]) ?: [$user->fullName()];

        return strtoupper(implode('', array_map(fn ($p) => mb_substr(trim($p), 0, 1), array_slice($parts, 0, 2))));
    }

    /** "+2348034127790" → "+234 ••• ••• 7790" */
    private function maskPhone(string $phone): string
    {
        return substr($phone, 0, 4) . ' ••• ••• ' . substr($phone, -4);
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2);

        return substr($local, 0, 2) . str_repeat('*', max(strlen($local) - 2, 2)) . '@' . $domain;
    }
}
