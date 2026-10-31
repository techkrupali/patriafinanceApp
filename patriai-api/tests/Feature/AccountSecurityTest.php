<?php

namespace Tests\Feature;

use App\Models\KycSubmission;
use App\Models\OtpCode;
use App\Models\SupportRequest;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\SecurityService;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Settings, log in and system states (client prototype ME-02…24, ACC-01…07,
 * ONB-10/11, SYS-02/03): trusted phones and new-device holds, tier limits,
 * the hold after a PIN reset, two-step verification, devices and the login
 * history, freezing and closing, support chat, maintenance and the admin side.
 */
class AccountSecurityTest extends TestCase
{
    use RefreshDatabase;

    /** Who the fake bank says owns an account. */
    private array $bankName = ['NGOZI', 'OKAFOR'];

    private const PHONE = '+2348034127790';

    private const DEVICE = ['device_id' => 'iphone-15', 'device_name' => 'iPhone 15', 'platform' => 'ios'];

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/verify-bank-account')) {
                return Http::response(['status' => true, 'data' => ['first_name' => $this->bankName[0], 'last_name' => $this->bankName[1], 'bank_name' => 'Zenith Bank']]);
            }

            return Http::response(['status' => true, 'data' => ['token' => 't']]);
        });
    }

    private function code(string $phone = self::PHONE): string
    {
        OtpCode::query()->delete();

        return $this->postJson('/api/v1/auth/phone/start', ['phone' => $phone, 'channel' => 'sms'])->assertOk()->json('data.debug_otp');
    }

    private function phoneToken(array $device = self::DEVICE): array
    {
        return $this->postJson('/api/v1/auth/phone/verify', ['phone' => self::PHONE, 'code' => $this->code()] + $device)->assertOk()->json('data');
    }

    private function signUp(): array
    {
        $token = $this->phoneToken()['phone_token'];

        return $this->postJson('/api/v1/auth/phone/register', [
            'phone_token' => $token,
            'first_name' => 'Ngozi',
            'last_name' => 'Okafor',
            'email' => 'ngozi@example.com',
            'date_of_birth' => '1986-02-14',
            'pin' => '482915',
            'consents' => ['terms' => true, 'verify' => true, 'steward_learn' => false, 'news' => false],
        ] + self::DEVICE)->assertCreated()->json('data');
    }

    private function withMain(User $user): User
    {
        Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);

        return $user;
    }

    private function wallets(User $user, int $main = 100_000_000): array
    {
        $mainWallet = $user->mainWallet() ?? Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);
        $mainWallet->update(['balance' => $main]);

        return [$mainWallet->fresh()];
    }

    public function test_sign_up_records_consent_and_a_trusted_phone_skips_the_code(): void
    {
        $out = $this->signUp();
        $user = User::where('phone', self::PHONE)->first();
        $this->assertTrue($user->settings['consents']['terms']);
        $this->assertFalse($user->settings['steward_reads_transactions']);
        $this->assertNotEmpty($out['device_secret']);

        // ACC-01 → ACC-02: the same phone, holding its secret, goes straight to the PIN.
        $this->postJson('/api/v1/auth/phone/check', ['phone' => self::PHONE, 'device_secret' => $out['device_secret']] + self::DEVICE)
            ->assertOk()->assertJsonPath('data.next', 'pin')->assertJsonPath('data.account.first_name', 'Ngozi');
        // Anyone else gets a code, exactly as for a number with no account.
        OtpCode::query()->delete();
        $this->postJson('/api/v1/auth/phone/check', ['phone' => self::PHONE, 'device_id' => 'iphone-15', 'device_secret' => 'guess'])
            ->assertOk()->assertJsonPath('data.next', 'code');
        OtpCode::query()->delete();
        $this->postJson('/api/v1/auth/phone/check', ['phone' => '+2348000000999'])->assertOk()->assertJsonPath('data.next', 'code');

        // ONB-06/10: weak PINs and missing consent are refused.
        $token = $this->postJson('/api/v1/auth/phone/verify', ['phone' => '+2348000000999', 'code' => $this->code('+2348000000999')])->json('data.phone_token');
        $base = ['phone_token' => $token, 'first_name' => 'Ada', 'last_name' => 'Eze', 'email' => 'ada@example.com', 'date_of_birth' => '1990-03-07'];
        $this->postJson('/api/v1/auth/phone/register', $base + ['pin' => '070390'])->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->postJson('/api/v1/auth/phone/register', $base + ['pin' => '654321'])->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->postJson('/api/v1/auth/phone/register', $base + ['pin' => '482915', 'consents' => ['terms' => true, 'verify' => false]])->assertStatus(422)->assertJsonValidationErrors('consents');
        // ONB-11: a referral code names who it's from.
        $this->postJson('/api/v1/auth/referral', ['code' => $user->referral_code])->assertOk()->assertJsonPath('data.from', 'Ngozi Okafor');
    }

    public function test_a_new_phone_needs_a_selfie_and_sends_only_after_24_hours(): void
    {
        $this->signUp();
        $user = User::where('phone', self::PHONE)->first();
        $user->forceFill(['kyc_tier' => 3])->save();
        [$main] = $this->wallets($user);
        $emeka = $this->withMain(User::factory()->create(['first_name' => 'Emeka']));
        $savings = Wallet::create(['user_id' => $user->id, 'type' => 'savings', 'name' => 'Rent', 'balance' => 0]);
        WalletMember::create(['wallet_id' => $savings->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        $samsung = ['device_id' => 'galaxy-a54', 'device_name' => 'Samsung Galaxy A54', 'platform' => 'android'];
        $verified = $this->phoneToken($samsung);
        $this->assertTrue($verified['account']['new_device']);
        $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '482915'] + $samsung)
            ->assertStatus(422)->assertJsonPath('data.code', 'selfie_required');
        $out = $this->post('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '482915', 'selfie' => UploadedFile::fake()->image('me.jpg')] + $samsung, ['Accept' => 'application/json'])
            ->assertOk()->json('data');
        $this->assertNotNull($out['send_after']);

        // Receive now, send after 24 hours; moving between your own wallets is fine.
        $this->app['auth']->forgetGuards();
        $as = fn () => $this->withHeader('Authorization', "Bearer {$out['token']}");
        $as()->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1000', 'pin' => '482915', 'destination' => ['kind' => 'user', 'identifier' => $emeka->phone]])
            ->assertStatus(422)->assertJsonPath('data.code', 'new_device');
        $as()->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1000', 'pin' => '482915', 'destination' => ['kind' => 'wallet', 'wallet_id' => $savings->id]])
            ->assertOk();
        $this->travel(25)->hours();
        $as()->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1000', 'pin' => '482915', 'destination' => ['kind' => 'user', 'identifier' => $emeka->phone]])
            ->assertOk();

        // ME-10: the new phone is in the history.
        $as()->getJson('/api/v1/security/logins')->assertOk()->assertJsonPath('data.logins.0.new_device', true);
    }

    public function test_tier_limits_single_daily_balance_wallets_and_sharing(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 1, 'first_name' => 'Ngozi']);
        [$main] = $this->wallets($ngozi, 50_000_000);
        $ada = User::factory()->create(['kyc_tier' => 1, 'first_name' => 'Ada']);
        $adaMain = Wallet::create(['user_id' => $ada->id, 'type' => 'main', 'name' => 'Main', 'balance' => 28_000_000]);
        Sanctum::actingAs($ngozi);
        $send = fn (string $amount, string $to) => $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => $amount, 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $to]]);

        // ME-23 Tier 1: one payment and a day are ₦50,000; Ada can hold ₦300,000.
        $send('60000', $ada->phone)->assertStatus(422)->assertJsonPath('data.code', 'single_limit');
        $send('30000', $ada->phone)->assertStatus(422)->assertJsonPath('data.code', 'recipient_limit');
        $send('20000', $ada->phone)->assertOk();
        $ada->forceFill(['kyc_tier' => 2])->save();
        $send('40000', $ada->phone)->assertStatus(422)->assertJsonPath('data.code', 'daily_limit')->assertJsonPath('data.left', '30000.00');
        $this->getJson('/api/v1/limits')->assertOk()
            ->assertJsonPath('data.daily', '50000.00')
            ->assertJsonPath('data.left_today', '30000.00')
            ->assertJsonPath('data.max_balance', '300000.00')
            ->assertJsonPath('data.max_wallets', 1)
            ->assertJsonPath('data.next.daily', '200000.00');

        // "1 wallet" on Tier 1; shared wallets from Tier 2.
        $this->expectWalletBlocked($ngozi);
        $ngozi->forceFill(['kyc_tier' => 2])->save();
        $goal = WalletService::make()->createWallet($ngozi->fresh(), 'goal', 'Fees');
        $this->assertSame('goal', $goal->type);
        $this->postJson("/api/v1/wallets/{$goal->id}/invitations", ['identifier' => $ada->phone, 'role' => 'contributor'])->assertCreated();
        WalletService::make()->createWallet($ngozi->fresh(), 'savings', 'Rent');
        $this->expectWalletBlocked($ngozi->fresh());
        $adaShared = Wallet::create(['user_id' => $ada->id, 'type' => 'savings', 'name' => 'Ada savings', 'balance' => 0]);
        $ada->forceFill(['kyc_tier' => 1])->save();
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/wallets/{$adaShared->id}/invitations", ['identifier' => $ngozi->phone, 'role' => 'contributor'])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Shared wallets start at Tier 2. Verify your NIN and a selfie to invite people.']);
        $this->assertSame(28_000_000 + 2_000_000, $adaMain->fresh()->balance);
    }

    private function expectWalletBlocked(User $user): void
    {
        try {
            WalletService::make()->createWallet($user, 'savings', 'More');
            $this->fail('Wallet should be blocked by the tier');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('wallet', $e->errors());
        }
    }

    public function test_two_step_on_big_payments_and_pin_changes(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 3, 'date_of_birth' => '1986-02-14']);
        [$main] = $this->wallets($ngozi, 200_000_000);
        $emeka = $this->withMain(User::factory()->create(['kyc_tier' => 3]));
        Sanctum::actingAs($ngozi);

        $setup = $this->postJson('/api/v1/security/two-factor', ['method' => 'authenticator'])->assertOk()->json('data');
        $this->assertStringStartsWith('otpauth://totp/', $setup['otpauth']);
        $now = SecurityService::totp($setup['secret'], intdiv(time(), 30));
        $this->postJson('/api/v1/security/two-factor/confirm', ['code' => '000000'])->assertStatus(422);
        $this->postJson('/api/v1/security/two-factor/confirm', ['code' => $now])->assertOk();
        $this->getJson('/api/v1/security')->assertJsonPath('data.two_factor.on', true)->assertJsonPath('data.score.checks.two_factor', true);

        // ME-08 "send over ₦500,000".
        $payload = ['from_wallet_id' => $main->id, 'amount' => '600000', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $emeka->phone]];
        $this->postJson('/api/v1/transfers', $payload)->assertStatus(422)->assertJsonPath('data.code', 'two_factor_required');
        $this->postJson('/api/v1/transfers', $payload + ['two_factor_code' => SecurityService::totp($setup['secret'], intdiv(time(), 30))])->assertOk();
        $this->postJson('/api/v1/transfers', ['amount' => '100000'] + $payload)->assertOk();

        // ME-06: change the PIN — strong only, and the two-step code.
        $this->postJson('/api/v1/security/pin', ['current_pin' => '1234', 'new_pin' => '140286'])->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->postJson('/api/v1/security/pin', ['current_pin' => '1234', 'new_pin' => '111111'])->assertStatus(422);
        $this->postJson('/api/v1/security/pin', ['current_pin' => '1234', 'new_pin' => '482915'])->assertStatus(422)->assertJsonPath('data.code', 'two_factor_required');
        $this->postJson('/api/v1/security/pin', ['current_pin' => '1234', 'new_pin' => '482915', 'two_factor_code' => SecurityService::totp($setup['secret'], intdiv(time(), 30))])->assertOk();
        $this->assertNotNull($ngozi->fresh()->pin_changed_at);
    }

    public function test_pin_reset_holds_payments_over_50000_for_a_day(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 3]);
        [$main] = $this->wallets($ngozi);
        $emeka = $this->withMain(User::factory()->create(['kyc_tier' => 3]));
        $ngozi->forceFill(['pin_reset_hold_until' => now()->addHours(24)])->save();
        Sanctum::actingAs($ngozi);
        $payload = fn ($amount) => ['from_wallet_id' => $main->id, 'amount' => $amount, 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $emeka->phone]];
        $this->postJson('/api/v1/transfers', $payload('60000'))->assertStatus(422)->assertJsonPath('data.code', 'pin_reset_hold');
        $this->postJson('/api/v1/transfers', $payload('50000'))->assertOk();
    }

    public function test_devices_log_out_one_or_all_others(): void
    {
        $this->signUp();
        $user = User::where('phone', self::PHONE)->first();
        $samsung = ['device_id' => 'galaxy-a54', 'device_name' => 'Samsung Galaxy A54', 'platform' => 'android'];
        $other = $this->post('/api/v1/auth/phone/login', ['phone_token' => $this->phoneToken($samsung)['phone_token'], 'pin' => '482915', 'selfie' => UploadedFile::fake()->image('me.jpg')] + $samsung, ['Accept' => 'application/json'])->json('data.token');
        $mine = $user->tokens()->where('name', 'device:iphone-15')->first();
        $this->assertNotNull($mine);

        $iphone = $user->devices()->where('device_id', 'iphone-15')->first();
        Sanctum::actingAs($user, ['*']);
        $list = $this->getJson('/api/v1/security/devices')->assertOk()->json('data.devices');
        $this->assertCount(2, $list);

        // ME-24 "Log out iPad Air" — and stop trusting it.
        $galaxy = $user->devices()->where('device_id', 'galaxy-a54')->first();
        $this->postJson("/api/v1/security/devices/{$galaxy->id}/logout", ['forget' => true])->assertOk()->assertJsonPath('data.ended_sessions', 1);
        $this->assertNull($galaxy->fresh()->trusted_at);
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$other}")->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->assertNotNull($iphone->fresh()->trusted_at);
    }

    public function test_freeze_and_unfreeze_with_pin_and_selfie(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 3, 'phone' => self::PHONE]);
        [$main] = $this->wallets($ngozi);
        $emeka = $this->withMain(User::factory()->create(['kyc_tier' => 3]));
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/account/freeze')->assertOk()->assertJsonPath('data.user.frozen', true);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1000', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $emeka->phone]])
            ->assertStatus(423)->assertJsonPath('data.code', 'frozen');
        $this->assertFalse($main->fresh()->canSpend($ngozi->fresh()));
        // Money still comes in.
        WalletService::make()->transferBetweenWallets(Wallet::create(['user_id' => $emeka->id, 'type' => 'main', 'name' => 'Main', 'balance' => 10_000_00]), $main->fresh(), 5_000_00, $emeka);

        $this->post('/api/v1/account/unfreeze', ['pin' => '1234'], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('selfie');
        $this->post('/api/v1/account/unfreeze', ['pin' => '9999', 'selfie' => UploadedFile::fake()->image('me.jpg')], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/v1/account/unfreeze', ['pin' => '1234', 'selfie' => UploadedFile::fake()->image('me.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->assertNull($ngozi->fresh()->frozen_at);

        // ACC-07 "Freeze my account" before signing in, with the phone checked by a code.
        $token = $this->postJson('/api/v1/auth/phone/verify', ['phone' => self::PHONE, 'code' => $this->code()])->json('data.phone_token');
        $this->postJson('/api/v1/auth/freeze', ['phone_token' => $token])->assertOk();
        $this->assertTrue($ngozi->fresh()->isFrozen());
    }

    public function test_close_account_after_before_you_go(): void
    {
        Mail::fake();
        $ngozi = User::factory()->create(['kyc_tier' => 3, 'phone' => self::PHONE]);
        [$main] = $this->wallets($ngozi, 29_320_000);
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/account/close')->assertOk()->assertJsonPath('data.ready', false)->assertJsonPath('data.items.0.value', '₦293,200');
        $this->postJson('/api/v1/account/close', ['pin' => '1234'])->assertStatus(422);
        $this->postJson('/api/v1/account/export')->assertOk()->assertJsonPath('data.sent_to', $ngozi->email);

        $main->update(['balance' => 0]);
        $this->postJson('/api/v1/account/close', ['pin' => '1234'])->assertOk();
        $this->assertSame('closed', $ngozi->fresh()->status);
        $this->postJson('/api/v1/auth/phone/verify', ['phone' => self::PHONE, 'code' => $this->code()])->assertStatus(403);
    }

    public function test_settings_profile_details_and_own_bank_accounts(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 2, 'first_name' => 'Ngozi', 'last_name' => 'Okafor']);
        KycSubmission::create(['user_id' => $ngozi->id, 'target_tier' => 1, 'type' => 'personal', 'payload' => ['bvn' => '22233344412'], 'status' => 'approved']);
        Sanctum::actingAs($ngozi);

        $this->putJson('/api/v1/settings', ['app_lock' => true, 'lock_after' => 5, 'hide_balances' => true, 'partner_offers' => false, 'appearance' => 'light'])
            ->assertOk()->assertJsonPath('data.settings.lock_after', 5)->assertJsonPath('data.settings.hide_balances', true);
        $this->putJson('/api/v1/settings', ['lock_after' => 7])->assertStatus(422);
        $this->getJson('/api/v1/profile/details')->assertOk()->assertJsonPath('data.bvn', '•••••••4412')->assertJsonPath('data.name_locked', true);
        $this->putJson('/api/v1/profile/details', ['address' => '14 Admiralty Way', 'city' => 'Lekki', 'state' => 'Lagos'])->assertOk()->assertJsonPath('data.city', 'Lekki');

        // ME-04 "You can only withdraw to accounts in your own name."
        $id = $this->postJson('/api/v1/bank-accounts', ['bank_code' => '057', 'account_number' => '0123454410'])->assertCreated()->json('data.id');
        $this->getJson('/api/v1/bank-accounts')->assertJsonPath('data.accounts.0.default', true)->assertJsonPath('data.accounts.0.masked', '•••• 4410');
        $this->bankName = ['CHIDI', 'NWOSU'];
        $this->postJson('/api/v1/bank-accounts', ['bank_code' => '058', 'account_number' => '0123452289'])->assertStatus(422);
        $this->deleteJson("/api/v1/bank-accounts/{$id}")->assertOk()->assertJsonCount(0, 'data.accounts');
    }

    public function test_support_chat_maintenance_and_the_admin_side(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 3, 'first_name' => 'Ngozi']);
        [$main] = $this->wallets($ngozi);
        $admin = User::factory()->create(['role' => 'admin', 'first_name' => 'Amaka']);

        // ME-17
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/support/chat', ['body' => 'My transfer to Greenfield School failed yesterday. Was the money returned?'])->assertCreated();
        $request = SupportRequest::first();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/support-requests/{$request->id}/messages", ['body' => 'Yes. ₦185,000 went back to School fees 2027.'])->assertCreated();
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/support/chat')->assertOk()->assertJsonPath('data.messages.1.from', 'support')->assertJsonPath('data.messages.1.name', 'Amaka');

        // SYS-02/03: maintenance pauses sending, and old apps must update.
        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/system-settings', ['maintenance' => ['on' => true, 'until' => '2:00 am'], 'min_app_version' => '1.2.0'])->assertOk();
        $this->getJson('/api/v1/app/status?version=1.1.9')->assertOk()->assertJsonPath('data.update_required', true)->assertJsonPath('data.maintenance.on', true);
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1000', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $this->withMain(User::factory()->create())->phone]])
            ->assertStatus(503)->assertJsonPath('data.code', 'maintenance');
        SystemSetting::put('maintenance', ['on' => false]);

        // Admin: a person's protections, unlock the PIN, lift holds, unfreeze.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/profile/verify-pin', ['pin' => '9999']);
        }
        $ngozi->forceFill(['pin_reset_hold_until' => now()->addDay(), 'frozen_at' => now()])->save();
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/users/{$ngozi->id}/security")->assertOk()
            ->assertJsonPath('data.limits.daily', '5000000.00')
            ->assertJsonPath('data.frozen_at', $ngozi->frozen_at->toIso8601String());
        $this->assertNotNull($this->getJson("/api/v1/admin/users/{$ngozi->id}/security")->json('data.pin_locked_until'));
        $this->postJson("/api/v1/admin/users/{$ngozi->id}/unlock-pin")->assertOk();
        $this->postJson("/api/v1/admin/users/{$ngozi->id}/lift-holds")->assertOk();
        $this->postJson("/api/v1/admin/users/{$ngozi->id}/unfreeze")->assertOk();
        $ngozi->refresh();
        $this->assertNull($ngozi->frozen_at);
        $this->assertNull($ngozi->pin_reset_hold_until);
        $this->assertNull(app(\App\Services\PinService::class)->lockedUntil($ngozi));
        $this->getJson('/api/v1/admin/system-settings')->assertOk()->assertJsonPath('data.min_app_version', '1.2.0')->assertJsonPath('data.tiers.0.daily', 5_000_000);
    }

    public function test_kyc_tiers_ask_for_what_the_prototype_shows(): void
    {
        $ngozi = User::factory()->create(['kyc_tier' => 1]);
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($ngozi);
        // Tier 2: NIN and a selfie.
        $this->post('/api/v1/kyc/submit', ['target_tier' => 2, 'nin' => '12345678830'], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('selfie');
        $id = $this->post('/api/v1/kyc/submit', ['target_tier' => 2, 'nin' => '12345678830', 'selfie' => UploadedFile::fake()->image('selfie.jpg')], ['Accept' => 'application/json'])->assertCreated()->json('data.submission.id');
        Sanctum::actingAs($admin);
        $this->getJson("/api/v1/admin/kyc/{$id}")->assertOk()->assertJsonPath('data.submission.files.0', 'selfie');
        $this->get("/api/v1/admin/kyc/{$id}/files/selfie")->assertOk();
        $this->postJson("/api/v1/admin/kyc/{$id}/approve")->assertOk();

        // Tier 3: an ID document and proof of address; the address becomes the profile's.
        Sanctum::actingAs($ngozi->fresh());
        $id = $this->post('/api/v1/kyc/submit', [
            'target_tier' => 3, 'id_type' => 'passport', 'id_photo' => UploadedFile::fake()->image('passport.jpg'),
            'address' => '14 Admiralty Way', 'city' => 'Lekki', 'state' => 'Lagos', 'proof' => UploadedFile::fake()->create('bill.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.submission.id');
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/kyc/{$id}/approve")->assertOk();
        $this->assertSame('Lekki', $ngozi->fresh()->city);
        $this->assertSame(3, $ngozi->fresh()->kyc_tier);
    }

    public function test_phone_length_tier_0_wording_pending_bvn_and_the_two_step_cap(): void
    {
        // A number one digit short would send the code to someone else.
        $this->postJson('/api/v1/auth/phone/check', ['phone' => '+234803412779'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->postJson('/api/v1/auth/phone/start', ['phone' => '+234803412779', 'channel' => 'sms'])->assertStatus(422);
        $this->postJson('/api/v1/auth/phone/check', ['phone' => '+447700900123'])->assertOk();

        // Tier 0 has Tier 1's limits but is called Tier 0.
        $kemi = User::factory()->create(['kyc_tier' => 0]);
        [$main] = $this->wallets($kemi, 10_000_000);
        $ngozi = $this->withMain(User::factory()->create(['kyc_tier' => 3]));
        Sanctum::actingAs($kemi);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '60000', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $ngozi->phone]])
            ->assertStatus(422)->assertJsonPath('data.code', 'single_limit')->assertJsonPath('message', 'On Tier 0 one payment can be up to ₦50,000. Verify to the next tier to send more.');

        // ME-03: a BVN waiting for review says so.
        KycSubmission::create(['user_id' => $kemi->id, 'target_tier' => 1, 'type' => 'personal', 'status' => 'pending', 'payload' => ['bvn' => '22345678901']]);
        $this->getJson('/api/v1/profile/details')->assertOk()->assertJsonPath('data.bvn', null)->assertJsonPath('data.bvn_pending', true)->assertJsonPath('data.nin_pending', false);
        // ME-08: like the PIN, 5 wrong two-step codes stop two-step checks for 30 minutes — even the right code.
        $secret = SecurityService::base32Encode(random_bytes(20));
        $kemi->forceFill(['two_factor_method' => 'authenticator', 'two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();
        $security = SecurityService::make();
        $right = SecurityService::totp($secret, intdiv(time(), 30));
        $wrong = str_pad((string) (((int) $right + 1) % 1_000_000), 6, '0', STR_PAD_LEFT);
        $security->verifyTwoFactorCode($kemi, $right);
        foreach (range(1, SecurityService::TWO_FACTOR_TRIES) as $_) {
            try {
                $security->verifyTwoFactorCode($kemi, $wrong);
                $this->fail('A wrong code passed.');
            } catch (\Illuminate\Validation\ValidationException $e) {
                $this->assertStringContainsString('wrong', $e->errors()['two_factor_code'][0]);
            }
        }
        try {
            $security->verifyTwoFactorCode($kemi, $right);
            $this->fail('Two-step was not paused.');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertStringContainsString('Too many wrong codes', $e->errors()['two_factor_code'][0]);
        }
    }

    public function test_link_pages_hand_over_to_the_app(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'referral_code' => 'NGOZI500']);

        // SYS-08: the referral link that the app shares now opens a page, not a 404.
        $this->get('/r/ngozi500')->assertOk()
            ->assertSee('Ngozi invited you to Patriai')
            ->assertSee('patriai://ref/NGOZI500', false)
            ->assertSee('intent://ref/NGOZI500#Intent;scheme=patriai;package=com.patriai.app;end', false);
        $this->get('/r/UNKNOWN1')->assertOk()->assertSee('You were invited to Patriai');
        $this->get('/i')->assertOk()->assertSee('patriai://invite', false);
        // A request page names no one and shows no amount.
        $this->get('/a/42')->assertOk()->assertSee('patriai://request/42', false)->assertSee('Someone needs your yes')->assertDontSee($ngozi->last_name);
        $this->get('/a/abc')->assertNotFound();
        $this->get('/r/<x>')->assertNotFound();
    }
}
