<?php

namespace App\Http\Controllers\Api;

use App\Models\Device;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ProfileController extends ApiController
{
    // PUT /profile
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'avatar_url' => ['sometimes', 'nullable', 'url', 'max:500'],
            'username' => ['sometimes', 'string', 'regex:/^[a-zA-Z0-9_]{3,30}$/'],
        ]);

        $user = $request->user();

        // Usernames are stored lowercase and unique case-insensitively.
        if (array_key_exists('username', $data)) {
            $uname = strtolower($data['username']);
            $clash = User::whereRaw('lower(username) = ?', [$uname])
                ->where('id', '!=', $user->id)
                ->exists();
            if ($clash) {
                return $this->fail('Username already exists. Please choose another username.', 422, [
                    'username' => ['Username already exists. Please choose another username.'],
                ]);
            }
            $user->username = $uname;
            unset($data['username']);
        }

        $user->fill($data);
        $user->name = trim("{$user->first_name} {$user->last_name}");
        $user->save();

        return $this->ok('Profile updated', ['user' => $this->serializeUser($user)]);
    }

    // POST /profile/avatar  — multipart upload of a profile picture
    public function updateAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'], // 5 MB
        ]);

        $user = $request->user();
        $old = $user->avatar_url;

        // Store on the public disk (storage/app/public/avatars, served at /storage).
        $path = $request->file('avatar')->store('avatars', 'public');
        // Build an absolute URL against the host the client actually reached, so
        // the image loads from a device/emulator regardless of APP_URL.
        $user->avatar_url = $request->getSchemeAndHttpHost() . '/storage/' . $path;
        $user->save();

        // Best-effort cleanup of the previously-stored avatar file.
        if ($old && str_contains($old, '/storage/avatars/')) {
            Storage::disk('public')->delete('avatars/' . basename(parse_url($old, PHP_URL_PATH)));
        }

        return $this->ok('Profile photo updated', ['user' => $this->serializeUser($user)]);
    }

    // POST /profile/change-password
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', Password::min(8)],
        ]);

        $user = $request->user();
        if (!Hash::check($data['current_password'], $user->password)) {
            return $this->fail('Current password is incorrect');
        }

        $user->update(['password' => $data['new_password']]);

        // Revoke all other tokens so stolen sessions die with the old password
        $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()->id)->delete();

        return $this->ok('Password changed successfully');
    }

    // POST /profile/change-pin  { current_pin?, new_pin, password? }
    public function changePin(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_pin' => [Rule::requiredIf(fn () => $user->pin !== null), 'nullable', self::TXN_PIN],
            'new_pin' => ['required', self::TXN_PIN],
            // Phone sign-ups have no password; their current PIN is the check.
            'password' => [Rule::requiredIf(fn () => $user->password !== null), 'nullable', 'string'],
        ]);

        if ($user->password !== null && !Hash::check($data['password'], $user->password)) {
            return $this->fail('Password is incorrect');
        }
        if ($user->pin) {
            // Same lockout as payments, so this can't be used to guess the PIN.
            app(\App\Services\PinService::class)->verify($user, $data['current_pin']);
        }

        $user->update(['pin' => Hash::make($data['new_pin']), 'pin_length' => strlen($data['new_pin'])]);

        return $this->ok('Transaction PIN updated', ['user' => $this->serializeUser($user)]);
    }

    // POST /profile/verify-pin
    public function verifyPin(Request $request): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);

        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);

        return $this->ok('PIN verified');
    }

    // PUT /profile/onboarding  { purposes[] } — ONB-09 "What brings you to Patriai?"
    public function onboarding(Request $request): JsonResponse
    {
        $data = $request->validate([
            'purposes' => ['present', 'array', 'max:' . count(User::ONBOARDING_PURPOSES)],
            'purposes.*' => ['string', 'distinct', Rule::in(User::ONBOARDING_PURPOSES)],
        ]);

        $user = $request->user();
        $user->update(['onboarding_purposes' => array_values($data['purposes'])]);

        return $this->ok('Saved', ['user' => $this->serializeUser($user)]);
    }

    // POST /devices  (register / update push token)
    public function registerDevice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_id' => ['required', 'string', 'max:120'],
            'device_name' => ['nullable', 'string', 'max:120'],
            'platform' => ['nullable', 'in:android,ios,web'],
            'push_token' => ['nullable', 'string', 'max:500'],
        ]);

        $request->user()->devices()->updateOrCreate(
            ['device_id' => $data['device_id']],
            [
                'device_name' => $data['device_name'] ?? null,
                'platform' => $data['platform'] ?? null,
                'push_token' => $data['push_token'] ?? null,
                'last_active_at' => now(),
            ],
        );

        return $this->ok('Device registered');
    }

    // GET /devices
    public function devices(Request $request): JsonResponse
    {
        return $this->ok('Devices fetched', [
            'devices' => $request->user()->devices()->latest('last_active_at')->get()->map(fn ($d) => [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'device_name' => $d->device_name,
                'platform' => $d->platform,
                'last_active_at' => $d->last_active_at?->toIso8601String(),
            ]),
        ]);
    }

    // DELETE /devices/{device}  (remove a device and revoke its session tokens)
    public function removeDevice(Request $request, Device $device): JsonResponse
    {
        if ($device->user_id !== $request->user()->id) {
            return $this->fail('Device not found', 404);
        }

        // Login tokens are named after the device_name supplied at login ('mobile'
        // when none), so name-matching is the only token<->device linkage the schema
        // offers. Same-named devices therefore share sessions: revoking one device
        // revokes every session carrying that name — including the caller's own.
        $tokenName = $device->device_name ?? 'mobile';
        $currentSessionRevoked = $request->user()->currentAccessToken()->name === $tokenName;
        $revoked = $request->user()->tokens()->where('name', $tokenName)->delete();

        $device->delete();

        return $this->ok('Device removed', [
            'revoked_sessions' => $revoked,
            // True when the caller's own token was among those revoked; the app
            // should treat this as a signal to log itself out locally.
            'current_session_revoked' => $currentSessionRevoked,
        ]);
    }
}
