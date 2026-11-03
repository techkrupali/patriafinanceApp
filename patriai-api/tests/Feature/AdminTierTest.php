<?php

namespace Tests\Feature;

use App\Models\KycSubmission;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Settings → Verification tiers: an admin changes a tier's limits or adds
 * Tier 4, and the app's limits (ME-11), account level (ME-23) and KYC follow.
 */
class AdminTierTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_changes_limits_adds_tier_four_and_the_app_follows(): void
    {
        Storage::fake('local');
        $admin = User::factory()->create(['role' => 'admin']);
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'kyc_tier' => 3]);
        Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);

        // The settings page lists the three tiers from the table.
        Sanctum::actingAs($admin);
        $tiers = $this->getJson('/api/v1/admin/system-settings')->assertOk()->json('data.tiers');
        $this->assertSame([1, 2, 3], array_column($tiers, 'tier'));
        $this->assertSame(1, $tiers[2]['users']);

        // Tier 2 sends more; one payment can't be more than a day.
        $this->putJson('/api/v1/admin/tiers/2', ['daily' => 300000, 'single' => 400000])->assertStatus(422);
        $this->putJson('/api/v1/admin/tiers/2', ['daily' => 300000, 'single' => 250000, 'description' => 'Shared wallets and more each day.'])->assertOk();

        // Add Tier 4 for businesses.
        $this->postJson('/api/v1/admin/tiers', [
            'name' => 'Tier 4 · Business', 'needs' => 'CAC certificate and a director\'s ID',
            'description' => 'For family businesses that move big money.',
            'daily' => 20000000, 'single' => 10000000, 'max_balance' => null, 'max_wallets' => 50, 'shared_wallets' => true, 'loan_cap' => 5000000,
        ])->assertCreated()->assertJsonPath('data.tiers.3.tier', 4);
        $this->deleteJson('/api/v1/admin/tiers/3')->assertStatus(422);

        // The app: limits, the tier list and what's next.
        Sanctum::actingAs($ngozi);
        $l = $this->getJson('/api/v1/limits')->assertOk()->json('data');
        $this->assertSame([1, 2, 3, 4], array_column($l['tiers'], 'tier'));
        $this->assertSame('300000.00', $l['tiers'][1]['daily']);
        $this->assertSame(['tier' => 4, 'name' => 'Tier 4 · Business'], array_intersect_key($l['next'], ['tier' => 1, 'name' => 1]));
        $this->assertSame(4, $l['max_tier']);
        $k = $this->getJson('/api/v1/kyc')->assertOk()->json('data');
        $this->assertSame(4, $k['max_tier']);
        $this->assertSame(['note', 'document'], $k['next_tier']['requirements']);

        // Ask for Tier 4 with a note and a document; the team approves it.
        $this->post('/api/v1/kyc/submit', ['target_tier' => 4, 'note' => 'We run a shop'], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/v1/kyc/submit', ['target_tier' => 4, 'note' => 'We run a provisions shop in Enugu.', 'document' => UploadedFile::fake()->create('cac.pdf', 200, 'application/pdf')], ['Accept' => 'application/json'])->assertSuccessful();
        $sub = KycSubmission::where('user_id', $ngozi->id)->sole();
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/kyc/{$sub->id}/approve")->assertOk();
        $this->assertSame(4, (int) $ngozi->fresh()->kyc_tier);
        $this->deleteJson('/api/v1/admin/tiers/4')->assertStatus(422);
        $this->patchJson("/api/v1/admin/users/{$ngozi->id}/kyc-tier", ['tier' => 4])->assertOk();

        Sanctum::actingAs($ngozi->fresh());
        $l = $this->getJson('/api/v1/limits')->json('data');
        $this->assertSame(4, $l['tier']);
        $this->assertSame('20000000.00', $l['daily']);
        $this->assertNull($l['next']);
    }
}
