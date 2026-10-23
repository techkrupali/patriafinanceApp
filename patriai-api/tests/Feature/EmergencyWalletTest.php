<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\EmergencyBeneficiary;
use App\Models\EmergencySetting;
use App\Models\EmergencyUnlockRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Guided wallet creation + Emergency Wallet access rules (client video
 * "Emergency Wallet instructions", 2026-10-17): setup, the lock, every unlock
 * path, recipient payouts and the admin review. Kobo in the DB, naira over the wire.
 */
class EmergencyWalletTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(); // the banking rails are never contacted
    }

    private function makeWallet(User $user, string $type, int $balanceKobo): Wallet
    {
        $wallet = Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => ucfirst($type) . ' Wallet',
            'balance' => $balanceKobo,
        ]);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $wallet;
    }

    private function emergencyPayload(Wallet $source, array $rules = [], array $extra = []): array
    {
        return array_merge([
            'type' => 'emergency',
            'name' => 'Family Medical Fund',
            'purpose' => 'medical',
            'initial_deposit' => '200',
            'source_wallet_id' => $source->id,
            'emergency' => array_merge([
                'purpose' => 'medical',
                'manual_unlock' => true,
                'unlock_reason' => 'Medical emergency',
                'emergency_pin' => '4321',
            ], $rules),
        ], $extra);
    }

    /** Owner + main wallet + an emergency wallet created through the API. */
    private function createEmergency(array $rules = [], int $mainKobo = 100_000): array
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', $mainKobo);
        Sanctum::actingAs($owner);

        $res = $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, $rules));
        $res->assertCreated();

        return [$owner, $main, Wallet::findOrFail($res->json('data.wallet.id'))];
    }

    // ---------------------------------------------------------------- creation

    public function test_guided_setup_moves_initial_deposit_and_creates_monthly_rule(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 100_000); // ₦1,000
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'giving',
            'name' => 'Church Giving',
            'purpose' => 'tithe',
            'initial_deposit' => '250',
            'source_wallet_id' => $main->id,
            'monthly_amount' => '100',
            'monthly_day' => 5,
        ]);

        $res->assertCreated()->assertJsonPath('data.wallet.purpose', 'tithe');
        $wallet = Wallet::findOrFail($res->json('data.wallet.id'));
        $this->assertSame(25_000, $wallet->balance);
        $this->assertSame(75_000, $main->refresh()->balance);

        $rule = AutomationRule::where('to_wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame($main->id, $rule->from_wallet_id);
        $this->assertSame(10_000, $rule->amount);
        $this->assertSame('monthly', $rule->frequency);
        $this->assertSame(5, $rule->day_of_month);
    }

    public function test_failed_initial_deposit_leaves_nothing_behind(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 5_000); // ₦50
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, [], ['initial_deposit' => '200']))
            ->assertStatus(422);

        $this->assertSame(0, Wallet::where('type', 'emergency')->count());
        $this->assertSame(0, EmergencySetting::count());
        $this->assertSame(5_000, $main->refresh()->balance);
    }

    public function test_emergency_setup_stores_rules_recipients_and_starts_locked(): void
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', 100_000);
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        Sanctum::actingAs($owner);

        $res = $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, [
            'dual_approval' => true,
            'approver_user_id' => $wife->id,
            'unlock_on_document' => true,
            'override_high_balance' => true,
            'beneficiary_note' => 'Use this for the children first.',
            'beneficiaries' => [
                ['user_id' => $wife->id, 'relationship' => 'Wife', 'role' => 'beneficiary', 'withdrawal_limit' => '500000', 'access_type' => 'immediate'],
                ['user_id' => $brother->id, 'relationship' => 'Brother', 'role' => 'fallback', 'withdrawal_limit' => '100000', 'access_type' => 'delay_7d'],
            ],
        ]));

        $res->assertCreated()
            ->assertJsonPath('data.wallet.emergency_locked', true)
            ->assertJsonPath('data.wallet.purpose', 'medical');

        $wallet = Wallet::findOrFail($res->json('data.wallet.id'));
        $this->assertSame(20_000, $wallet->balance);

        $setting = $wallet->emergencySetting;
        $this->assertTrue($setting->dual_approval);
        $this->assertSame($wife->id, $setting->approver_user_id);
        $this->assertTrue(Hash::check('4321', $setting->emergency_pin));
        $this->assertTrue($setting->isLocked());

        $recipients = EmergencyBeneficiary::where('wallet_id', $wallet->id)->orderBy('position')->get();
        $this->assertSame([$wife->id, $brother->id], $recipients->pluck('user_id')->all());
        $this->assertSame(50_000_000, $recipients[0]->withdrawal_limit);
        $this->assertSame('delay_7d', $recipients[1]->access_type);

        // Recipients can see the wallet, read-only.
        $this->assertSame('beneficiary', WalletMember::where('wallet_id', $wallet->id)->where('user_id', $brother->id)->value('role'));
        $this->assertFalse($wallet->canSpend($wife));
    }

    public function test_emergency_setup_validation(): void
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', 100_000);
        $other = User::factory()->create();
        Sanctum::actingAs($owner);

        // No unlock rule at all.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['manual_unlock' => false]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency');
        // Manual unlock without an emergency PIN.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['emergency_pin' => null]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.emergency_pin');
        // Dual approval without an approver.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['dual_approval' => true]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.approver_user_id');
        // Yourself as a recipient.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['beneficiaries' => [['user_id' => $owner->id]]]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.beneficiaries.0.user_id');
        // More than three recipients.
        $four = User::factory()->count(4)->create()->map(fn ($u) => ['user_id' => $u->id])->all();
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['beneficiaries' => $four]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.beneficiaries');
        // Document unlock with nobody but the owner to present it.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, ['manual_unlock' => false, 'unlock_on_document' => true]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.unlock_on_document');
        // Rules on a non-emergency wallet.
        $this->postJson('/api/v1/wallets', $this->emergencyPayload($main, [], ['type' => 'savings']))
            ->assertStatus(422);

        $this->assertSame(0, Wallet::where('user_id', $owner->id)->where('type', '!=', 'main')->count());
        $this->assertSame(100_000, $main->refresh()->balance);
        $this->assertNotNull($other);
    }

    // ------------------------------------------------------------- the lock

    public function test_locked_wallet_blocks_spending_until_manual_pin_unlock(): void
    {
        [$owner, $main, $wallet] = $this->createEmergency();

        // Distinct amounts so the transfer endpoint's double-submit guard never trips.
        $transfer = fn (string $amount = '50') => $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $wallet->id,
            'amount' => $amount,
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id],
        ]);

        $transfer()->assertStatus(403);
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", [
            'amount' => '50',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id],
        ])->assertStatus(422);

        // Funding is always allowed.
        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $main->id,
            'amount' => '10',
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $wallet->id],
        ])->assertOk();

        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '0000'])
            ->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->assertTrue($wallet->fresh()->isEmergencyLocked());

        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('data.emergency.locked', false)
            ->assertJsonPath('data.emergency.unlocked_via', 'manual');

        $transfer()->assertOk();
        $this->assertSame(16_000, $wallet->refresh()->balance);

        // Locking again restores the gate.
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/lock")->assertOk()->assertJsonPath('data.emergency.locked', true);
        $transfer('5')->assertStatus(403);
    }

    public function test_automation_cannot_drain_a_locked_wallet(): void
    {
        [$owner, $main, $wallet] = $this->createEmergency();

        $rule = AutomationRule::create([
            'user_id' => $owner->id,
            'name' => 'Drain',
            'from_wallet_id' => $wallet->id,
            'to_wallet_id' => $main->id,
            'amount' => 1_000,
            'frequency' => 'daily',
            'enabled' => true,
        ]);

        $result = AutomationService::make()->runRule($rule, now(), true);

        $this->assertSame('skipped', $result['status']);
        $this->assertSame(20_000, $wallet->refresh()->balance);
    }

    public function test_high_balance_override_needs_balance_above_threshold(): void
    {
        [$owner, $main, $wallet] = $this->createEmergency(['override_high_balance' => true], mainKobo: 200_000_000);

        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/override", ['pin' => '1234'])
            ->assertStatus(422);

        $wallet->update(['balance' => 100_000_001]); // just over ₦1,000,000
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/override", ['pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('data.emergency.unlocked_via', 'high_balance');
    }

    // ------------------------------------------------------ dual approval

    public function test_dual_approval_needs_a_second_person(): void
    {
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        $this->makeWallet($wife, 'main', 0);
        [$owner, $main, $wallet] = $this->createEmergency([
            'dual_approval' => true,
            'approver_user_id' => $wife->id,
            'beneficiaries' => [['user_id' => $brother->id, 'withdrawal_limit' => '50']],
        ]);

        // The brother (recipient) asks; he can't approve his own request.
        Sanctum::actingAs($brother);
        $res = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval', 'note' => 'Hospital bill']);
        $res->assertCreated();
        $requestId = $res->json('data.request.id');

        $this->postJson("/api/v1/emergency-requests/{$requestId}/approve")->assertStatus(422);
        // Only one pending dual request at a time.
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval'])->assertStatus(422);

        // An outsider can't see or act on it.
        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/v1/emergency-requests/{$requestId}/approve")->assertStatus(404);

        // The wife (approver) agrees → unlocked.
        Sanctum::actingAs($wife);
        $this->postJson("/api/v1/emergency-requests/{$requestId}/approve")
            ->assertOk()
            ->assertJsonPath('data.emergency.locked', false)
            ->assertJsonPath('data.emergency.unlocked_via', 'dual_approval');

        $this->assertSame('approved', EmergencyUnlockRequest::find($requestId)->status);
    }

    // ------------------------------------------------------ document review

    public function test_document_claim_unlocks_after_admin_verification(): void
    {
        Storage::fake('local');
        $brother = User::factory()->create();
        [$owner, $main, $wallet] = $this->createEmergency([
            'manual_unlock' => false,
            'unlock_on_document' => true,
            'beneficiaries' => [['user_id' => $brother->id]],
        ]);

        Sanctum::actingAs($brother);
        $res = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", [
            'method' => 'document',
            'document_type' => 'death_certificate',
            'file' => UploadedFile::fake()->image('certificate.jpg'),
        ]);
        $res->assertCreated()->assertJsonPath('data.request.has_document', true);
        $request = EmergencyUnlockRequest::findOrFail($res->json('data.request.id'));
        Storage::disk('local')->assertExists($request->document_path);

        // The owner is told about the claim.
        $this->assertDatabaseHas('app_notifications', ['user_id' => $owner->id, 'type' => 'emergency_document_submitted']);

        // Recipients can't approve documents — that's Patriai's job.
        $this->postJson("/api/v1/emergency-requests/{$request->id}/approve")->assertStatus(422);

        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);
        $this->get("/api/v1/admin/emergency-requests/{$request->id}/document")->assertOk();
        $this->getJson('/api/v1/admin/emergency-requests?status=pending')->assertOk()->assertJsonPath('data.requests.0.id', $request->id);
        $this->postJson("/api/v1/admin/emergency-requests/{$request->id}/approve")->assertOk();

        $this->assertFalse($wallet->fresh()->isEmergencyLocked());
        $this->assertSame('document', $wallet->fresh()->emergencySetting->unlocked_via);
    }

    public function test_admin_can_reject_a_document(): void
    {
        Storage::fake('local');
        $brother = User::factory()->create();
        [, , $wallet] = $this->createEmergency(['unlock_on_document' => true, 'beneficiaries' => [['user_id' => $brother->id]]]);

        Sanctum::actingAs($brother);
        $id = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", [
            'method' => 'document',
            'document_type' => 'legal_notice',
            'file' => UploadedFile::fake()->create('notice.pdf', 120, 'application/pdf'),
        ])->assertCreated()->json('data.request.id');

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/v1/admin/emergency-requests/{$id}/reject", ['note' => 'Unreadable scan'])->assertOk();

        $this->assertTrue($wallet->fresh()->isEmergencyLocked());
        $this->assertDatabaseHas('app_notifications', ['user_id' => $brother->id, 'type' => 'emergency_request_declined']);
    }

    public function test_crisis_override_only_when_owner_opted_in(): void
    {
        [, , $optedOut] = $this->createEmergency();
        [, , $optedIn] = $this->createEmergency(['override_national_crisis' => true]);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson("/api/v1/admin/wallets/{$optedOut->id}/emergency/crisis-unlock", ['reason' => 'Flooding'])->assertStatus(422);
        $this->postJson("/api/v1/admin/wallets/{$optedIn->id}/emergency/crisis-unlock", ['reason' => 'Flooding'])->assertOk();

        $this->assertTrue($optedOut->fresh()->isEmergencyLocked());
        $this->assertFalse($optedIn->fresh()->isEmergencyLocked());
    }

    // ------------------------------------------------------ recipient payouts

    public function test_recipient_withdraws_within_limit_and_delay(): void
    {
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        $wifeMain = $this->makeWallet($wife, 'main', 0);
        $brotherMain = $this->makeWallet($brother, 'main', 0);
        [$owner, $main, $wallet] = $this->createEmergency([
            'beneficiaries' => [
                ['user_id' => $wife->id, 'withdrawal_limit' => '120', 'access_type' => 'immediate'],
                ['user_id' => $brother->id, 'withdrawal_limit' => '50', 'access_type' => 'delay_7d'],
            ],
        ]);

        // Nothing while locked.
        Sanctum::actingAs($wife);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/withdraw", ['amount' => '10', 'pin' => '1234'])->assertStatus(422);

        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '4321'])->assertOk();

        // Immediate recipient: within limit OK, beyond remaining allowance refused.
        Sanctum::actingAs($wife);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/withdraw", ['amount' => '100', 'pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('data.emergency.me.beneficiary.remaining', '20.00');
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/withdraw", ['amount' => '30', 'pin' => '1234'])->assertStatus(422);
        $this->assertSame(10_000, $wifeMain->refresh()->balance);
        $this->assertSame(10_000, $wallet->refresh()->balance);

        // 7-day recipient waits a week.
        Sanctum::actingAs($brother);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/withdraw", ['amount' => '10', 'pin' => '1234'])->assertStatus(422);
        $this->travel(8)->days();
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/withdraw", ['amount' => '10', 'pin' => '1234'])->assertOk();
        $this->assertSame(1_000, $brotherMain->refresh()->balance);

        // Re-locking resets allowances.
        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/lock")->assertOk();
        $this->assertSame(0, EmergencyBeneficiary::where('wallet_id', $wallet->id)->sum('withdrawn'));
    }

    public function test_detail_hides_the_note_from_recipients_until_unlock(): void
    {
        $wife = User::factory()->create();
        [$owner, , $wallet] = $this->createEmergency([
            'beneficiary_note' => 'For the kids',
            'beneficiaries' => [['user_id' => $wife->id]],
        ]);

        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertOk()
            ->assertJsonPath('data.emergency.beneficiary_note', 'For the kids')
            ->assertJsonPath('data.emergency.me.can_manual_unlock', true);

        Sanctum::actingAs($wife);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertOk()
            ->assertJsonPath('data.emergency.beneficiary_note', null)
            ->assertJsonPath('data.emergency.me.role', 'recipient');

        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertStatus(404);
    }

    // ------------------------------------------------- beneficiary order + editing

    public function test_beneficiary_order_sets_the_role_and_fallbacks_default_to_a_delay(): void
    {
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        $cousin = User::factory()->create();
        [, , $wallet] = $this->createEmergency([
            // Roles sent by the client are ignored: the order decides.
            'beneficiaries' => [
                ['user_id' => $wife->id, 'role' => 'fallback'],
                ['user_id' => $brother->id, 'role' => 'beneficiary'],
                ['user_id' => $cousin->id],
            ],
        ]);

        $rows = EmergencyBeneficiary::where('wallet_id', $wallet->id)->orderBy('position')->get();
        $this->assertSame([$wife->id, $brother->id, $cousin->id], $rows->pluck('user_id')->all());
        $this->assertSame(['beneficiary', 'fallback', 'fallback'], $rows->pluck('role')->all());
        $this->assertSame(['immediate', 'delay_7d', 'delay_7d'], $rows->pluck('access_type')->all());
    }

    private function rulesPayload(array $overrides = []): array
    {
        return array_merge([
            'pin' => '1234',
            'dual_approval' => false,
            'unlock_on_document' => false,
            'manual_unlock' => true,
            'unlock_reason' => 'Medical emergency',
            'override_national_crisis' => false,
            'override_high_balance' => false,
            'beneficiaries' => [],
        ], $overrides);
    }

    public function test_owner_edits_rules_reorders_beneficiaries_and_changes_custom_pin(): void
    {
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        $cousin = User::factory()->create();
        [$owner, , $wallet] = $this->createEmergency([
            'beneficiaries' => [['user_id' => $wife->id, 'withdrawal_limit' => '100'], ['user_id' => $brother->id]],
        ]);
        EmergencyBeneficiary::where('wallet_id', $wallet->id)->where('user_id', $wife->id)->update(['withdrawn' => 3_000]);

        $payload = $this->rulesPayload([
            'emergency_pin' => '9999',
            'beneficiaries' => [
                ['user_id' => $brother->id, 'relationship' => 'Brother', 'access_type' => 'immediate'],
                ['user_id' => $wife->id, 'relationship' => 'Wife', 'withdrawal_limit' => '150'],
                ['user_id' => $cousin->id],
            ],
        ]);

        // The transaction PIN guards every change.
        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", array_merge($payload, ['pin' => '0000']))
            ->assertStatus(422)->assertJsonValidationErrors('pin');

        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", $payload)->assertOk()
            ->assertJsonPath('data.emergency.beneficiaries.0.user.id', $brother->id)
            ->assertJsonPath('data.emergency.beneficiaries.0.role', 'beneficiary')
            ->assertJsonPath('data.emergency.beneficiaries.1.role', 'fallback')
            ->assertJsonPath('data.emergency.me.can_edit_rules', true);

        $wifeRow = EmergencyBeneficiary::where('wallet_id', $wallet->id)->where('user_id', $wife->id)->first();
        $this->assertSame(2, $wifeRow->position);
        $this->assertSame(3_000, $wifeRow->withdrawn); // kept across the edit
        $this->assertSame(15_000, $wifeRow->withdrawal_limit);
        $this->assertSame('beneficiary', WalletMember::where('wallet_id', $wallet->id)->where('user_id', $cousin->id)->value('role'));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $cousin->id, 'type' => 'emergency_recipient_added']);

        // The new custom PIN replaces the old one.
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '4321'])->assertStatus(422);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '9999'])->assertOk();

        // Beneficiaries can't change the rules.
        Sanctum::actingAs($brother);
        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", $payload)->assertStatus(422);
    }

    public function test_dropping_people_revokes_access_and_cancels_requests_for_switched_off_rules(): void
    {
        $wife = User::factory()->create();
        $brother = User::factory()->create();
        [$owner, , $wallet] = $this->createEmergency([
            'dual_approval' => true,
            'approver_user_id' => $wife->id,
            'beneficiaries' => [['user_id' => $brother->id]],
        ]);

        Sanctum::actingAs($brother);
        $requestId = $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/requests", ['method' => 'dual_approval'])
            ->assertCreated()->json('data.request.id');

        // Keep manual unlock (and its PIN, by sending none), drop dual approval and everyone else.
        Sanctum::actingAs($owner);
        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", $this->rulesPayload())->assertOk();

        $this->assertSame('cancelled', EmergencyUnlockRequest::find($requestId)->status);
        $this->assertFalse(WalletMember::where('wallet_id', $wallet->id)->whereIn('user_id', [$wife->id, $brother->id])->exists());
        $this->assertTrue(Hash::check('4321', $wallet->fresh()->emergencySetting->emergency_pin));

        Sanctum::actingAs($brother);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertStatus(404);

        // Turning manual unlock back on later needs a new custom PIN.
        Sanctum::actingAs($owner);
        $this->putJson("/api/v1/wallets/{$wallet->id}/emergency/rules", $this->rulesPayload(['manual_unlock' => false, 'unlock_on_document' => true]))
            ->assertStatus(422)->assertJsonValidationErrors('emergency.unlock_on_document');
    }

    public function test_approver_can_withdraw_once_unlocked_and_unlock_reason_is_shared(): void
    {
        $wife = User::factory()->create();
        $wifeMain = $this->makeWallet($wife, 'main', 0);
        $brother = User::factory()->create();
        [$owner, , $wallet] = $this->createEmergency([
            'dual_approval' => true,
            'approver_user_id' => $wife->id,
            'beneficiaries' => [['user_id' => $brother->id]],
        ]);
        $toWife = fn (string $amount) => $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $wallet->id,
            'amount' => $amount,
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $wifeMain->id],
        ]);

        // While locked the approver can't move money.
        Sanctum::actingAs($wife);
        $toWife('20')->assertStatus(403);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertJsonPath('data.emergency.me.can_spend', false);

        // The owner unlocks with the custom PIN and a reason.
        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/wallets/{$wallet->id}/emergency/unlock", ['pin' => '4321', 'reason' => 'Surgery at Reddington'])->assertOk();
        $this->assertDatabaseHas('wallet_audit_logs', ['wallet_id' => $wallet->id, 'event' => 'emergency_unlocked']);
        $this->assertStringContainsString('Surgery at Reddington', (string) AppNotification::where('user_id', $brother->id)->where('type', 'emergency_unlocked')->value('body'));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $wife->id, 'type' => 'emergency_unlocked']);

        // …and now the approver (wife) can withdraw on the owner's behalf.
        Sanctum::actingAs($wife);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertJsonPath('data.emergency.me.can_spend', true);
        $toWife('25')->assertOk();
        $this->assertSame(2_500, $wifeMain->refresh()->balance);

        // A recipient who isn't the approver still only gets their allowance route.
        Sanctum::actingAs($brother);
        $this->getJson("/api/v1/wallets/{$wallet->id}/emergency")->assertJsonPath('data.emergency.me.can_spend', false);
    }
}
