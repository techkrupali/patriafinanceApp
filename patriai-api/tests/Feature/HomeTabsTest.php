<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The data behind the redesigned Home and tabs (client prototype HOM-01,
 * TRS-01, AUT-01, FAM-01): GET /home, approval rules on GET /automations,
 * and Resend on a pending invite.
 */
class HomeTabsTest extends TestCase
{
    use RefreshDatabase;

    private function wallet(User $owner, string $type, int $kobo, array $extra = []): Wallet
    {
        $wallet = Wallet::create(['user_id' => $owner->id, 'type' => $type, 'name' => ucfirst($type), 'balance' => $kobo, ...$extra]);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $owner->id, 'role' => 'owner', 'status' => 'active']);

        return $wallet;
    }

    private function join(Wallet $wallet, User $user, string $role, bool $canApprove = false): void
    {
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $user->id, 'role' => $role, 'status' => 'active', 'can_approve' => $canApprove]);
    }

    private function txn(Wallet $wallet, string $direction, int $kobo, ?array $counterparty = null): Transaction
    {
        return Transaction::create([
            'reference' => Transaction::generateReference(),
            'wallet_id' => $wallet->id,
            'type' => $direction === 'credit' ? 'funding' : 'withdrawal',
            'direction' => $direction,
            'amount' => $kobo,
            'balance_after' => 0,
            'status' => 'successful',
            'counterparty' => $counterparty,
        ]);
    }

    private function request(Wallet $wallet, User $initiator, string $description): ApprovalRequest
    {
        return ApprovalRequest::create([
            'wallet_id' => $wallet->id,
            'initiator_id' => $initiator->id,
            'action' => 'withdrawal',
            'amount' => 1_500_000,
            'fee' => 0,
            'description' => $description,
            'payload' => [],
            'required_approvals' => 1,
            'approvals_count' => 0,
            'status' => 'pending',
            'expires_at' => now()->addHours(48),
        ]);
    }

    public function test_totals_split_into_yours_shared_and_children_with_this_months_money(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi']);
        $emeka = User::factory()->create(['first_name' => 'Emeka']);

        $main = $this->wallet($ngozi, 'main', 100_000);           // ₦1,000 yours
        $fees = $this->wallet($ngozi, 'savings', 500_000);        // ₦5,000 shared (Emeka is in it)
        $this->join($fees, $emeka, 'contributor');
        $this->wallet($ngozi, 'child', 20_000);                   // ₦200 children
        $house = $this->wallet($emeka, 'project', 300_000);       // ₦3,000 shared (Emeka owns it)
        $this->join($house, $ngozi, 'co_owner');
        $this->wallet($emeka, 'main', 999_900);                   // not Ngozi's to see

        $this->txn($main, 'credit', 50_000, ['kind' => 'bank']);                                   // in ₦500
        $this->txn($main, 'debit', 20_000, ['kind' => 'bank']);                                    // out ₦200
        $this->txn($main, 'debit', 10_000, ['kind' => 'wallet', 'wallet_id' => $fees->id]);        // a move: neither
        $this->txn($fees, 'credit', 10_000, ['kind' => 'wallet', 'wallet_id' => $main->id]);
        $old = $this->txn($main, 'credit', 70_000, ['kind' => 'bank']);
        $old->forceFill(['created_at' => now()->subMonthNoOverflow()->startOfMonth()])->save();    // last month

        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/home')
            ->assertOk()
            ->assertJsonPath('data.first_name', 'Ngozi')
            ->assertJsonPath('data.wallet_count', 4)
            ->assertJsonPath('data.totals.total', '9200.00')
            ->assertJsonPath('data.totals.yours', '1000.00')
            ->assertJsonPath('data.totals.shared', '8000.00')
            ->assertJsonPath('data.totals.children', '200.00')
            ->assertJsonPath('data.totals.month_in', '500.00')
            ->assertJsonPath('data.totals.month_out', '200.00');
    }

    public function test_needs_you_and_next_seven_days(): void
    {
        $this->travelTo(now()->startOfWeek()->setTime(9, 0)); // a Monday
        $ngozi = User::factory()->create(['first_name' => 'Ngozi']);
        $emeka = User::factory()->create(['first_name' => 'Emeka']);
        $tolu = User::factory()->create(['first_name' => 'Tolu']);

        $main = $this->wallet($ngozi, 'main', 2_840_000);              // ₦28,400
        $household = $this->wallet($ngozi, 'spending', 0);
        $childWallet = $this->wallet($ngozi, 'child', 4_230_000);
        $this->join($childWallet, $tolu, 'contributor');
        $house = $this->wallet($ngozi, 'project', 0);
        $this->join($house, $emeka, 'co_owner');

        // Tolu asks; Ngozi must answer. Ngozi asks; Emeka must answer.
        $this->request($childWallet, $tolu, 'School trip');
        $this->request($house, $ngozi, 'Milestone 2: roofing');

        // An invite waiting for Ngozi, and a submitted milestone on her project.
        WalletInvitation::create([
            'wallet_id' => $this->wallet($emeka, 'goal', 0, ['name' => 'Christmas'])->id,
            'inviter_id' => $emeka->id, 'invitee_user_id' => $ngozi->id, 'invitee_identifier' => $ngozi->email,
            'role' => 'contributor', 'status' => 'pending', 'token' => 'tok', 'expires_at' => now()->addDays(7),
        ]);
        $project = Project::create(['wallet_id' => $house->id, 'owner_id' => $ngozi->id, 'title' => 'Mama\'s house', 'budget' => 0, 'status' => 'active']);
        Milestone::create(['project_id' => $project->id, 'sequence' => 1, 'title' => 'Tiling', 'amount' => 100_000, 'status' => 'submitted']);

        // Sunday upkeep of ₦50,000 from Main (only ₦28,400 there), and a weekly allowance Main can afford.
        AutomationRule::create([
            'user_id' => $ngozi->id, 'name' => 'Mama Okafor upkeep', 'from_wallet_id' => $main->id, 'to_wallet_id' => $household->id,
            'amount' => 5_000_000, 'frequency' => 'weekly', 'day_of_week' => 7, 'enabled' => true,
        ]);
        AutomationRule::create([
            'user_id' => $ngozi->id, 'name' => 'Tolu allowance', 'from_wallet_id' => $main->id, 'to_wallet_id' => $childWallet->id,
            'amount' => 500_000, 'frequency' => 'weekly', 'day_of_week' => 3, 'enabled' => true,
        ]);
        AutomationRule::create([
            'user_id' => $ngozi->id, 'name' => 'Paused one', 'from_wallet_id' => $main->id, 'to_wallet_id' => $household->id,
            'amount' => 100, 'frequency' => 'daily', 'enabled' => false,
        ]);

        Sanctum::actingAs($ngozi);
        $home = $this->getJson('/api/v1/home')->assertOk()->json('data');

        $this->assertSame(4, $home['needs_you']['count']);
        $this->assertEqualsCanonicalizing(
            ['approval', 'invitation', 'milestone', 'low_funds'],
            array_column($home['needs_you']['items'], 'kind'),
        );
        $this->assertContains('Main is short for Sunday', array_column($home['needs_you']['items'], 'label'));
        $this->assertContains('tiling approval', array_column($home['needs_you']['items'], 'label'));

        $upcoming = collect($home['upcoming'])->keyBy('title');
        $this->assertSame('Waiting for you', $upcoming['School trip']['subtitle']);
        $this->assertSame('Waiting for Emeka', $upcoming['Milestone 2: roofing']['subtitle']);
        $this->assertSame('Main is ₦21,600 short', $upcoming['Mama Okafor upkeep']['subtitle']);
        $this->assertSame('danger', $upcoming['Mama Okafor upkeep']['tone']);
        $this->assertSame(now()->next('Sunday')->toDateString(), $upcoming['Mama Okafor upkeep']['date']);
        $this->assertSame('Rule · to Child', $upcoming['Tolu allowance']['subtitle']);
        $this->assertFalse($upcoming->has('Paused one'));
        // Soonest first.
        $this->assertSame(collect($home['upcoming'])->pluck('date')->sort()->values()->all(), collect($home['upcoming'])->pluck('date')->all());

        $this->assertSame([['id' => $project->id, 'title' => "Mama's house", 'status_line' => 'Tiling submitted', 'needs_review' => true]], $home['projects']);
    }

    public function test_goal_rings_show_progress_for_wallets_with_a_target(): void
    {
        $ngozi = User::factory()->create();
        $this->wallet($ngozi, 'main', 999_999);
        $this->wallet($ngozi, 'goal', 68_000_000, ['name' => 'School fees', 'target_amount' => 85_000_000, 'target_date' => now()->addMonths(2)]);
        $this->wallet($ngozi, 'savings', 13_500_000, ['name' => 'Christmas', 'target_amount' => 30_000_000, 'target_date' => now()->addMonth()]);
        $this->wallet($ngozi, 'savings', 90_000_000, ['name' => 'Over', 'target_amount' => 60_000_000]);
        $this->wallet($ngozi, 'savings', 1000, ['name' => 'No target']);

        Sanctum::actingAs($ngozi);
        $goals = $this->getJson('/api/v1/home')->assertOk()->json('data.goals');

        $this->assertSame(['Christmas', 'School fees', 'Over'], array_column($goals, 'name'));
        $this->assertSame([45, 80, 100], array_column($goals, 'percent'));
    }

    public function test_rules_list_carries_next_run_and_approval_rules(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi']);
        $emeka = User::factory()->create(['first_name' => 'Emeka']);
        $aunty = User::factory()->create(['first_name' => 'Ada']);
        $main = $this->wallet($ngozi, 'main', 0);
        $house = $this->wallet($ngozi, 'project', 0, ['name' => 'House Project', 'approval_enabled' => true, 'approval_threshold' => 10_000_000, 'required_approvals' => 2]);
        $this->join($house, $emeka, 'co_owner');
        $this->join($house, $aunty, 'contributor');
        $this->wallet($ngozi, 'savings', 0, ['name' => 'No approvals']);
        AutomationRule::create([
            'user_id' => $ngozi->id, 'name' => 'Save', 'from_wallet_id' => $main->id, 'to_wallet_id' => $house->id,
            'amount' => 100, 'frequency' => 'daily', 'enabled' => true,
        ]);

        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/automations')
            ->assertOk()
            ->assertJsonPath('data.automations.0.next_run_on', now()->toDateString())
            ->assertJsonPath('data.approval_rules', [[
                'wallet_id' => $house->id,
                'wallet_name' => 'House Project',
                'wallet_type' => 'project',
                'threshold' => '100000.00',
                'required_approvals' => 2,
                'approvers' => ['Ngozi', 'Emeka'],
            ]]);

        // Emeka co-owns it, so he sees it too; Ada only contributes, so she doesn't.
        Sanctum::actingAs($emeka);
        $this->getJson('/api/v1/automations')->assertJsonCount(1, 'data.approval_rules');
        Sanctum::actingAs($aunty);
        $this->getJson('/api/v1/automations')->assertJsonCount(0, 'data.approval_rules');
    }

    public function test_pending_invite_can_be_resent_and_reaches_people_without_an_account(): void
    {
        config(['services.termii.api_key' => 'test-key']);
        Http::fake(['*/api/sms/send' => Http::response(['message' => 'ok'])]);

        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor']);
        $stranger = User::factory()->create();
        $fees = $this->wallet($ngozi, 'savings', 0, ['name' => 'School fees']);

        Sanctum::actingAs($ngozi);
        $invite = $this->postJson("/api/v1/wallets/{$fees->id}/invitations", ['identifier' => '+2348011112222', 'role' => 'contributor'])
            ->assertCreated()
            ->json('data.invitation');
        Http::assertSent(fn ($req) => $req['to'] === '2348011112222' && str_contains($req['sms'], 'Ngozi Okafor invited you to join School fees'));

        // Straight away is too soon; after a minute it goes again with a new week to answer.
        $this->postJson("/api/v1/wallets/{$fees->id}/invitations/{$invite['id']}/resend")->assertStatus(429);
        $this->travel(2)->minutes();
        $this->travel(3)->days();
        $this->postJson("/api/v1/wallets/{$fees->id}/invitations/{$invite['id']}/resend")->assertOk();
        $this->assertTrue(WalletInvitation::find($invite['id'])->expires_at->gt(now()->addDays(6)));
        Http::assertSentCount(2);

        Sanctum::actingAs($stranger);
        $this->postJson("/api/v1/wallets/{$fees->id}/invitations/{$invite['id']}/resend")->assertNotFound();

        Sanctum::actingAs($ngozi);
        $this->deleteJson("/api/v1/wallets/{$fees->id}/invitations/{$invite['id']}")->assertOk();
        $this->travel(2)->minutes();
        $this->postJson("/api/v1/wallets/{$fees->id}/invitations/{$invite['id']}/resend")->assertStatus(422);
    }

    public function test_wallet_list_marks_shared_wallets_and_language_saves(): void
    {
        $ngozi = User::factory()->create();
        $emeka = User::factory()->create();
        $main = $this->wallet($ngozi, 'main', 0);
        $fees = $this->wallet($ngozi, 'savings', 0);
        $this->join($fees, $emeka, 'contributor');
        $house = $this->wallet($emeka, 'project', 0);
        $this->join($house, $ngozi, 'co_owner');

        Sanctum::actingAs($ngozi);
        $shared = collect($this->getJson('/api/v1/wallets')->assertOk()->json('data.wallets'))->pluck('is_shared', 'id');
        $this->assertFalse($shared[$main->id]);
        $this->assertTrue($shared[$fees->id]);
        $this->assertTrue($shared[$house->id]);

        $this->putJson('/api/v1/profile', ['language' => 'pcm'])->assertOk()->assertJsonPath('data.user.language', 'pcm');
        $this->putJson('/api/v1/profile', ['language' => 'fr'])->assertStatus(422);
    }
}
