<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\EmergencyUnlockRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Emergency fund from the client prototype (EMG-01…05): what it's for,
 * contributors with their own monthly amount, keyholders who release it ("2 of
 * 3"), requests that expire, and fast release with proof. The client's own
 * rules stay: dual approval, manual unlock with a custom PIN, death emergency
 * unlock and up to three ordered beneficiaries.
 */
class EmergencyKeyholdersTest extends TestCase
{
    use RefreshDatabase;

    private function person(string $first, int $mainKobo = 0): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor']);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    /** Ngozi's fund: Ada and Obi hold keys with her, 2 of 3 release; Emeka puts money in. */
    private function fund(array $rules = []): array
    {
        $ngozi = $this->person('Ngozi', 50_000_000);
        $ada = $this->person('Ada');
        $obi = $this->person('Obi');
        $emeka = $this->person('Emeka');
        $chika = $this->person('Chika');
        Sanctum::actingAs($ngozi);

        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'emergency',
            'name' => "Mama and Papa's health fund",
            'target_amount' => '1200000',
            'source_wallet_id' => $ngozi->mainWallet()->id,
            'initial_deposit' => '200000',
            'monthly_amount' => '30000',
            'monthly_day' => 25,
            'members' => [
                ['user_id' => $emeka->id, 'role' => 'contributor', 'pledge' => '20000'],
                ['user_id' => $ada->id, 'role' => 'contributor', 'pledge' => '40000'],
                ['identifier' => '08011112222', 'role' => 'contributor', 'pledge' => '30000'],
            ],
            'emergency' => array_merge([
                'purpose' => 'medical',
                'purposes' => ['medical', 'funeral'],
                'keyholders' => [$ada->id, $obi->id],
                'required_keyholders' => 2,
                'request_expiry_hours' => 6,
                'fast_release_limit' => '150000',
                'fast_release_every_days' => 30,
                'manual_unlock' => true,
                'unlock_reason' => 'Hospital bills',
                'emergency_pin' => '4321',
                'unlock_on_document' => true,
                'beneficiaries' => [['user_id' => $chika->id, 'relationship' => 'Cousin']],
            ], $rules),
        ])->assertCreated();

        return [Wallet::find($res->json('data.wallet.id')), $ngozi, $ada, $obi, $emeka, $chika];
    }

    public function test_setup_saves_keyholders_contributors_pledges_and_the_clients_rules(): void
    {
        [$wallet, $ngozi, $ada, $obi, $emeka] = $this->fund();

        $this->assertSame(20_000_000, $wallet->balance);
        $this->assertSame(25, AutomationRule::where('to_wallet_id', $wallet->id)->sole()->day_of_month);

        // Keyholders see the fund straight away; contributors are invited with their amount.
        $this->assertSame('emergency_approver', WalletMember::where('wallet_id', $wallet->id)->where('user_id', $obi->id)->value('role'));
        $pledges = WalletInvitation::where('wallet_id', $wallet->id)->pluck('pledge_amount', 'invitee_identifier');
        $this->assertSame([2_000_000, 4_000_000, 3_000_000], array_values($pledges->all()));
        $this->assertSame(1, AppNotification::where('user_id', $obi->id)->where('type', 'emergency_approver_added')->count());

        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")
            ->assertOk()
            ->assertJsonPath('data.emergency.purposes', ['medical', 'funeral'])
            ->assertJsonPath('data.emergency.rules.required_keyholders', 2)
            ->assertJsonPath('data.emergency.rules.keyholders.1.name', 'Obi Okafor')
            ->assertJsonPath('data.emergency.rules.request_expiry_hours', 6)
            ->assertJsonPath('data.emergency.rules.fast_release.limit', '150000.00')
            ->assertJsonPath('data.emergency.rules.manual_unlock', true)
            ->assertJsonPath('data.emergency.rules.unlock_on_document', true)
            ->assertJsonPath('data.emergency.beneficiaries.0.position', 1);
        $this->getJson("/api/v1/wallets/{$wallet->id}")
            ->assertJsonPath('data.emergency.required', 2)
            ->assertJsonPath('data.emergency.keyholders', 3);

        // Ada accepts and saves her ₦40,000 on the 25th from her Main.
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->where('invitee_user_id', $ada->id)->sole();
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $ada->mainWallet()->id])->assertOk();
        $rule = AutomationRule::where('user_id', $ada->id)->where('to_wallet_id', $wallet->id)->sole();
        $this->assertSame(4_000_000, $rule->amount);
        $this->assertSame(25, $rule->day_of_month);
    }

    public function test_two_of_three_keyholders_release_the_fund(): void
    {
        [$wallet, $ngozi, $ada, $obi, , $chika] = $this->fund();

        // Chika (a beneficiary) can ask, but only keyholders' yeses count.
        Sanctum::actingAs($chika);
        $id = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval', 'note' => 'Papa is in hospital'])
            ->assertCreated()
            ->assertJsonPath('data.request.approvals', 0)
            ->assertJsonPath('data.request.required_approvals', 2)
            ->json('data.request.id');

        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/emergency-requests/{$id}/approve")->assertOk()->assertJsonPath('data.emergency.locked', true);
        $this->postJson("/api/v1/emergency-requests/{$id}/approve")->assertStatus(422);
        Sanctum::actingAs($obi);
        $this->postJson("/api/v1/emergency-requests/{$id}/approve")->assertOk()->assertJsonPath('data.emergency.locked', false);

        // Released: Obi, a keyholder, can pay from it.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $wallet->id, 'amount' => '1000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $obi->mainWallet()->id]])->assertOk();
    }

    public function test_a_keyholders_request_counts_as_their_yes_and_requests_expire(): void
    {
        [$wallet, $ngozi, $ada, $obi] = $this->fund(['required_keyholders' => 1]);

        // "1 of 3": a keyholder's own request releases it.
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval'])->assertCreated();
        $this->assertFalse($wallet->refresh()->isEmergencyLocked());

        [$wallet2, , $ada2, $obi2] = $this->fund();
        Sanctum::actingAs($ada2);
        $id = $this->postJson("/api/v1/wallets/{$wallet2->id}/emergency/requests", ['method' => 'dual_approval'])
            ->assertJsonPath('data.request.approvals', 1)
            ->json('data.request.id');
        Carbon::setTestNow(now()->addHours(7));
        Sanctum::actingAs($obi2);
        $this->postJson("/api/v1/emergency-requests/{$id}/approve")->assertStatus(422);
        $this->assertSame('expired', EmergencyUnlockRequest::find($id)->status);
        Carbon::setTestNow();
    }

    public function test_fast_release_with_proof_once_every_30_days_and_flagging(): void
    {
        Storage::fake('local');
        [$wallet, $ngozi, $ada, $obi] = $this->fund();
        $proof = fn () => UploadedFile::fake()->image('hospital-bill.jpg');

        Sanctum::actingAs($ada);
        $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", ['amount' => '200000', 'pin' => '1234', 'proof' => $proof()], ['Accept' => 'application/json'])->assertStatus(422);
        $res = $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", ['amount' => '150000', 'pin' => '1234', 'proof' => $proof(), 'note' => 'Admission deposit'], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.emergency.me.can_fast_release', false);
        $this->assertSame(15_000_000, $ada->mainWallet()->balance);
        $this->assertTrue($wallet->refresh()->isEmergencyLocked());
        $this->assertSame(1, AppNotification::where('user_id', $obi->id)->where('type', 'emergency_fast_release')->count());

        // Once every 30 days.
        $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", ['amount' => '1000', 'pin' => '1234', 'proof' => $proof()], ['Accept' => 'application/json'])->assertStatus(422);

        // Obi checks it and flags it; Ngozi hears.
        $release = EmergencyUnlockRequest::where('method', 'fast_release')->sole();
        Sanctum::actingAs($obi);
        $this->postJson("/api/v1/emergency-requests/{$release->id}/reject", ['note' => 'This bill looks old'])->assertOk();
        $this->assertSame('flagged', $release->refresh()->status);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'emergency_fast_release_flagged')->count());

        // Contributors aren't keyholders.
        $emeka = User::where('first_name', 'Emeka')->first();
        Sanctum::actingAs($emeka);
        Carbon::setTestNow(now()->addDays(31));
        $this->post("/api/v1/wallets/{$wallet->id}/emergency/fast-release", ['amount' => '1000', 'pin' => '1234', 'proof' => $proof()], ['Accept' => 'application/json'])->assertStatus(404);
        Carbon::setTestNow();
    }

    public function test_changing_rules_needs_the_keyholders_and_tells_them(): void
    {
        [$wallet, $ngozi, $ada, $obi] = $this->fund();
        Sanctum::actingAs($ngozi);

        // "Nobody can change the release rules alone. Changes need 2 of 3 keyholders too."
        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", [
            'pin' => '1234',
            'keyholders' => [$ada->id, $obi->id],
            'required_keyholders' => 3,
            'manual_unlock' => true,
            'unlock_reason' => 'Hospital bills',
            'unlock_on_document' => true,
            'beneficiaries' => [],
        ])->assertOk()
            ->assertJsonPath('message', 'Sent to the keyholders to approve')
            ->assertJsonPath('data.emergency.rules.required_keyholders', 2);
        $this->assertSame(1, AppNotification::where('user_id', $obi->id)->where('type', 'emergency_rules_change_requested')->count());

        $change = EmergencyUnlockRequest::where('method', 'rule_change')->sole();
        Sanctum::actingAs($obi);
        $this->postJson("/api/v1/emergency-requests/{$change->id}/approve")->assertOk()->assertJsonPath('data.emergency.rules.required_keyholders', 3);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'emergency_rules_changed')->count());
    }
}
