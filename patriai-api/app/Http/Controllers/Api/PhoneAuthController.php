<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Services\AccountService;
use App\Services\AccountSetupService;
use App\Services\NotificationService;
use App\Services\SecurityService;
use App\Services\VendorAccountService;
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

    // POST /auth/phone/check  { phone, device_id?, device_secret?, channel? }
    // ACC-01 → ACC-02: a phone this person proved before (it holds the secret we gave
    // it) goes straight to the PIN. Anything else gets a code, exactly like /start, so
    // the answer never says whether a number has an account.
    public function check(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_secret' => ['nullable', 'string', 'max:128'],
            'channel' => ['nullable', 'in:sms,whatsapp'],
        ]);
        $phone = $this->validPhone($data['phone']);
        $user = User::where('phone', $phone)->first();
        if ($user && $user->status === 'active' && SecurityService::make()->isTrusted($user, $data['device_id'] ?? null, $data['device_secret'] ?? null)) {
            $token = Str::random(48);
            Cache::put($this->tokenKey($token), $phone, now()->addMinutes(self::TOKEN_MINUTES));

            return $this->ok('Enter your PIN', ['next' => 'pin', 'phone_token' => $token, 'account' => $this->account($user)]);
        }

        $request->merge(['channel' => $data['channel'] ?? 'sms']);
        $sent = $this->start($request)->getData(true)['data'];

        return $this->ok('Code sent', ['next' => 'code'] + $sent);
    }

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

    // POST /auth/phone/verify  { phone, code, device_id? }
    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'code' => ['required', 'digits:6'],
            'device_id' => ['nullable', 'string', 'max:120'],
        ]);
        $phone = $this->validPhone($data['phone']);

        $this->otp->verify($phone, self::PURPOSE, $data['code']);

        $user = User::where('phone', $phone)->first();
        if ($user && $user->status !== 'active') {
            return $this->fail($user->status === 'closed' ? 'This account was closed.' : 'Account is suspended. Contact support.', 403);
        }
        if ($user && !$user->phone_verified_at) {
            $user->forceFill(['phone_verified_at' => now()])->save();
        }

        $token = Str::random(48);
        Cache::put($this->tokenKey($token), $phone, now()->addMinutes(self::TOKEN_MINUTES));

        $security = SecurityService::make();

        return $this->ok('Phone verified', [
            'phone_token' => $token,
            'account' => $user ? $this->account($user) + [
                // ACC-06 "Is this your new phone?": a selfie, then sends wait 24 hours.
                'new_device' => $security->hasTrustedDevices($user) && !$user->devices()->where('device_id', (string) ($data['device_id'] ?? ''))->whereNotNull('trusted_at')->exists(),
                'two_factor' => $user->hasTwoFactor() ? $user->two_factor_method : null,
            ] : null,
        ]);
    }

    // POST /auth/referral  { code } — ONB-11 "Code from Chioma Nwosu"
    public function referral(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:64']]);
        $owner = User::whereRaw('lower(referral_code) = ?', [strtolower(trim($data['code']))])->where('status', 'active')->first();
        if (!$owner) {
            return $this->fail('That code isn\'t one we know. Check it, or skip.', 404);
        }

        return $this->ok('Code found', ['from' => $owner->fullName()]);
    }

    // POST /auth/phone/register  { phone_token, first_name, last_name, email, date_of_birth, pin, consents{}, … }
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
            // ONB-10 "Your data, your say": the terms and BVN/NIN checks are required.
            'consents' => ['nullable', 'array'],
            'consents.terms' => ['nullable', 'boolean'],
            'consents.verify' => ['nullable', 'boolean'],
            'consents.steward_learn' => ['nullable', 'boolean'],
            'consents.news' => ['nullable', 'boolean'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ], [
            'date_of_birth.before_or_equal' => 'You must be 18 or older to open an account.',
        ]);
        if (isset($data['consents']) && (empty($data['consents']['terms']) || empty($data['consents']['verify']))) {
            throw ValidationException::withMessages(['consents' => 'Agree to the terms and to being verified with your BVN and NIN to open an account.']);
        }
        $security = SecurityService::make();
        $security->assertStrongPin($data['pin'], null, $data['date_of_birth']);
        $phone = $this->phoneFromToken($data['phone_token']);

        if (User::where('phone', $phone)->exists()) {
            throw ValidationException::withMessages(['phone_token' => 'This number already has an account. Log in instead.']);
        }

        $consents = $data['consents'] ?? [];
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
        $user->forceFill([
            'phone_verified_at' => now(),
            'last_login_at' => now(),
            'pin_changed_at' => now(),
            'settings' => [
                'consents' => ['terms' => true, 'verify' => true, 'at' => now()->toIso8601String()],
                'steward_reads_transactions' => (bool) ($consents['steward_learn'] ?? true),
                'partner_offers' => (bool) ($consents['news'] ?? false),
                'product_research' => true,
            ],
        ])->save();

        AccountSetupService::make()->setUp($user, $data['referral_code'] ?? null);
        // INV-V1: a family invited this number to build their project before it had an account.
        VendorAccountService::make()->linkInvites($user);
        // The phone that signed up is the first trusted one: no selfie, no hold.
        $trusted = $security->trustDevice($request, $user, holdSends: false);
        $security->recordLogin($user, $request, 'ok', 'sign_up');
        Cache::forget($this->tokenKey($data['phone_token']));

        return $this->ok('Account created', [
            'user' => $this->serializeUser($user),
            'token' => $security->issueToken($user, $trusted['device']),
            'device_secret' => $trusted['secret'],
        ], 201);
    }

    // POST /auth/phone/login  { phone_token, pin, device_*, selfie? (new phone), two_factor_code? }
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_token' => ['required', 'string'],
            'pin' => ['required', self::TXN_PIN],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
            'device_secret' => ['nullable', 'string', 'max:128'],
            'selfie' => ['nullable', 'file', 'image', 'max:8192'],
            'two_factor_code' => ['nullable', 'string', 'max:10'],
        ]);
        $user = $this->accountFromToken($data['phone_token']);
        $security = SecurityService::make();
        $pins = app(PinService::class);

        // ACC-07 "Locked for 30 minutes": the PIN locks after 5 misses, whichever phone tries.
        if ($until = $pins->lockedUntil($user)) {
            $security->recordLogin($user, $request, 'blocked', 'locked');

            return $this->locked($until);
        }
        try {
            $pins->verify($user, $data['pin']);
        } catch (ValidationException $e) {
            $security->recordLogin($user, $request, 'failed', 'wrong_pin');
            if ($until = $pins->lockedUntil($user)) {
                return $this->locked($until);
            }
            throw $e;
        }

        // ACC-06 a phone we haven't seen: a selfie (and the two-step code, if on) first.
        $trusted = $security->isTrusted($user, $data['device_id'] ?? null, $data['device_secret'] ?? null)
            || $user->devices()->where('device_id', (string) ($data['device_id'] ?? ''))->whereNotNull('trusted_at')->exists();
        $newDevice = !$trusted && $security->hasTrustedDevices($user);
        if ($newDevice && !$request->hasFile('selfie')) {
            return response()->json(['status' => false, 'message' => 'Take a selfie to confirm this new phone is yours.', 'data' => ['code' => 'selfie_required']], 422);
        }
        if (($newDevice || !$trusted) && $user->hasTwoFactor()) {
            if (empty($data['two_factor_code'])) {
                $sentTo = $user->two_factor_method === 'authenticator' ? null : $security->sendTwoFactorCode($user);

                return response()->json(['status' => false, 'message' => 'Enter your two-step code.', 'data' => ['code' => 'two_factor_required', 'method' => $user->two_factor_method, 'sent_to' => $sentTo]], 422);
            }
            $security->verifyTwoFactorCode($user, $data['two_factor_code']);
        }

        $device = $security->trustDevice($request, $user, holdSends: $newDevice, selfie: $request->file('selfie'));
        $user->update(['last_login_at' => now()]);
        $security->recordLogin($user, $request, 'ok', $newDevice ? 'new_device' : null, $newDevice);
        Cache::forget($this->tokenKey($data['phone_token']));
        if ($newDevice) {
            NotificationService::make()->push($user, 'security_new_device', 'New phone signed in', ($request->input('device_name') ?: 'A new phone') . ' signed in to your account. It can send money from ' . $device['device']->send_after?->copy()->setTimezone('Africa/Lagos')->format('j M, g:i a') . '. Wasn\'t you? Freeze your account.', []);
        }

        return $this->ok('Login successful', [
            'user' => $this->serializeUser($user),
            'token' => $security->issueToken($user, $device['device']),
            'device_secret' => $device['secret'],
            'send_after' => $device['device']->send_after?->toIso8601String(),
        ]);
    }

    private function locked(\Carbon\Carbon $until): JsonResponse
    {
        return response()->json([
            'status' => false,
            'message' => 'Your PIN was wrong ' . PinService::MAX_ATTEMPTS . ' times. We locked the app to protect your money. Try again at ' . $until->copy()->setTimezone('Africa/Lagos')->format('g:i a') . '.',
            'data' => ['code' => 'locked', 'until' => $until->toIso8601String()],
        ], 423);
    }

    // POST /auth/pin/forgot  { phone_token } — ACC-04 "Prove it's you": the BVN on file
    // (or, before a BVN was checked, a code to the email on file), then a selfie.
    public function forgotPin(Request $request): JsonResponse
    {
        $data = $request->validate(['phone_token' => ['required', 'string']]);
        $user = $this->accountFromToken($data['phone_token'], requirePin: false);

        if ($this->bvnOnFile($user)) {
            return $this->ok('Prove it\'s you', ['needs' => 'bvn', 'bvn_hint' => '•••••••' . substr($this->bvnOnFile($user), -4)]);
        }
        $code = $this->otp->issue($user->email, 'pin_reset');

        return $this->ok('Code sent', [
            'needs' => 'email',
            'sent_to' => $this->maskEmail($user->email),
            ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : []),
        ]);
    }

    // POST /auth/pin/reset  { phone_token, bvn | code, selfie, pin }
    public function resetPin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone_token' => ['required', 'string'],
            'bvn' => ['nullable', 'digits:11'],
            'code' => ['nullable', 'digits:6'],
            'selfie' => ['required', 'file', 'image', 'max:8192'],
            'pin' => ['required', 'digits:6'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ], ['selfie.required' => 'Take a selfie to prove it\'s you.']);
        $user = $this->accountFromToken($data['phone_token'], requirePin: false);
        $security = SecurityService::make();
        // A weak PIN is refused before the code is used up.
        $security->assertStrongPin($data['pin'], $user);

        if ($bvn = $this->bvnOnFile($user)) {
            if (!isset($data['bvn']) || !hash_equals($bvn, $data['bvn'])) {
                $security->recordLogin($user, $request, 'failed', 'wrong_bvn');
                throw ValidationException::withMessages(['bvn' => 'That BVN doesn\'t match the one you verified with.']);
            }
        } else {
            $this->otp->verify($user->email, 'pin_reset', (string) ($data['code'] ?? ''));
        }

        $security->setPin($user, $data['pin']);
        // ACC-05 "For your safety, payments over ₦50,000 wait 24 hours."
        $user->forceFill(['pin_reset_hold_until' => now()->addHours(SecurityService::NEW_DEVICE_HOURS), 'last_login_at' => now()])->save();
        $user->tokens()->delete(); // sessions opened with the old PIN end here
        $device = $security->trustDevice($request, $user, holdSends: false, selfie: $request->file('selfie'));
        $security->recordLogin($user, $request, 'ok', 'pin_reset');
        Cache::forget($this->tokenKey($data['phone_token']));
        NotificationService::make()->push($user, 'security_pin_reset', 'Your PIN was reset', 'Payments over ₦50,000 wait 24 hours. Wasn\'t you? Freeze your account now.', []);

        return $this->ok('PIN reset', [
            'user' => $this->serializeUser($user),
            'token' => $security->issueToken($user, $device['device']),
            'device_secret' => $device['secret'],
            'hold_until' => $user->pin_reset_hold_until->toIso8601String(),
        ]);
    }

    // POST /auth/freeze  { phone_token } — ACC-07 "Freeze my account", before signing in
    public function freeze(Request $request): JsonResponse
    {
        $data = $request->validate(['phone_token' => ['required', 'string']]);
        $user = $this->accountFromToken($data['phone_token'], requirePin: false);
        AccountService::make()->freeze($user, 'locked_screen');

        return $this->ok('Account frozen', ['frozen' => true]);
    }

    /** The BVN this person verified with (Tier 1), or null. */
    private function bvnOnFile(User $user): ?string
    {
        $bvn = \App\Models\KycSubmission::where('user_id', $user->id)->where('status', 'approved')->where('target_tier', 1)->latest()->first()?->payload['bvn'] ?? null;

        return $bvn ? (string) $bvn : null;
    }

    private function account(User $user): array
    {
        return [
            'first_name' => $user->first_name ?: $user->fullName(),
            'initials' => $this->initials($user),
            'avatar_url' => $user->avatar_url,
            'pin_length' => (int) ($user->pin_length ?? 4),
        ];
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
