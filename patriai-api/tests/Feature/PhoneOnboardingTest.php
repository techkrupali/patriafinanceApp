<?php

namespace Tests\Feature;

use App\Models\OtpCode;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Phone-first onboarding and log-in from the client prototype: phone → code
 * (SMS or WhatsApp) → details → 6-digit PIN → "what brings you" → main wallet
 * ready; and phone → code → PIN for an existing account, plus Forgot PIN.
 */
class PhoneOnboardingTest extends TestCase
{
    use RefreshDatabase;

    private const PHONE = '+2348034127790';

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.debug' => true]); // codes come back as debug_otp outside production
        Http::fake([
            '*/virtual-account/create' => Http::response(['status' => true]),
            '*/api/sms/send' => Http::response(['message_id' => 'x', 'message' => 'Successfully Sent']),
        ]);
    }

    /** Runs start + verify and returns the verify payload. */
    private function verifyPhone(string $phone = self::PHONE, string $channel = 'sms'): array
    {
        $code = $this->postJson('/api/v1/auth/phone/start', ['phone' => $phone, 'channel' => $channel])
            ->assertOk()
            ->json('data.debug_otp');

        return $this->postJson('/api/v1/auth/phone/verify', ['phone' => $phone, 'code' => $code])
            ->assertOk()
            ->json('data');
    }

    private function details(array $extra = []): array
    {
        return array_merge([
            'first_name' => 'Ngozi',
            'last_name' => 'Okafor',
            'email' => 'ngozi@example.com',
            'date_of_birth' => '1988-03-14',
            'pin' => '482915',
            'language' => 'pcm',
        ], $extra);
    }

    public function test_new_number_signs_up_with_a_pin_and_gets_a_main_wallet(): void
    {
        $verified = $this->verifyPhone();
        $this->assertNull($verified['account']);

        $res = $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $verified['phone_token'], ...$this->details()])
            ->assertCreated()
            ->assertJsonPath('data.user.phone', self::PHONE)
            ->assertJsonPath('data.user.phone_verified', true)
            ->assertJsonPath('data.user.pin_length', 6)
            ->assertJsonPath('data.user.has_password', false)
            ->assertJsonPath('data.user.language', 'pcm')
            ->assertJsonPath('data.user.date_of_birth', '1988-03-14');

        $user = User::where('phone', self::PHONE)->firstOrFail();
        $this->assertNull($user->password);
        $main = Wallet::where('user_id', $user->id)->where('type', 'main')->firstOrFail();
        $this->assertNotNull($main->virtual_account);

        // The session works straight away, and the ONB-12 data is there.
        $token = $res->json('data.token');
        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/v1/wallets')
            ->assertOk()
            ->assertJsonPath('data.wallets.0.virtual_account', $main->virtual_account);

        // ONB-09 answers are saved on the account.
        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/profile/onboarding', ['purposes' => ['household', 'school_goals']])
            ->assertOk()
            ->assertJsonPath('data.user.onboarding_purposes', ['household', 'school_goals']);
        $this->withHeader('Authorization', "Bearer {$token}")
            ->putJson('/api/v1/profile/onboarding', ['purposes' => ['lottery']])
            ->assertStatus(422);
    }

    public function test_phone_token_is_single_use_and_details_are_checked(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        $token = $this->verifyPhone()['phone_token'];

        // Under 18, a used email, or a 4-digit PIN are all refused without spending the token.
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details(['date_of_birth' => now()->subYears(17)->toDateString()])])
            ->assertStatus(422)->assertJsonValidationErrors('date_of_birth');
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details(['email' => 'taken@example.com'])])
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details(['pin' => '4829'])])
            ->assertStatus(422)->assertJsonValidationErrors('pin');

        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details()])->assertCreated();

        // The same proof can't open a second account or a session.
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details(['email' => 'other@example.com'])])
            ->assertStatus(422)->assertJsonValidationErrors('phone_token');
        $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $token, 'pin' => '482915'])
            ->assertStatus(422)->assertJsonValidationErrors('phone_token');
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => 'made-up', ...$this->details(['email' => 'new@example.com'])])
            ->assertStatus(422)->assertJsonValidationErrors('phone_token');
    }

    public function test_existing_number_logs_in_with_its_pin_and_wrong_pins_lock(): void
    {
        $user = User::factory()->create(['phone' => self::PHONE, 'first_name' => 'Ngozi', 'last_name' => 'Okafor']);

        // Starting looks the same for known and unknown numbers.
        $this->postJson('/api/v1/auth/phone/start', ['phone' => self::PHONE, 'channel' => 'sms'])
            ->assertOk()
            ->assertJsonMissingPath('data.account');
        OtpCode::query()->delete(); // clear the resend cooldown for the helper below

        $verified = $this->verifyPhone();
        $this->assertSame(['first_name' => 'Ngozi', 'initials' => 'NO', 'avatar_url' => null, 'pin_length' => 4, 'new_device' => false, 'two_factor' => null], $verified['account']);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '9999'])
                ->assertStatus(422)->assertJsonValidationErrors('pin');
        }
        // ACC-07: the fifth miss locks it for 30 minutes and says until when.
        $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '9999'])
            ->assertStatus(423)->assertJsonPath('data.code', 'locked');
        // Locked now, even with the right PIN (factory PIN is 1234).
        $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '1234'])
            ->assertStatus(423);

        $this->travel(31)->minutes();
        OtpCode::query()->delete();
        $verified = $this->verifyPhone();
        $res = $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $verified['phone_token'], 'pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('data.user.id', $user->id);
        $this->assertNotEmpty($res->json('data.token'));
        $this->assertNotEmpty($res->json('data.device_secret'));
        $this->assertNotNull($user->refresh()->phone_verified_at);
        // ME-10: the misses and the block are in the login history.
        $this->assertSame(['failed', 'failed', 'failed', 'failed', 'failed', 'blocked', 'ok'], $user->loginEvents()->orderBy('id')->pluck('status')->all());
    }

    public function test_suspended_number_is_refused_after_the_code(): void
    {
        $user = User::factory()->create(['phone' => self::PHONE]);
        $user->forceFill(['status' => 'suspended'])->save();

        $code = $this->postJson('/api/v1/auth/phone/start', ['phone' => self::PHONE, 'channel' => 'sms'])->json('data.debug_otp');
        $this->postJson('/api/v1/auth/phone/verify', ['phone' => self::PHONE, 'code' => $code])->assertStatus(403);
    }

    public function test_codes_go_by_sms_or_whatsapp_with_a_resend_cooldown(): void
    {
        config(['services.termii.api_key' => 'test-key']);

        $this->postJson('/api/v1/auth/phone/start', ['phone' => '08034127790', 'channel' => 'sms'])
            ->assertOk()
            ->assertJsonPath('data.channel', 'sms')
            ->assertJsonPath('data.resend_in', 60)
            ->assertJsonPath('data.sent_to', '+234 ••• ••• 7790');

        // Asking again on the same channel too soon is refused…
        $this->postJson('/api/v1/auth/phone/start', ['phone' => self::PHONE, 'channel' => 'sms'])
            ->assertStatus(422)->assertJsonValidationErrors('phone');
        // …but "Send by WhatsApp instead" works, and only that code is valid now.
        $code = $this->postJson('/api/v1/auth/phone/start', ['phone' => self::PHONE, 'channel' => 'whatsapp'])
            ->assertOk()
            ->json('data.debug_otp');

        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/api/sms/send')
            && $req['to'] === '2348034127790' && $req['channel'] === 'dnd' && str_contains($req['sms'], 'Patriai code'));
        Http::assertSent(fn ($req) => str_ends_with($req->url(), '/api/sms/send')
            && $req['channel'] === 'whatsapp' && str_contains($req['sms'], $code));

        $this->postJson('/api/v1/auth/phone/verify', ['phone' => self::PHONE, 'code' => $code])->assertOk();

        $this->travel(61)->seconds();
        $this->postJson('/api/v1/auth/phone/start', ['phone' => self::PHONE, 'channel' => 'sms'])->assertOk();
    }

    public function test_forgot_pin_needs_a_code_and_a_selfie_and_holds_big_payments(): void
    {
        Mail::fake();
        $user = User::factory()->create(['phone' => self::PHONE, 'email' => 'ngozi@example.com']);
        $old = $user->createToken('old-phone')->plainTextToken;
        $device = ['device_id' => 'ngozi-phone', 'device_name' => 'iPhone', 'platform' => 'ios'];

        // ACC-04: no BVN checked yet, so the second check is a code to the email on file.
        $token = $this->verifyPhone()['phone_token'];
        $res = $this->postJson('/api/v1/auth/pin/forgot', ['phone_token' => $token])
            ->assertOk()
            ->assertJsonPath('data.needs', 'email')
            ->assertJsonPath('data.sent_to', 'ng***@example.com');
        $emailCode = $res->json('data.debug_otp');
        $selfie = \Illuminate\Http\UploadedFile::fake()->image('selfie.jpg');

        $this->post('/api/v1/auth/pin/reset', ['phone_token' => $token, 'code' => $emailCode, 'pin' => '482915'] + $device, ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('selfie');
        $this->post('/api/v1/auth/pin/reset', ['phone_token' => $token, 'code' => '000000', 'pin' => '482915', 'selfie' => $selfie] + $device, ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('code');
        // ACC-05 "Not your birthday or 123456".
        $this->post('/api/v1/auth/pin/reset', ['phone_token' => $token, 'code' => $emailCode, 'pin' => '123456', 'selfie' => $selfie] + $device, ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->post('/api/v1/auth/pin/reset', ['phone_token' => $token, 'code' => $emailCode, 'pin' => '482915', 'selfie' => $selfie] + $device, ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.user.pin_length', 6);
        // "For your safety, payments over ₦50,000 wait 24 hours."
        $this->assertTrue($user->refresh()->pin_reset_hold_until->isFuture());

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$old}")->getJson('/api/v1/auth/me')->assertUnauthorized();

        // The new PIN logs in next time, on the same phone.
        OtpCode::query()->delete();
        $next = $this->verifyPhone()['phone_token'];
        $this->postJson('/api/v1/auth/phone/login', ['phone_token' => $next, 'pin' => '482915'] + $device)->assertOk();
    }

    public function test_six_digit_pin_authorises_payments_and_changes_without_a_password(): void
    {
        $token = $this->verifyPhone()['phone_token'];
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details()])->assertCreated();
        $user = User::where('phone', self::PHONE)->firstOrFail();
        $main = Wallet::where('user_id', $user->id)->where('type', 'main')->firstOrFail();
        $main->update(['balance' => 100_000]);
        $savings = Wallet::create(['user_id' => $user->id, 'type' => 'savings', 'name' => 'Rent', 'balance' => 0]);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $main->id,
            'amount' => '100',
            'pin' => '482915',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $savings->id],
        ])->assertOk();
        $this->assertSame(10_000, $savings->refresh()->balance);

        // No password on the account, so the current PIN is the check.
        $this->postJson('/api/v1/profile/change-pin', ['current_pin' => '111111', 'new_pin' => '736291'])
            ->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->postJson('/api/v1/profile/change-pin', ['current_pin' => '482915', 'new_pin' => '736291'])
            ->assertOk()
            ->assertJsonPath('data.user.pin_length', 6);
        $this->postJson('/api/v1/profile/verify-pin', ['pin' => '736291'])->assertOk();
    }

    public function test_older_accounts_keep_password_login_and_their_four_digit_pin(): void
    {
        $user = User::factory()->create(['password' => 'password123']);

        $this->postJson('/api/v1/auth/login', ['identifier' => $user->email, 'password' => 'password123'])
            ->assertOk()
            ->assertJsonPath('data.user.pin_length', 4)
            ->assertJsonPath('data.user.has_password', true);

        Sanctum::actingAs($user);
        // Moving to a 6-digit PIN still asks for the password on these accounts.
        $this->postJson('/api/v1/profile/change-pin', ['current_pin' => '1234', 'new_pin' => '736291'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/v1/profile/change-pin', ['current_pin' => '1234', 'new_pin' => '736291', 'password' => 'password123'])
            ->assertOk()
            ->assertJsonPath('data.user.pin_length', 6);
    }

    public function test_invites_sent_to_the_number_before_sign_up_are_waiting(): void
    {
        $inviter = User::factory()->create();
        $wallet = Wallet::create(['user_id' => $inviter->id, 'type' => 'savings', 'name' => 'School fees 2027', 'balance' => 0]);
        $invite = WalletInvitation::create([
            'wallet_id' => $wallet->id,
            'inviter_id' => $inviter->id,
            'invitee_identifier' => self::PHONE,
            'role' => 'contributor',
            'status' => 'pending',
            'token' => 'invite-token',
            'expires_at' => now()->addDays(7),
        ]);

        $token = $this->verifyPhone()['phone_token'];
        $this->postJson('/api/v1/auth/phone/register', ['phone_token' => $token, ...$this->details()])->assertCreated();

        $this->assertSame(User::where('phone', self::PHONE)->value('id'), $invite->refresh()->invitee_user_id);
    }
}
