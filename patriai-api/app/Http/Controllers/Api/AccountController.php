<?php

namespace App\Http\Controllers\Api;

use App\Models\Device;
use App\Models\KycSubmission;
use App\Models\SavedAccount;
use App\Models\User;
use App\Services\AccountService;
use App\Services\LimitService;
use App\Services\MatrixBankingService;
use App\Services\OtpService;
use App\Services\PinService;
use App\Services\SecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Me and settings (client prototype ME-02…24): the security centre, limits,
 * settings, two-step verification, devices and the login history, freezing
 * and closing the account, the data download, contact details and address,
 * and the bank accounts in the person's own name.
 */
class AccountController extends ApiController
{
    /** Settings the app may change, and what each must be. */
    private const SETTINGS = [
        // ME-07 Face ID and app lock
        'face_id' => 'boolean',
        'app_lock' => 'boolean',
        'lock_after' => 'in:0,1,5,15',
        'pin_over' => 'nullable|numeric|min:0',
        'hide_balances' => 'boolean',
        // ME-12 Privacy and data
        'steward_reads_transactions' => 'boolean',
        'product_research' => 'boolean',
        'partner_offers' => 'boolean',
        // ME-13 Appearance, ME-14 Language
        'appearance' => 'in:light,dark,system',
        'bigger_text' => 'boolean',
        'reduce_motion' => 'boolean',
        'steward_matches_language' => 'boolean',
    ];

    private function settingsOf(User $user): array
    {
        return [
            'face_id' => (bool) $user->setting('face_id', false),
            'app_lock' => (bool) $user->setting('app_lock', false),
            'lock_after' => (int) $user->setting('lock_after', 1),
            'pin_over' => number_format(((int) $user->setting('pin_over', SecurityService::PIN_PROMPT_OVER)) / 100, 2, '.', ''),
            'hide_balances' => (bool) $user->setting('hide_balances', false),
            'steward_reads_transactions' => (bool) $user->setting('steward_reads_transactions', true),
            'product_research' => (bool) $user->setting('product_research', true),
            'partner_offers' => (bool) $user->setting('partner_offers', false),
            'appearance' => $user->setting('appearance', 'light'),
            'bigger_text' => (bool) $user->setting('bigger_text', true),
            'reduce_motion' => (bool) $user->setting('reduce_motion', false),
            'steward_matches_language' => (bool) $user->setting('steward_matches_language', true),
        ];
    }

    // GET /security — ME-05 Security centre
    public function security(Request $request): JsonResponse
    {
        $user = $request->user();
        $security = SecurityService::make();
        $last = $user->loginEvents()->where('status', 'ok')->latest()->first();
        $limits = LimitService::make()->tier((int) $user->kyc_tier);

        return $this->ok('Security', [
            'score' => $security->score($user),
            'pin_changed_at' => ($user->pin_changed_at ?? $user->created_at)?->toIso8601String(),
            'settings' => $this->settingsOf($user),
            'two_factor' => ['on' => $user->hasTwoFactor(), 'method' => $user->hasTwoFactor() ? $user->two_factor_method : null],
            'devices' => $user->devices()->whereNotNull('trusted_at')->count(),
            'last_login_at' => $last?->created_at?->toIso8601String(),
            'tier' => (int) $user->kyc_tier,
            'daily_limit' => number_format($limits['daily'] / 100, 2, '.', ''),
            'frozen_at' => $user->frozen_at?->toIso8601String(),
            'pin_reset_hold_until' => $user->pin_reset_hold_until?->isFuture() ? $user->pin_reset_hold_until->toIso8601String() : null,
            'pin_locked_until' => app(PinService::class)->lockedUntil($user)?->toIso8601String(),
        ]);
    }

    // GET /limits — ME-11 My limits, ME-23 Account level
    public function limits(Request $request): JsonResponse
    {
        $user = $request->user();
        $pending = KycSubmission::where('user_id', $user->id)->where('status', 'pending')->latest()->first();

        return $this->ok('Limits', LimitService::make()->summary($user) + [
            'pending_tier' => $pending?->target_tier,
            'plan' => 'free',
        ]);
    }

    // PUT /settings
    public function updateSettings(Request $request): JsonResponse
    {
        $rules = collect(self::SETTINGS)->mapWithKeys(fn ($rule, $key) => [$key => 'sometimes|' . $rule])->all();
        $data = $request->validate($rules);
        $user = $request->user();
        $settings = $user->settings ?? [];
        foreach ($data as $key => $value) {
            $settings[$key] = match ($key) {
                'lock_after' => (int) $value,
                'pin_over' => $value === null ? null : $this->toKobo((string) $value),
                'appearance' => $value,
                default => (bool) $value,
            };
        }
        $user->forceFill(['settings' => $settings])->save();

        return $this->ok('Saved', ['settings' => $this->settingsOf($user)]);
    }

    // POST /security/pin  { current_pin, new_pin, two_factor_code? } — ME-06 Change PIN
    public function changePin(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_pin' => ['required', self::TXN_PIN],
            'new_pin' => ['required', 'digits:6'],
            'two_factor_code' => ['nullable', 'string', 'max:10'],
        ]);
        $security = SecurityService::make();
        app(PinService::class)->verify($user, $data['current_pin']);
        $security->assertStrongPin($data['new_pin'], $user);
        if ($data['new_pin'] === $data['current_pin']) {
            throw ValidationException::withMessages(['new_pin' => 'Choose a PIN you haven\'t used now.']);
        }
        // ME-08 "We'll ask for it when you … change your PIN".
        if ($user->hasTwoFactor()) {
            if (empty($data['two_factor_code'])) {
                $sentTo = $user->two_factor_method === 'authenticator' ? null : $security->sendTwoFactorCode($user);

                return response()->json(['status' => false, 'message' => 'Enter your two-step code.', 'data' => ['code' => 'two_factor_required', 'method' => $user->two_factor_method, 'sent_to' => $sentTo]], 422);
            }
            $security->verifyTwoFactorCode($user, $data['two_factor_code']);
        }
        $security->setPin($user, $data['new_pin']);

        return $this->ok('PIN changed', ['user' => $this->serializeUser($user->refresh())]);
    }

    // POST /security/two-factor  { method } — ME-08
    public function startTwoFactor(Request $request): JsonResponse
    {
        $data = $request->validate(['method' => ['required', 'in:' . implode(',', SecurityService::TWO_FACTOR_METHODS)]]);

        return $this->ok('Confirm with a code', SecurityService::make()->startTwoFactor($request->user(), $data['method']));
    }

    // POST /security/two-factor/confirm  { code }
    public function confirmTwoFactor(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:10']]);
        SecurityService::make()->confirmTwoFactor($request->user(), $data['code']);

        return $this->ok('Two-step verification is on', ['method' => $request->user()->two_factor_method]);
    }

    // DELETE /security/two-factor  { pin }
    public function disableTwoFactor(Request $request): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);
        app(PinService::class)->verify($request->user(), $data['pin']);
        SecurityService::make()->disableTwoFactor($request->user());

        return $this->ok('Two-step verification is off');
    }

    // GET /security/devices — ME-09
    public function devices(Request $request): JsonResponse
    {
        $user = $request->user();
        $current = SecurityService::make()->currentDevice($request, $user);
        return $this->ok('Devices', [
            'devices' => $user->devices()->whereNotNull('trusted_at')->orderByDesc('last_active_at')->get()->map(fn (Device $d) => [
                'id' => $d->id,
                'name' => $d->device_name ?: 'Unknown device',
                'platform' => $d->platform,
                'this_device' => $current?->id === $d->id,
                'last_active_at' => $d->last_active_at?->toIso8601String(),
                'trusted_at' => $d->trusted_at?->toIso8601String(),
                'send_after' => $d->send_after?->isFuture() ? $d->send_after->toIso8601String() : null,
            ])->sortByDesc('this_device')->values(),
            // Children's phones (the child app) are not built yet.
            'children' => [],
        ]);
    }

    // POST /security/devices/{device}/logout  { forget? } — ME-24
    public function logoutDevice(Request $request, Device $device): JsonResponse
    {
        if ($device->user_id !== $request->user()->id) {
            return $this->fail('Device not found', 404);
        }
        $data = $request->validate(['forget' => ['sometimes', 'boolean']]);
        $ended = SecurityService::make()->logOutDevice($request->user(), $device, $request->boolean('forget', true));

        return $this->ok('Logged out', ['ended_sessions' => $ended, 'forgotten' => $request->boolean('forget', true)]);
    }

    // POST /security/devices/logout-others — ME-09 "Log out of all other devices"
    public function logoutOthers(Request $request): JsonResponse
    {
        $user = $request->user();
        $security = SecurityService::make();
        $current = $security->currentDevice($request, $user);
        $ended = 0;
        foreach ($user->devices()->whereNotNull('trusted_at')->get() as $device) {
            if ($current?->id !== $device->id) {
                $ended += $security->logOutDevice($user, $device, true);
            }
        }
        // Sessions from before devices were named end too.
        $ended += $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->where('name', 'not like', 'device:%')->delete();

        return $this->ok('Logged out of other devices', ['ended_sessions' => $ended]);
    }

    // GET /security/logins — ME-10 Login history (last 30 days)
    public function logins(Request $request): JsonResponse
    {
        $events = $request->user()->loginEvents()->where('created_at', '>=', now()->subDays(30))->latest()->limit(100)->get();
        $blocked = $events->firstWhere(fn ($e) => $e->status !== 'ok');

        return $this->ok('Login history', [
            'logins' => $events->map(fn ($e) => [
                'id' => $e->id,
                'at' => $e->created_at?->toIso8601String(),
                'device' => $e->device_name ?: ucfirst((string) ($e->platform ?: 'Unknown device')),
                'platform' => $e->platform,
                'status' => $e->status,
                'reason' => $e->reason,
                'new_device' => $e->new_device,
                'ip' => $e->ip,
            ]),
            // "We blocked a sign-in … If that wasn't you trying, change your PIN."
            'warning' => $blocked ? [
                'at' => $blocked->created_at?->toIso8601String(),
                'reason' => $blocked->reason,
                'device' => $blocked->device_name ?: 'an unknown device',
            ] : null,
        ]);
    }

    // POST /account/freeze — ME-18
    public function freeze(Request $request): JsonResponse
    {
        $user = $request->user();
        AccountService::make()->freeze($user, 'app', $user->currentAccessToken()->id);

        return $this->ok('Account frozen', ['user' => $this->serializeUser($user->refresh())]);
    }

    // POST /account/unfreeze  multipart { pin, selfie }
    public function unfreeze(Request $request): JsonResponse
    {
        $data = $request->validate([
            'pin' => ['required', self::TXN_PIN],
            'selfie' => ['required', 'file', 'image', 'max:8192'],
        ], ['selfie.required' => 'Take a selfie to unfreeze.']);
        $user = $request->user();
        app(PinService::class)->verify($user, $data['pin']);
        $path = $request->file('selfie')->store("selfies/{$user->id}", 'local');
        AccountService::make()->unfreeze($user, $path);

        return $this->ok('Account unfrozen', ['user' => $this->serializeUser($user->refresh())]);
    }

    // GET /account/close — ME-22 "Before you go"
    public function closeChecklist(Request $request): JsonResponse
    {
        return $this->ok('Before you go', AccountService::make()->closeChecklist($request->user()));
    }

    // POST /account/close  { pin }
    public function close(Request $request): JsonResponse
    {
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);
        $user = $request->user();
        app(PinService::class)->verify($user, $data['pin']);
        AccountService::make()->close($user);

        return $this->ok('Account closed');
    }

    // POST /account/export — ME-12 "Download my data"
    public function export(Request $request): JsonResponse
    {
        return $this->ok('On its way', ['sent_to' => AccountService::make()->exportData($request->user())]);
    }

    // GET /profile/details — ME-03 Personal details
    public function details(Request $request): JsonResponse
    {
        $user = $request->user();
        $kyc = KycSubmission::where('user_id', $user->id)->where('status', 'approved')->get();
        $value = fn (string $key) => $kyc->map(fn ($s) => $s->payload[$key] ?? null)->filter()->last();
        $mask = fn (?string $v) => $v ? '•••••••' . substr($v, -4) : null;
        $pending = KycSubmission::where('user_id', $user->id)->where('status', 'pending')->get();
        $waiting = fn (string $key) => $pending->contains(fn ($s) => !empty($s->payload[$key]));

        return $this->ok('Personal details', [
            'date_of_birth' => $user->date_of_birth?->toDateString(),
            'bvn' => $mask($value('bvn')),
            'nin' => $mask($value('nin')),
            'bvn_pending' => $waiting('bvn'),
            'nin_pending' => $waiting('nin'),
            'address' => $user->address,
            'city' => $user->city,
            'state' => $user->state,
            'name_locked' => (int) $user->kyc_tier >= 1,
        ]);
    }

    // PUT /profile/details  { address, city, state }
    public function updateDetails(Request $request): JsonResponse
    {
        $data = $request->validate([
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
        ]);
        $request->user()->forceFill($data)->save();

        return $this->details($request);
    }

    // POST /profile/email  { email } — a code to the new address (ME-02 Edit)
    public function startEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:190', 'unique:users,email']]);
        $code = app(OtpService::class)->issue(strtolower($data['email']), 'email_change', 'email');

        return $this->ok('Code sent', ['sent_to' => strtolower($data['email']), ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : [])]);
    }

    // POST /profile/email/confirm  { email, code }
    public function confirmEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:190', 'unique:users,email'], 'code' => ['required', 'digits:6']]);
        $email = strtolower($data['email']);
        app(OtpService::class)->verify($email, 'email_change', $data['code']);
        $request->user()->forceFill(['email' => $email, 'email_verified_at' => now()])->save();

        return $this->ok('Email changed', ['user' => $this->serializeUser($request->user()->refresh())]);
    }

    // POST /profile/phone  { phone, channel } — ME-02 "Changing it needs a selfie check"
    public function startPhone(Request $request): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:20'], 'channel' => ['nullable', 'in:sms,whatsapp']]);
        $phone = $this->validPhone($data['phone']);
        if (User::where('phone', $phone)->exists()) {
            throw ValidationException::withMessages(['phone' => 'This number is already on an account.']);
        }
        $code = app(OtpService::class)->issue($phone, 'phone_change', $data['channel'] ?? 'sms');

        return $this->ok('Code sent', ['sent_to' => substr($phone, 0, 4) . ' ••• ' . substr($phone, -4), ...(config('app.debug') && !app()->isProduction() ? ['debug_otp' => $code] : [])]);
    }

    // POST /profile/phone/confirm  multipart { phone, code, selfie }
    public function confirmPhone(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'code' => ['required', 'digits:6'],
            'selfie' => ['required', 'file', 'image', 'max:8192'],
        ], ['selfie.required' => 'Take a selfie to change your number.']);
        $user = $request->user();
        $phone = $this->normalizePhone($data['phone']);
        if (User::where('phone', $phone)->where('id', '!=', $user->id)->exists()) {
            throw ValidationException::withMessages(['phone' => 'This number is already on an account.']);
        }
        app(OtpService::class)->verify($phone, 'phone_change', $data['code']);
        $path = $request->file('selfie')->store("selfies/{$user->id}", 'local');
        $settings = $user->settings ?? [];
        $settings['phone_changes'][] = ['from' => $user->phone, 'to' => $phone, 'at' => now()->toIso8601String(), 'selfie' => $path];
        $user->forceFill(['phone' => $phone, 'phone_verified_at' => now(), 'settings' => $settings])->save();

        return $this->ok('Phone changed', ['user' => $this->serializeUser($user->refresh())]);
    }

    // GET /bank-accounts — ME-04 Linked bank accounts (in your own name)
    public function bankAccounts(Request $request): JsonResponse
    {
        $user = $request->user();
        $default = (int) $user->setting('default_bank_account_id', 0);
        $accounts = SavedAccount::where('user_id', $user->id)->where('category', 'own')->orderBy('id')->get();
        if (!$default && $accounts->isNotEmpty()) {
            $default = $accounts->first()->id;
        }

        return $this->ok('Linked bank accounts', [
            'accounts' => $accounts->map(fn (SavedAccount $a) => [
                'id' => $a->id,
                'bank_name' => $a->bank_name,
                'bank_code' => $a->bank_code,
                'account_number' => $a->account_number,
                'masked' => '•••• ' . substr($a->account_number, -4),
                'account_name' => $a->account_name,
                'nickname' => $a->nickname,
                'default' => $a->id === $default,
            ]),
        ]);
    }

    // POST /bank-accounts  { bank_code, account_number, nickname? }
    public function linkBankAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'bank_code' => ['required', 'string', 'max:10'],
            'account_number' => ['required', 'digits:10'],
            'nickname' => ['nullable', 'string', 'max:60'],
        ]);
        try {
            $checked = MatrixBankingService::make()->verifyBankAccount($data['account_number'], $data['bank_code']);
        } catch (\RuntimeException $e) {
            return $this->fail($e->getMessage(), 422);
        }
        $name = trim("{$checked['first_name']} {$checked['last_name']}");
        // "You can only withdraw to accounts in your own name."
        $mine = collect([$user->first_name, $user->last_name])->filter()->every(fn ($w) => Str::contains(Str::upper($name), Str::upper(trim($w))));
        if (!$mine) {
            return $this->fail("This account is in the name {$name}. Link only accounts in your own name.", 422);
        }
        $account = SavedAccount::updateOrCreate(
            ['user_id' => $user->id, 'bank_code' => $data['bank_code'], 'account_number' => $data['account_number']],
            ['account_name' => $name, 'bank_name' => $checked['bank_name'], 'nickname' => trim((string) ($data['nickname'] ?? '')) ?: $checked['bank_name'], 'category' => 'own', 'listed' => false],
        );

        return $this->ok('Bank account linked', ['id' => $account->id], 201);
    }

    // PATCH /bank-accounts/{account}/default
    public function defaultBankAccount(Request $request, SavedAccount $account): JsonResponse
    {
        if ($account->user_id !== $request->user()->id || $account->category !== 'own') {
            return $this->fail('Account not found', 404);
        }
        $settings = $request->user()->settings ?? [];
        $settings['default_bank_account_id'] = $account->id;
        $request->user()->forceFill(['settings' => $settings])->save();

        return $this->bankAccounts($request);
    }

    // DELETE /bank-accounts/{account}
    public function removeBankAccount(Request $request, SavedAccount $account): JsonResponse
    {
        if ($account->user_id !== $request->user()->id || $account->category !== 'own') {
            return $this->fail('Account not found', 404);
        }
        $account->delete();

        return $this->bankAccounts($request);
    }
}
