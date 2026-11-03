<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin → Wallets: the summary, who shares each wallet, search by owner, biggest first. */
class AdminWalletsListTest extends TestCase
{
    use RefreshDatabase;

    public function test_summary_members_owner_search_and_sort(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor']);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor']);
        $kemi = User::factory()->create(['first_name' => 'Kemi', 'last_name' => 'Adebayo']);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 10_000_000]);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'School fees', 'balance' => 50_000_000, 'status' => 'active']);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        Wallet::create(['user_id' => $kemi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 2_000_000, 'status' => 'frozen']);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $d = $this->getJson('/api/v1/admin/wallets?sort=balance')->assertOk()->json('data');
        $this->assertSame(['total' => 3, 'total_balance' => '620000.00', 'shared' => 1], array_intersect_key($d['summary'], ['total' => 1, 'total_balance' => 1, 'shared' => 1]));
        $this->assertSame(1, $d['summary']['by_status']['frozen']);
        $this->assertSame(['count' => 2, 'balance' => '120000.00'], $d['summary']['by_type']['main']);
        $this->assertSame(['School fees', 1], [$d['wallets'][0]['name'], $d['wallets'][0]['members_count']]);

        $o = $this->getJson('/api/v1/admin/wallets?search=ngozi okafor')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$main->id, $fees->id], array_column($o['wallets'], 'id'));
        $this->assertSame('600000.00', $o['summary']['matching_balance']);
    }
}
