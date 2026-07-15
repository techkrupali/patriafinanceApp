<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\WalletInvitation;
use App\Services\NotificationService;
use App\Services\OtpService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends ApiController
{
    public function __construct(private readonly OtpService $otp) {}

    // POST /auth/register
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['required', 'regex:/^\d{10,15}$/', 'unique:users,phone'],
            'password' => ['required', Password::min(8)],
            'pin' => ['required', 'digits:4'],
            'device_id' => ['nullable', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
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

        // Main wallet + funding virtual account on the banking rails.
        WalletService::make()->createWallet($user, 'main', 'Main Wallet');

        // Link any invitations that were addressed to this person before they had an
        // account (by email or phone) so they surface immediately under /invitations.
        $pendingInvites = WalletInvitation::where('status', 'pending')
            ->whereNull('invitee_user_id')
            ->where(function ($q) use ($user) {
                $q->where('invitee_identifier', strtolower($user->email))
                    ->orWhere('invitee_identifier', $user->phone);
            })
            ->get();

        foreach ($pendingInvites as $invite) {
            $invite->update(['invitee_user_id' => $user->id]);
            $invite->load(['wallet', 'inviter']);
            NotificationService::make()->push(
                $user,
                'invitation_received',
                'Invitation to join ' . ($invite->wallet?->name ?? 'a wallet'),
                ($invite->inviter?->fullName() ?: 'Someone') . ' invited you to join ' . ($invite->wallet?->name ?? 'a wallet') . " as {$invite->role}.",
                [
                    'invitation_id' => $invite->id,
                    'wallet_id' => $invite->wallet_id,
                    'wallet_name' => $invite->wallet?->name,
                    'role' => $invite->role,
                ],
            );
        }

        $user->refresh(); // pick up DB-level defaults (role, status, kyc_tier)
        $this->registerDevice($request, $user);
        $code = $this->otp->issue($user->email, 'verify');
        $token = $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken;

        return $this->ok('Account created successfully', [
            'user' => $this->serializeUser($user),
            'token' => $token,
            'otp_sent_to' => $user->email,
            ...(config('app.debug') ? ['debug_otp' => $code] : []),
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

        if (!$user || !Hash::check($data['password'], $user->password)) {
            return $this->fail('Invalid credentials', 401);
        }
        if ($user->status !== 'active') {
            return $this->fail('Account is suspended. Contact support.', 403);
        }

        $user->update(['last_login_at' => now()]);
        $this->registerDevice($request, $user);

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
        if (!$user) {
            // Do not leak which identifiers exist.
            return $this->ok('If the account exists, an OTP has been sent.');
        }

        $code = $this->otp->issue($user->email, $data['purpose']);

        return $this->ok('OTP sent', [
            'sent_to' => $this->maskEmail($user->email),
            ...(config('app.debug') ? ['debug_otp' => $code] : []),
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

        if (!$user->email_verified_at) {
            $user->email_verified_at = now();
        }
        if (!$user->phone_verified_at) {
            $user->phone_verified_at = now();
        }
        $user->last_login_at = now();
        $user->save();

        $this->registerDevice($request, $user);

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
        $request->user()->currentAccessToken()->delete();

        return $this->ok('Logged out');
    }

    private function findByIdentifier(string $identifier): ?User
    {
        return str_contains($identifier, '@')
            ? User::where('email', strtolower($identifier))->first()
            : User::where('phone', $identifier)->first();
    }

    private function registerDevice(Request $request, User $user): void
    {
        if (!$request->filled('device_id')) {
            return;
        }

        $user->devices()->updateOrCreate(
            ['device_id' => $request->input('device_id')],
            [
                'device_name' => $request->input('device_name'),
                'platform' => $request->input('platform'),
                'last_active_at' => now(),
            ],
        );
    }

    private function maskEmail(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2);

        return substr($local, 0, 2) . str_repeat('*', max(strlen($local) - 2, 2)) . '@' . $domain;
    }
}
