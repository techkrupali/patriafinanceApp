<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Circle;
use App\Models\EmergencySetting;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\CircleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Family circles from the client prototype: HOM-06 "Your circles", FAM-02 who
 * is in which wallet, FAM-07 a member, FAM-08 their role, FAM-09 removing
 * them, FAM-10 activity, FAM-11 another circle and FAM-12 handing it over.
 */
class CircleFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'data' => []]));
        Carbon::setTestNow(Carbon::parse('2026-11-04 09:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, string $last = 'Okafor', int $tier = 3): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => $last, 'phone' => '+23480' . random_int(10000000, 99999999), 'kyc_tier' => $tier]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function wallet(User $owner, string $name, string $type = 'savings'): Wallet
    {
        $w = Wallet::create(['user_id' => $owner->id, 'type' => $type, 'name' => $name, 'balance' => 50_000_000]);
        WalletMember::create(['wallet_id' => $w->id, 'user_id' => $owner->id, 'role' => 'owner', 'status' => 'active']);

        return $w;
    }

    private function join(Wallet $w, User $u, string $role = 'contributor', bool $approve = false): WalletMember
    {
        return WalletMember::create(['wallet_id' => $w->id, 'user_id' => $u->id, 'role' => $role, 'can_approve' => $approve, 'status' => 'active']);
    }

    public function test_family_circle_view_member_role_and_activity(): void
    {
        $ngozi = $this->person('Ngozi');
        $emeka = $this->person('Emeka');
        $ada = $this->person('Ada', 'Eze');
        $fees = $this->wallet($ngozi, 'School fees 2027');
        $house = $this->wallet($ngozi, 'Household', 'spending');
        $this->join($fees, $emeka, 'co_owner', true);
        $this->join($house, $emeka, 'admin');
        $this->join($fees, $ada);
        Transaction::create(['wallet_id' => $fees->id, 'user_id' => $emeka->id, 'type' => 'transfer_in', 'direction' => 'credit', 'amount' => 4_000_000, 'fee' => 0, 'balance_after' => 54_000_000, 'status' => 'successful', 'reference' => 'PTX-EM-1', 'description' => 'For fees']);

        Sanctum::actingAs($ngozi);
        // FAM-01: your home circle is "Okafor family", made when first needed.
        $family = $this->getJson('/api/v1/family')->assertOk()->json('data');
        $this->assertSame('Okafor family', $family['circle']['name']);
        $this->assertSame('owner', $family['circle']['my_role']);
        $this->assertSame(2, $family['stats']['shared_wallets']);
        $this->assertEqualsCanonicalizing(['Emeka Okafor', 'Ada Eze'], array_column($family['members'], 'name'));

        // FAM-02: who is in which wallet.
        $view = $this->getJson('/api/v1/circles/0/view')->assertOk()->json('data');
        $row = collect($view['wallets'])->firstWhere('name', 'School fees 2027');
        $this->assertEqualsCanonicalizing([$ngozi->id, $emeka->id, $ada->id], $row['in']);
        $this->assertSame('You', $view['people'][0]['short']);

        // FAM-07: Emeka's wallets and roles, and what he put in.
        $m = $this->getJson("/api/v1/circles/0/members/{$emeka->id}")->assertOk()->json('data');
        $this->assertSame('Co-owner', $m['role_label']);
        $this->assertStringStartsWith('Verified · Tier 3 · 080', $m['identity']);
        $fee = collect($m['wallets'])->firstWhere('wallet_name', 'School fees 2027');
        $this->assertSame('Co-owner · approves', $fee['line']);
        $this->assertSame('Put in ₦40,000', $fee['put_in']);
        $this->assertSame('Emeka added ₦40,000 to School fees 2027', $m['recent'][0]['text']);

        // FAM-08: Emeka becomes a contributor who can't approve; that reaches each wallet.
        $res = $this->putJson("/api/v1/circles/0/members/{$emeka->id}/role", ['role' => 'contributor', 'permissions' => ['approve' => false, 'send' => true]])->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['School fees 2027', 'Household'], $res['updated']);
        $this->assertSame('contributor', WalletMember::where('wallet_id', $fees->id)->where('user_id', $emeka->id)->value('role'));
        $this->assertFalse($fees->fresh()->canApprove($emeka));
        $this->assertTrue((bool) WalletMember::where('wallet_id', $house->id)->where('user_id', $emeka->id)->first()->permissions['withdraw']);
        $this->assertSame('Contributor', $res['member']['role_label']);
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'circle_role_changed')->count());

        // Only the owner changes roles.
        Sanctum::actingAs($emeka);
        $this->putJson("/api/v1/circles/0/members/{$ada->id}/role", ['role' => 'admin', 'permissions' => []])->assertStatus(422);

        // FAM-10: the family's activity, by kind.
        Sanctum::actingAs($ngozi);
        $all = $this->getJson('/api/v1/circles/0/activity')->assertOk()->json('data.items');
        $this->assertContains('Emeka added ₦40,000 to School fees 2027', array_column($all, 'text'));
        $people = $this->getJson('/api/v1/circles/0/activity?filter=people')->assertOk()->json('data.items');
        $this->assertNotEmpty($people);
        $this->assertSame(['people'], array_values(array_unique(array_column($people, 'kind'))));
        $this->assertSame([], array_values(array_filter(array_column($this->getJson('/api/v1/circles/0/activity?filter=money')->json('data.items'), 'kind'), fn ($k) => $k !== 'money')));
    }

    public function test_remove_a_member_keeps_their_money_and_asks_for_a_new_keyholder(): void
    {
        $ngozi = $this->person('Ngozi');
        $ada = $this->person('Ada', 'Eze');
        $fees = $this->wallet($ngozi, 'School fees 2027');
        $fund = $this->wallet($ngozi, 'Family emergency', 'emergency');
        $this->join($fees, $ada);
        $this->join($fund, $ada);
        EmergencySetting::create(['wallet_id' => $fund->id, 'purpose' => 'medical', 'keyholder_ids' => [$ada->id], 'required_keyholders' => 2]);
        Transaction::create(['wallet_id' => $fees->id, 'user_id' => $ada->id, 'type' => 'transfer_in', 'direction' => 'credit', 'amount' => 10_000_000, 'fee' => 0, 'balance_after' => 1, 'status' => 'successful', 'reference' => 'PTX-ADA-1', 'description' => 'x']);
        Transaction::create(['wallet_id' => $fund->id, 'user_id' => $ada->id, 'type' => 'transfer_in', 'direction' => 'credit', 'amount' => 15_000_000, 'fee' => 0, 'balance_after' => 1, 'status' => 'successful', 'reference' => 'PTX-ADA-2', 'description' => 'x']);

        Sanctum::actingAs($ngozi);
        $m = $this->getJson("/api/v1/circles/0/members/{$ada->id}")->json('data');
        $this->assertSame('Keyholder · 2 of 2', collect($m['wallets'])->firstWhere('wallet_name', 'Family emergency')['line']);

        // FAM-09 "Remove Aunty Ada?"
        $p = $this->getJson("/api/v1/circles/0/members/{$ada->id}/remove")->assertOk()->json('data');
        $this->assertSame('₦250,000 stay in the wallets', $p['contributions']['total']);
        $this->assertSame('School fees ₦100,000 · Family emergency ₦150,000', $p['contributions']['detail']);
        $this->assertSame(['School fees 2027', 'Family emergency'], $p['wallets']);
        $this->assertSame(['wallets' => ['Family emergency'], 'days' => 7], $p['keyholder']);

        $this->deleteJson("/api/v1/circles/0/members/{$ada->id}")->assertOk();
        $this->assertFalse($fees->fresh()->isAccessibleBy($ada));
        $this->assertSame(500_000_00, (int) $fees->fresh()->balance);
        $this->assertSame([], EmergencySetting::where('wallet_id', $fund->id)->first()->keyholder_ids);
        $this->assertSame('2026-11-11', $fund->fresh()->meta['keyholder_needed_by']);
        $this->assertSame(1, AppNotification::where('user_id', $ada->id)->where('type', 'circle_removed')->count());
        $this->assertSame([], $this->getJson('/api/v1/family')->json('data.members'));
        // The owner can't be removed, and someone outside isn't "in" it.
        $this->deleteJson("/api/v1/circles/0/members/{$ada->id}")->assertStatus(422);
    }

    public function test_another_circle_switcher_and_handing_it_over(): void
    {
        $ngozi = $this->person('Ngozi');
        $emeka = $this->person('Emeka');
        $ada = $this->person('Ada', 'Eze', 2);
        $house = $this->wallet($ngozi, 'Family house, Enugu', 'project');

        Sanctum::actingAs($ngozi);
        // FAM-11 "New circle".
        $c = $this->postJson('/api/v1/circles', ['name' => 'Eze siblings', 'kind' => 'siblings', 'purpose' => 'Looking after Mama and the family house'])->assertCreated()->json('data.circle');
        $this->postJson('/api/v1/circles', ['name' => 'eze siblings', 'kind' => 'siblings'])->assertStatus(422);
        // "Nothing is shared with the Okafor family unless you move it."
        $this->patchJson("/api/v1/wallets/{$house->id}/circle", ['circle_id' => $c['id']])->assertOk();
        $this->patchJson("/api/v1/wallets/{$ngozi->mainWallet()->id}/circle", ['circle_id' => $c['id']])->assertStatus(422);
        $this->join($house, $emeka, 'co_owner', true);
        $this->join($house, $ada);

        $home = $this->getJson('/api/v1/family')->json('data');
        $this->assertSame([], $home['members']);
        $eze = $this->getJson("/api/v1/family?circle={$c['id']}")->json('data');
        $this->assertSame('Eze siblings', $eze['circle']['name']);
        $this->assertCount(2, $eze['members']);

        // HOM-06 "Your circles": your family first.
        $list = $this->getJson('/api/v1/circles')->json('data.circles');
        $this->assertSame(['Okafor family', 'Eze siblings'], array_column($list, 'name'));
        $this->assertSame('Owner · Looking after Mama and the family house', $list[1]['subtitle']);
        Sanctum::actingAs($emeka);
        $theirs = collect($this->getJson('/api/v1/circles')->json('data.circles'))->firstWhere('name', 'Eze siblings');
        $this->assertSame('Co-owner', $theirs['role_label']);

        // FAM-12: only someone at Tier 3 can take it.
        Sanctum::actingAs($ngozi);
        $info = $this->getJson("/api/v1/circles/{$c['id']}/transfer")->json('data');
        $this->assertSame(['Co-owner · verified Tier 3', 'Contributor · would need Tier 3'], array_column($info['candidates'], 'line'));
        $this->postJson("/api/v1/circles/{$c['id']}/transfer", ['to_user_id' => $ada->id, 'pin' => '1234'])->assertStatus(422);
        $this->postJson("/api/v1/circles/{$c['id']}/transfer", ['to_user_id' => $emeka->id, 'pin' => '0000'])->assertStatus(422);
        $this->postJson("/api/v1/circles/{$c['id']}/transfer", ['to_user_id' => $emeka->id, 'pin' => '1234'])->assertOk();
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'circle_transfer')->count());

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/circles/{$c['id']}/transfer/accept")->assertOk()->assertJsonPath('data.circle.transfer.for_you', true);
        // 24 hours later it's Emeka's; Ngozi becomes a co-owner.
        Carbon::setTestNow(now()->addHours(25));
        $this->assertSame(1, CircleService::make()->settleAll());
        $circle = Circle::find($c['id']);
        $this->assertSame($emeka->id, $circle->owner_id);
        $this->assertSame('co_owner', $circle->members()->where('user_id', $ngozi->id)->value('role'));
        $this->assertSame('owner', $this->getJson("/api/v1/family?circle={$c['id']}")->json('data.circle.my_role'));
        // The wallets stay Ngozi's.
        $this->assertSame($ngozi->id, $house->fresh()->user_id);
    }
}
