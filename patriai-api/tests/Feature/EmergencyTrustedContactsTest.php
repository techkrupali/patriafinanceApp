<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\EmergencyTrustedContact;
use App\Models\EmergencyUnlockRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Emergency wallet prototype, the rest of it: trusted contacts with an SMS link
 * (no app), paying the hospital directly, release rules nobody changes alone,
 * and keyholders invited by phone — next to the client's dual approval, custom
 * PIN, death unlock and ordered beneficiaries.
 */
class EmergencyTrustedContactsTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, sms: string}> */
    private array $sms = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['services.termii.api_key' => 'test-key', 'app.url' => 'https://api.patriai.test']);
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/api/sms/send')) {
                $this->sms[] = ['to' => $request->data()['to'], 'sms' => $request->data()['sms']];

                return Http::response(['message_id' => 'x'], 200);
            }

            return Http::response(['status' => true, 'data' => []], 200);
        });
    }

    private function person(string $first, int $mainKobo = 0, ?string $phone = null): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', ...($phone ? ['phone' => $phone] : [])]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    /** Ngozi's fund: Ada keyholder (2 of 2 is the dual approval), Dr Chika a trusted contact. */
    private function fund(array $rules = [], array $members = []): array
    {
        $ngozi = $this->person('Ngozi', 50_000_000, '+2348034127790');
        $ada = $this->person('Ada');
        Sanctum::actingAs($ngozi);
        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'emergency',
            'name' => 'Health fund',
            'source_wallet_id' => $ngozi->mainWallet()->id,
            'initial_deposit' => '300000',
            'members' => $members,
            'emergency' => array_merge([
                'purpose' => 'medical',
                'keyholders' => [$ada->id],
                'required_keyholders' => 2,
                'fast_release_limit' => '150000',
                'pay_directly' => true,
                'trusted_contacts' => [['name' => 'Dr Chika Nwosu', 'phone' => '08031112214', 'relation' => 'Family doctor']],
                'trusted_can_request' => true,
                'trusted_can_upload' => true,
                'trusted_can_see_balance' => false,
                'unlock_on_document' => true,
                'manual_unlock' => true,
                'unlock_reason' => 'Hospital bills',
                'emergency_pin' => '4321',
            ], $rules),
        ])->assertCreated();

        return [Wallet::find($res->json('data.wallet.id')), $ngozi, $ada];
    }

    private function linkToken(): string
    {
        $sms = collect($this->sms)->firstWhere('to', '2348031112214');
        $this->assertNotNull($sms, 'The trusted contact got no SMS');
        $this->assertStringContainsString('https://api.patriai.test/e/', $sms['sms']);
        preg_match('#/e/(\w+)#', $sms['sms'], $m);

        return $m[1];
    }

    public function test_a_trusted_contact_asks_for_a_release_from_their_sms_link(): void
    {
        [$wallet, $ngozi, $ada] = $this->fund();
        $token = $this->linkToken();
        $this->assertNotNull(EmergencyTrustedContact::sole()->link_sent_at);

        // No app: the link opens a page. The balance stays hidden — the owner said so.
        $this->get("/e/{$token}")->assertOk()->assertSee('Health fund')->assertSee('Dr Chika Nwosu')->assertDontSee('₦3,000.00');

        $this->post("/e/{$token}", ['note' => 'Papa admitted at Mercy Hospital'])->assertRedirect("/e/{$token}");
        $request = EmergencyUnlockRequest::where('method', 'dual_approval')->sole();
        $this->assertNull($request->requested_by);
        $this->assertSame([], $request->approvals);
        $this->assertSame(2, $request->required_approvals);
        $this->assertSame(1, AppNotification::where('user_id', $ada->id)->where('type', 'emergency_unlock_requested')->count());

        // Proof can follow; a second request can't.
        $this->post("/e/{$token}", ['note' => 'again'])->assertSessionHasErrors();
        $this->post("/e/{$token}", ['proof' => UploadedFile::fake()->image('bill.jpg')])->assertSessionHasNoErrors();
        $this->assertSame('proof', $request->refresh()->document_type);

        // Keyholders still decide.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/emergency-requests/{$request->id}/approve")->assertOk()
            ->assertJsonPath('message', 'Your yes is counted')
            ->assertJsonPath('data.emergency.locked', true);
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/emergency-requests/{$request->id}/approve")->assertOk()->assertJsonPath('data.emergency.locked', false);

        // A wrong link is nothing.
        $this->get('/e/not-a-real-token')->assertNotFound();
    }

    public function test_the_fund_pays_the_hospital_directly(): void
    {
        [$wallet, $ngozi, $ada] = $this->fund();
        Sanctum::actingAs($ada);
        $proof = UploadedFile::fake()->image('bill.jpg');

        // Fast release goes to the bill's bank account, not Ada's Main.
        $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", ['amount' => '100000', 'pin' => '1234', 'proof' => $proof], ['Accept' => 'application/json'])
            ->assertStatus(422);
        $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", [
            'amount' => '100000', 'pin' => '1234', 'proof' => UploadedFile::fake()->image('bill.jpg'),
            'payee' => ['bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'MERCY HOSPITAL ENUGU', 'bank_name' => 'GTBank'],
        ], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('message', 'Money sent to MERCY HOSPITAL ENUGU');
        $this->assertSame(0, $ada->mainWallet()->refresh()->balance);
        $this->assertSame('successful', Transaction::where('wallet_id', $wallet->id)->where('type', 'withdrawal')->sole()->status);
        $this->assertSame('MERCY HOSPITAL ENUGU', EmergencyUnlockRequest::where('method', 'fast_release')->sole()->payee['account_name']);

        // Released by both keyholders: still only to a bank account.
        $id = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval'])->json('data.request.id');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/emergency-requests/{$id}/approve")->assertOk();
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $wallet->id, 'amount' => '1000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $ngozi->mainWallet()->id]])
            ->assertStatus(422);
    }

    public function test_nobody_changes_the_release_rules_alone(): void
    {
        [$wallet, $ngozi, $ada] = $this->fund();
        Sanctum::actingAs($ngozi);

        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", [
            'pin' => '1234',
            'keyholders' => [$ada->id],
            'required_keyholders' => 1,
            'fast_release_limit' => null,
            'manual_unlock' => true,
            'unlock_reason' => 'Hospital bills',
            'emergency_pin' => '9876',
            'unlock_on_document' => true,
            'trusted_contacts' => [],
            'beneficiaries' => [],
        ])->assertOk()
            ->assertJsonPath('message', 'Sent to the keyholders to approve')
            ->assertJsonPath('data.emergency.rules.required_keyholders', 2)
            ->assertJsonPath('data.emergency.me.pending_rule_change', true);

        // The new custom PIN never waits in the clear.
        $change = EmergencyUnlockRequest::where('method', 'rule_change')->sole();
        $this->assertArrayNotHasKey('emergency_pin', $change->payload);
        $this->assertSame(1, AppNotification::where('user_id', $ada->id)->where('type', 'emergency_rules_change_requested')->count());

        // Ada agrees: the rules change — the trusted contact's link stops working.
        $token = $this->linkToken();
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/emergency-requests/{$change->id}/approve")->assertOk()
            ->assertJsonPath('message', 'New rules applied')
            ->assertJsonPath('data.emergency.rules.required_keyholders', 1)
            ->assertJsonPath('data.emergency.rules.fast_release', null);
        $this->get("/e/{$token}")->assertNotFound();

        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '9876'])->assertOk()->assertJsonPath('data.emergency.locked', false);
    }

    public function test_someone_invited_by_phone_becomes_a_keyholder_when_they_join(): void
    {
        [$wallet] = $this->fund([], [['identifier' => '08030000999', 'role' => 'contributor', 'pledge' => '30000', 'keyholder' => true]]);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->sole();
        $this->assertTrue($invite->keyholder);

        $obi = $this->person('Obi', 0, '+2348030000999');
        $invite->update(['invitee_user_id' => $obi->id]);
        Sanctum::actingAs($obi);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertOk();

        $setting = $wallet->refresh()->emergencySetting;
        $this->assertContains($obi->id, $setting->keyholder_ids);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertJsonPath('data.emergency.me.is_keyholder', true);
    }
}
