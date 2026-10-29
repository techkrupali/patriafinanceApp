<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Services\AccountSetupService;
use App\Services\OtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends ApiController
{
    // Bcrypt hash (cost 12, same as real passwords) checked when the login
    // identifier does not exist, so both failure paths cost the same time.
    private const DUMMY_HASH = '$2y$12$a33VGHduvTG1Dsg3zi2WGOsfXGU4.EW6Zw2g.zWLmxqcWN0LG7k4u';

    public function __construct(private readonly OtpService $otp) {}

    // POST /auth/register
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'unique:users,email'],
            // E.164: leading '+', country code, national number — kept clean in the DB.
            'phone' => ['required', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:users,phone'],
            'password' => ['required', Password::min(8)],
            'pin' => ['required', 'digits:4'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
            'referral_code' => ['nullable', 'string', 'max:64'],
        ]);

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'name' => trim($data['first_name'] . ' ' . $data['last_name']),
                'email' => strtolower($data['email']),
                'phone' => $data['phone'],
                'password' => $data['password'],
                'pin' => Hash::make($data['pin']),
            ]);

            return $user;
        });

        AccountSetupService::make()->setUp($user, $data['referral_code'] ?? null);
        $this->recordDevice($request, $user);
        $code = $this->otp->issue($user->email, 'verify');

        // No token until the email is verified — the client takes the OTP screen
        // next and /auth/otp/verify mints the first session.
        return $this->ok('Account created successfully', [
            'user' => $this->serializeUser($user),
            'otp_sent_to' => $user->email,
            ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : []),
        ], 201);
    }

    // POST /auth/login  (password login: email or phone)
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'],
            'password' => ['required', 'string'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);

        if (!$user) {
            // Burn the same bcrypt cost as a real check so response timing does not
            // reveal whether the identifier exists.
            Hash::check($data['password'], self::DUMMY_HASH);

            return $this->fail('Invalid credentials', 401);
        }
        if (!Hash::check($data['password'], $user->password)) {
            return $this->fail('Invalid credentials', 401);
        }
        if ($user->status !== 'active') {
            return $this->fail('Account is suspended. Contact support.', 403);
        }
        if (!$user->email_verified_at) {
            // No session until the email is verified — re-issue the verify code so
            // the client can jump straight to the OTP screen.
            $this->otp->issue($user->email, 'verify');

            return $this->fail('Email not verified', 403, [
                'code' => 'unverified',
                'identifier' => $data['identifier'],
            ]);
        }

        $user->update(['last_login_at' => now()]);
        $this->recordDevice($request, $user);

        return $this->ok('Login successful', [
            'user' => $this->serializeUser($user),
            'token' => $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken,
        ]);
    }

    // POST /auth/otp/request  (passwordless login, verification, or password reset)
    public function requestOtp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'],
            'purpose' => ['required', 'in:login,verify,reset'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);
        if (!$user || $user->status !== 'active') {
            // Do not leak which identifiers exist (or that one is suspended).
            return $this->ok('If the account exists, an OTP has been sent.');
        }

        $code = $this->otp->issue($user->email, $data['purpose']);

        return $this->ok('OTP sent', [
            'sent_to' => $this->maskEmail($user->email),
            ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : []),
        ]);
    }

    // POST /auth/otp/verify  (completes passwordless login or account verification)
    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'],
            'purpose' => ['required', 'in:login,verify'],
            'code' => ['required', 'digits:6'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);
        if (!$user) {
            return $this->fail('Invalid OTP', 422);
        }

        $this->otp->verify($user->email, $data['purpose'], $data['code']);

        // Same guard as login(): a valid OTP must never mint a session for a
        // suspended account. Checked after the code so probes can't map statuses.
        if ($user->status !== 'active') {
            return $this->fail('Account is suspended. Contact support.', 403);
        }

        // OTPs are delivered by email only, so this proves the email address —
        // phone_verified_at is stamped by the Termii SMS channel (Milestone 4).
        if (!$user->email_verified_at) {
            $user->email_verified_at = now();
        }
        $user->last_login_at = now();
        $user->save();

        $this->recordDevice($request, $user);

        return $this->ok('OTP verified', [
            'user' => $this->serializeUser($user),
            'token' => $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken,
        ]);
    }

    // POST /auth/forgot-password
    public function forgotPassword(Request $request): JsonResponse
    {
        $request->merge(['purpose' => 'reset']);

        return $this->requestOtp($request);
    }

    // POST /auth/reset-password
    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'],
            'code' => ['required', 'digits:6'],
            'password' => ['required', Password::min(8)],
        ]);

        $user = $this->findByIdentifier($data['identifier']);
        if (!$user) {
            return $this->fail('Invalid OTP', 422);
        }

        $this->otp->verify($user->email, 'reset', $data['code']);
        $user->update(['password' => $data['password']]);
        $user->tokens()->delete(); // revoke all sessions

        return $this->ok('Password reset successfully. Please log in.');
    }

    // GET /auth/me
    public function me(Request $request): JsonResponse
    {
        return $this->ok('Profile fetched', ['user' => $this->serializeUser($request->user())]);
    }

    // POST /auth/logout
    public function logout(Request $request): JsonResponse
    {
        // ME-21 "Keep this phone trusted — skip the selfie check next time".
        if ($request->has('keep_trusted') && !$request->boolean('keep_trusted')) {
            $device = \App\Services\SecurityService::make()->currentDevice($request, $request->user());
            $device?->forceFill(['trusted_at' => null, 'secret_hash' => null])->save();
        }
        $request->user()->currentAccessToken()->delete();

        return $this->ok('Logged out');
    }

    private function findByIdentifier(string $identifier): ?User
    {
        if (str_contains($identifier, '@')) {
            return User::where('email', strtolower($identifier))->first();
        }

        return User::where('phone', $this->normalizePhone($identifier))->first();
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2);

        return substr($local, 0, 2) . str_repeat('*', max(strlen($local) - 2, 2)) . '@' . $domain;
    }
}
