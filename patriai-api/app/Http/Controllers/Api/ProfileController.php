<?php

namespace App\Http\Controllers\Api;

use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
        ]);

        $user = $request->user();
        $user->fill($data);
        $user->name = trim("{$user->first_name} {$user->last_name}");
        $user->save();

        return $this->ok('Profile updated', ['user' => $this->serializeUser($user)]);
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

    // POST /profile/change-pin
    public function changePin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_pin' => [Rule::requiredIf(fn () => $request->user()->pin !== null), 'nullable', 'digits:4'],
            'new_pin' => ['required', 'digits:4'],
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (!Hash::check($data['password'], $user->password)) {
            return $this->fail('Password is incorrect');
        }
        if ($user->pin && (!($data['current_pin'] ?? null) || !Hash::check($data['current_pin'], $user->pin))) {
            return $this->fail('Current PIN is incorrect');
        }

        $user->update(['pin' => Hash::make($data['new_pin'])]);

        return $this->ok('Transaction PIN updated');
    }

    // POST /profile/verify-pin
    public function verifyPin(Request $request): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', 'digits:4']]);

        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);

        return $this->ok('PIN verified');
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
