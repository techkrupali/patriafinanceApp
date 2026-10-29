<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Http\Controllers\Api\SupportChatController;
use App\Models\Device;
use App\Models\KycSubmission;
use App\Models\SupportMessage;
use App\Models\SupportRequest;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AccountService;
use App\Services\KycService;
use App\Services\LimitService;
use App\Services\NotificationService;
use App\Services\PinService;
use App\Services\SecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Admin side of settings, log in and system states: a person's protections
 * (two-step, PIN lock, holds, freeze), devices with their selfies, the login
 * history, today's limits; KYC photos and documents; support chat replies;
 * and the platform switches (maintenance, minimum app version, support phone).
 */
class AdminSecurityController extends ApiController
{
    // GET /admin/users/{user}/security
    public function show(User $user): JsonResponse
    {
        return $this->ok('Security', [
            'two_factor' => ['on' => $user->hasTwoFactor(), 'method' => $user->two_factor_method],
            'score' => SecurityService::make()->score($user),
            'pin_changed_at' => $user->pin_changed_at?->toIso8601String(),
            'pin_locked_until' => app(PinService::class)->lockedUntil($user)?->toIso8601String(),
            'pin_reset_hold_until' => $user->pin_reset_hold_until?->isFuture() ? $user->pin_reset_hold_until->toIso8601String() : null,
            'frozen_at' => $user->frozen_at?->toIso8601String(),
            'closed_at' => $user->closed_at?->toIso8601String(),
            'settings' => collect($user->settings ?? [])->only(['app_lock', 'lock_after', 'face_id', 'hide_balances', 'steward_reads_transactions', 'product_research', 'partner_offers', 'consents'])->all(),
            'limits' => LimitService::make()->summary($user),
            'devices' => $user->devices()->orderByDesc('last_active_at')->get()->map(fn (Device $d) => [
                'id' => $d->id,
                'name' => $d->device_name ?: 'Unknown device',
                'platform' => $d->platform,
                'ip' => $d->ip,
                'trusted' => $d->trusted_at !== null,
                'trusted_at' => $d->trusted_at?->toIso8601String(),
                'send_after' => $d->send_after?->isFuture() ? $d->send_after->toIso8601String() : null,
                'last_active_at' => $d->last_active_at?->toIso8601String(),
                'selfie' => (bool) $d->selfie_path,
            ]),
            'logins' => $user->loginEvents()->latest()->limit(50)->get()->map(fn ($e) => [
                'id' => $e->id,
                'at' => $e->created_at?->toIso8601String(),
                'status' => $e->status,
                'reason' => $e->reason,
                'device' => $e->device_name ?: ucfirst((string) ($e->platform ?: 'unknown')),
                'ip' => $e->ip,
                'new_device' => $e->new_device,
            ]),
        ]);
    }

    // POST /admin/users/{user}/unlock-pin — after checking it's them (ACC-07)
    public function unlockPin(User $user): JsonResponse
    {
        app(PinService::class)->clear($user);
        NotificationService::make()->push($user, 'security_pin_unlocked', 'Your PIN is unlocked', 'Patriai support unlocked your PIN. Wasn\'t expecting this? Freeze your account.', []);

        return $this->ok('PIN unlocked');
    }

    // POST /admin/users/{user}/unfreeze — ME-18, when the person can't take a selfie
    public function unfreeze(Request $request, User $user): JsonResponse
    {
        if (!$user->isFrozen()) {
            return $this->fail('This account is not frozen', 422);
        }
        AccountService::make()->unfreeze($user, null, $request->user()->id);

        return $this->ok('Account unfrozen');
    }

    // POST /admin/users/{user}/lift-holds — the 24-hour holds after a new phone or a PIN reset
    public function liftHolds(User $user): JsonResponse
    {
        $user->forceFill(['pin_reset_hold_until' => null])->save();
        $user->devices()->whereNotNull('send_after')->update(['send_after' => null]);

        return $this->ok('Holds lifted');
    }

    // POST /admin/users/{user}/devices/{device}/logout
    public function logoutDevice(User $user, Device $device): JsonResponse
    {
        if ($device->user_id !== $user->id) {
            return $this->fail('Device not found', 404);
        }

        return $this->ok('Logged out', ['ended_sessions' => SecurityService::make()->logOutDevice($user, $device, true)]);
    }

    private function file(?string $path): Response
    {
        if (!$path || !Storage::disk('local')->exists($path)) {
            abort(404);
        }

        return response(Storage::disk('local')->get($path), 200, [
            'Content-Type' => Storage::disk('local')->mimeType($path) ?: 'application/octet-stream',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    // GET /admin/devices/{device}/selfie
    public function deviceSelfie(Device $device): Response
    {
        return $this->file($device->selfie_path);
    }

    // GET /admin/users/{user}/unfreeze-selfie
    public function unfreezeSelfie(User $user): Response
    {
        return $this->file($user->setting('last_unfreeze')['selfie'] ?? null);
    }

    // GET /admin/kyc/{submission}/files/{key}
    public function kycFile(KycSubmission $submission, string $key): Response
    {
        if (!in_array($key, KycService::FILES, true)) {
            abort(404);
        }

        return $this->file($submission->payload[$key] ?? null);
    }

    // GET /admin/support-requests/{supportRequest}/messages
    public function messages(SupportRequest $supportRequest): JsonResponse
    {
        return $this->ok('Messages', ['messages' => $supportRequest->messages()->with('sender')->get()->map(fn ($m) => SupportChatController::serializeMessage($m))]);
    }

    // POST /admin/support-requests/{supportRequest}/messages  { body }
    public function reply(Request $request, SupportRequest $supportRequest): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $message = SupportMessage::create([
            'support_request_id' => $supportRequest->id,
            'sender_id' => $request->user()->id,
            'from' => 'support',
            'body' => $data['body'],
        ]);
        if ($supportRequest->status === 'pending') {
            $supportRequest->update(['status' => 'in_review']);
        }
        if ($supportRequest->user) {
            NotificationService::make()->push($supportRequest->user, 'support_reply', 'Patriai support replied', mb_strimwidth($data['body'], 0, 120, '…'), ['support_request_id' => $supportRequest->id]);
        }

        return $this->ok('Sent', ['message' => SupportChatController::serializeMessage($message->load('sender'))], 201);
    }

    // GET /admin/system-settings
    public function settings(): JsonResponse
    {
        return $this->ok('Settings', collect(array_keys(SystemSetting::DEFAULTS))->mapWithKeys(fn ($k) => [$k => SystemSetting::get($k)])->all() + [
            'tiers' => array_map(fn ($n) => LimitService::make()->tier($n), [1, 2, 3]),
        ]);
    }

    // PUT /admin/system-settings
    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'min_app_version' => ['sometimes', 'regex:/^\d+\.\d+\.\d+$/'],
            'latest_app_version' => ['sometimes', 'regex:/^\d+\.\d+\.\d+$/'],
            'support_phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'maintenance' => ['sometimes', 'array'],
            'maintenance.on' => ['required_with:maintenance', 'boolean'],
            'maintenance.until' => ['nullable', 'string', 'max:40'],
            'maintenance.message' => ['nullable', 'string', 'max:200'],
        ]);
        foreach ($data as $key => $value) {
            if ($key === 'maintenance') {
                $value = ['on' => (bool) $value['on'], 'until' => $value['until'] ?? null, 'message' => $value['message'] ?? null];
            }
            SystemSetting::put($key, $value, $request->user()->id);
        }

        return $this->settings();
    }
}
