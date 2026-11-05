<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Circle;
use App\Models\CircleMember;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * HOM-03 Home for a new person — "Get set up · 1 of 4 done" — and HOM-05
 * Search Patriai across wallets, money in and out (and requests waiting) and
 * rules, only within what the person can see.
 */
class HomeSetupSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_person_gets_the_set_up_checklist_until_it_is_done(): void
    {
        Http::fake();
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'kyc_tier' => 1]);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0, 'virtual_account' => '8034127790', 'virtual_account_bank' => 'Assetmatrix MFB']);
        Sanctum::actingAs($ngozi);

        $s = $this->getJson('/api/v1/home')->assertOk()->json('data.setup');
        $this->assertSame([true, false, false, false], array_column($s['steps'], 'done'));
        $this->assertSame([1, 4, true], [$s['done'], $s['total'], $s['new']]);
        $this->assertSame(['8034127790', 'Assetmatrix MFB', '0.00'], [$s['main']['account_number'], $s['main']['bank'], $s['main']['balance']]);

        // Verified, family in, a wallet shared: all four, and no longer new.
        $ngozi->forceFill(['kyc_tier' => 2])->save();
        $emeka = User::factory()->create(['first_name' => 'Emeka']);
        $circle = Circle::create(['created_by' => $ngozi->id, 'owner_id' => $ngozi->id, 'name' => 'Okafor family', 'kind' => 'family', 'is_home' => true]);
        CircleMember::create(['circle_id' => $circle->id, 'user_id' => $ngozi->id, 'role' => 'owner']);
        CircleMember::create(['circle_id' => $circle->id, 'user_id' => $emeka->id, 'role' => 'member']);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0, 'target_amount' => 850_000_00]);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $emeka->id, 'role' => 'contributor', 'status' => 'active']);

        $s = $this->getJson('/api/v1/home')->assertOk()->json('data.setup');
        $this->assertSame([4, false], [$s['done'], $s['new']]);
    }

    public function test_search_finds_wallets_money_requests_and_rules_you_can_see(): void
    {
        Http::fake();
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $tolu = User::factory()->create(['first_name' => 'Tolu', 'kyc_tier' => 1]);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 900_000_00]);
        $emekaMain = Wallet::create(['user_id' => $emeka->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 900_000_00]);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0, 'target_amount' => 850_000_00]);
        foreach ([[$ngozi, 'owner'], [$emeka, 'co_owner'], [$tolu, 'contributor']] as [$u, $role]) {
            WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active']);
        }
        $svc = WalletService::make();
        $svc->transferBetweenWallets($main, $fees, 640_000_00, $ngozi);
        $svc->transferBetweenWallets($emekaMain, $fees->refresh(), 40_000_00, $emeka);
        $svc->debit($main->refresh(), 185_000_00, 0, 'withdrawal', ['kind' => 'bank', 'account_name' => 'GREENFIELD SCHOOL', 'bank_name' => 'GTBank'], null, $ngozi->id);
        ApprovalRequest::create(['wallet_id' => $fees->id, 'initiator_id' => $tolu->id, 'action' => 'transfer_bank', 'amount' => 15_000_00, 'fee' => 0, 'description' => 'school trip', 'payload' => [], 'required_approvals' => 1, 'approvals_count' => 0, 'status' => 'pending', 'expires_at' => now()->addDay()]);
        AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Save from every salary', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 0, 'percent' => 10, 'frequency' => 'monthly', 'trigger' => 'salary']);
        // Someone else's wallet with "school" in it: never found.
        Wallet::create(['user_id' => User::factory()->create()->id, 'type' => 'goal', 'name' => 'Private school fund', 'balance' => 1]);

        Sanctum::actingAs($ngozi);
        $d = $this->getJson('/api/v1/search?q=school')->assertOk()->json('data');
        $this->assertSame(['School fees 2027'], array_column($d['wallets'], 'name'));
        $this->assertSame(['Goal · Shared · 80%', '680000.00'], [$d['wallets'][0]['line'], $d['wallets'][0]['balance']]);
        $titles = array_column($d['transactions'], 'title');
        $this->assertSame('Tolu: school trip', $titles[0]);
        $this->assertSame(['Request · Today', 'waiting', '15000.00'], [$d['transactions'][0]['line'], $d['transactions'][0]['status'], $d['transactions'][0]['amount']]);
        $this->assertContains('GREENFIELD SCHOOL', $titles);
        $this->assertSame([['name' => 'Save from every salary', 'line' => 'Moves 10% to School fees 2027']], array_map(fn ($r) => ['name' => $r['name'], 'line' => $r['line']], $d['rules']));

        // By a person's name, and by amount.
        $byName = $this->getJson('/api/v1/search?q=emeka')->json('data.transactions');
        $this->assertSame(['Emeka added money', 'School fees 2027 · Today', 'credit'], [$byName[0]['title'], $byName[0]['line'], $byName[0]['direction']]);
        $this->assertSame('GREENFIELD SCHOOL', $this->getJson('/api/v1/search?q=185,000')->json('data.transactions.0.title'));
        // A key inside the record isn't a match.
        $this->assertSame([], $this->getJson('/api/v1/search?q=bank_name')->json('data.transactions'));
        $this->getJson('/api/v1/search?q=a')->assertStatus(422);
    }
}
