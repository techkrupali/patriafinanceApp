<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\BudgetCategory;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\AutomationService;
use App\Services\BudgetService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Spending wallet from the client prototype (SPD-01…06, WAL-09): a monthly
 * budget from the 25th split into categories, topped up from Main or split
 * between people, spenders limited to categories and a daily amount, alerts,
 * and what happens over a limit; the leftover moves on at month end.
 */
class SpendingWalletTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'data' => ['balance' => 0]], 200));
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function join(WalletInvitation $invitation, User $user, array $body = []): void
    {
        Sanctum::actingAs($user);
        $this->postJson("/api/v1/invitations/{$invitation->id}/accept", $body)->assertOk();
    }

    /** Ngozi's Household: ₦350,000 a month from the 25th, five categories. */
    private function household(array $overrides = [], array $members = []): array
    {
        [$ngozi, $main] = $this->person('Ngozi', 100_000_000);
        $rent = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House rent', 'balance' => 0]);
        Sanctum::actingAs($ngozi);
        $budget = array_replace_recursive([
            'amount' => '350000',
            'period' => 'monthly',
            'start_day' => 25,
            'leftover' => ['mode' => 'wallet', 'wallet_id' => $rent->id],
            'funding' => 'topup',
            'alerts' => ['half' => true, 'eighty' => true, 'category_out' => true, 'weekly' => true],
            'over_limit' => 'approve',
            'categories' => [
                ['name' => 'Food and market', 'limit' => '150000'],
                ['name' => 'Fuel and transport', 'limit' => '70000'],
                ['name' => 'Electricity and water', 'limit' => '40000'],
                ['name' => 'School runs and lunch', 'limit' => '45000'],
                ['name' => 'Other', 'limit' => '45000'],
            ],
        ], $overrides);
        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'spending',
            'name' => 'Household',
            'purpose' => 'household',
            'mode' => 'shared',
            'source_wallet_id' => $main->id,
            'initial_deposit' => '350000',
            'budget' => $budget,
            'members' => $members,
        ])->assertCreated();

        return [Wallet::find($res->json('data.wallet.id')), $ngozi, $main, $rent];
    }

    private function spend(User $who, Wallet $from, int $naira, ?string $category, array $extra = []): \Illuminate\Testing\TestResponse
    {
        Sanctum::actingAs($who);
        $id = $category ? BudgetCategory::where('wallet_id', $from->id)->where('name', $category)->value('id') : null;

        return $this->postJson('/api/v1/transfers', array_filter([
            'from_wallet_id' => $from->id,
            'amount' => (string) $naira,
            'pin' => '1234',
            'budget_category_id' => $id,
            'destination' => ['kind' => 'bank', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'MAMA NKECHI STORES', 'bank_name' => 'GTBank'],
        ]) + $extra);
    }

    public function test_the_budget_is_set_up_with_categories_spenders_and_a_top_up(): void
    {
        [$emeka] = $this->person('Emeka');
        [$bisi] = $this->person('Bisi');
        [$tolu] = $this->person('Tolu');
        [$wallet, $ngozi] = $this->household([], [
            ['user_id' => $emeka->id, 'role' => 'co_owner'],
            ['user_id' => $bisi->id, 'role' => 'contributor', 'spend' => ['categories' => ['Food and market'], 'daily_limit' => '15000']],
            ['user_id' => $tolu->id, 'role' => 'viewer'],
        ]);

        $this->assertSame(35_000_000, $wallet->budget()['amount']);
        $this->assertSame(25, $wallet->budget()['start_day']);
        $this->assertSame(5, $wallet->budgetCategories()->count());
        $rule = AutomationRule::where('to_wallet_id', $wallet->id)->sole();
        $this->assertTrue($rule->fill_to);
        $this->assertSame(35_000_000, $rule->amount);
        $this->assertSame(25, $rule->day_of_month);

        $food = BudgetCategory::where('name', 'Food and market')->value('id');
        $invite = WalletInvitation::where('invitee_user_id', $bisi->id)->sole();
        $this->assertSame([$food], $invite->permissions['categories']);
        $this->assertSame(1_500_000, $invite->permissions['daily_limit']);
        $this->assertTrue($invite->permissions['withdraw']);

        // WAL-09 for the owner.
        $this->getJson("/api/v1/wallets/{$wallet->id}/budget")->assertOk()
            ->assertJsonPath('data.budget.amount', '350000.00')
            ->assertJsonPath('data.budget.categories.0.name', 'Food and market')
            ->assertJsonPath('data.budget.categories.0.limit', '150000.00')
            ->assertJsonPath('data.budget.period_start', '2026-10-25');

        // The categories can't add up to more than the budget.
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/wallets', [
            'type' => 'spending', 'name' => 'Too much', 'budget' => ['amount' => '100000', 'period' => 'monthly', 'categories' => [['name' => 'Food', 'limit' => '150000']]],
        ])->assertStatus(422);
        // A budget belongs to spending wallets only.
        $this->postJson('/api/v1/wallets', ['type' => 'savings', 'name' => 'Rent', 'budget' => ['amount' => '1000', 'period' => 'monthly']])->assertStatus(422);
    }

    public function test_a_spender_is_held_to_their_category_and_daily_limit(): void
    {
        [$emeka] = $this->person('Emeka');
        [$bisi] = $this->person('Bisi');
        [$wallet, $ngozi] = $this->household([], [
            ['user_id' => $emeka->id, 'role' => 'co_owner'],
            ['user_id' => $bisi->id, 'role' => 'contributor', 'spend' => ['categories' => ['Food and market'], 'daily_limit' => '15000']],
        ]);
        $this->join(WalletInvitation::where('invitee_user_id', $emeka->id)->sole(), $emeka);
        $this->join(WalletInvitation::where('invitee_user_id', $bisi->id)->sole(), $bisi);

        // Food is fine and is tagged; fuel isn't hers; no category isn't either.
        $this->spend($bisi, $wallet, 10_000, 'Food and market')->assertOk();
        $this->assertSame('Food and market', Transaction::where('wallet_id', $wallet->id)->where('type', 'withdrawal')->sole()->budgetCategory->name);
        $this->spend($bisi, $wallet, 5_000, 'Fuel and transport')->assertStatus(422)->assertJsonPath('errors.budget_category_id.0', 'You can only spend on Food and market from Household.');
        $this->spend($bisi, $wallet, 5_000, null)->assertStatus(422);

        // Over ₦15,000 today: it waits for Ngozi or Emeka.
        $res = $this->spend($bisi, $wallet, 8_000, 'Food and market')->assertOk()->assertJsonPath('data.pending_approval', true);
        $request = ApprovalRequest::findOrFail($res->json('data.approval.id'));
        $this->assertSame('over your ₦15,000 a day', $request->payload['over_limit']);
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$request->id}/respond", ['decision' => 'approve'])->assertOk();
        $this->assertSame('executed', $request->refresh()->status);
        $this->assertSame(2, Transaction::where('wallet_id', $wallet->id)->where('type', 'withdrawal')->whereNotNull('budget_category_id')->count());
    }

    public function test_stop_the_payment_means_nothing_goes_over(): void
    {
        [$wallet, $ngozi] = $this->household(['over_limit' => 'stop']);

        $this->spend($ngozi, $wallet, 40_000, 'Electricity and water')->assertOk();
        $this->spend($ngozi, $wallet, 1_000, 'Electricity and water')->assertStatus(422)
            ->assertJsonPath('errors.amount.0', "That's over the Electricity and water limit — ₦0 left. Nothing goes over the limit.");
        // Owners hear the category ran out.
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'budget_alert')->where('title', 'Electricity and water has run out')->count());
    }

    public function test_owners_hear_at_half_and_80_percent_once_a_month(): void
    {
        [$wallet, $ngozi] = $this->household();

        $this->spend($ngozi, $wallet, 100_000, 'Food and market')->assertOk();
        $this->spend($ngozi, $wallet, 80_000, 'Other')->assertOk(); // ₦180,000 of ₦350,000: over half (Other goes over → no approver, so it goes)
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('title', '50% of Household is spent')->count());
        $this->spend($ngozi, $wallet, 5_000, 'Food and market')->assertOk();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('title', '50% of Household is spent')->count());
        $this->spend($ngozi, $wallet, 99_000, 'Fuel and transport')->assertOk(); // ₦284,000: past 80%
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('title', '80% of Household is spent')->count());

        $this->assertSame(1, BudgetService::make()->weeklySummary());
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('title', 'Household this week')->count());
    }

    public function test_at_month_end_the_leftover_moves_and_the_top_up_fills_it_back(): void
    {
        [$wallet, $ngozi, $main, $rent] = $this->household();
        $this->spend($ngozi, $wallet, 50_000, 'Food and market')->assertOk(); // ₦300,000 - ₦20 fee left

        Carbon::setTestNow(Carbon::parse('2026-11-25 00:00:00'));
        $this->artisan('budgets:roll')->assertSuccessful();
        $this->assertSame(0, $wallet->refresh()->balance);
        $this->assertSame(29_998_000, $rent->refresh()->balance);
        // The leftover isn't spending.
        $this->assertSame(0, BudgetService::make()->spent($wallet, Carbon::parse('2026-11-25')));
        // Once a period.
        $this->artisan('budgets:roll')->assertSuccessful();
        $this->assertSame(29_998_000, $rent->refresh()->balance);

        AutomationService::make()->runDue();
        $this->assertSame(35_000_000, $wallet->refresh()->balance);
        $this->assertSame(100_000_000 - 35_000_000 - 35_000_000, $main->refresh()->balance);
    }

    public function test_split_between_us_each_pays_their_share_on_the_day(): void
    {
        [$emeka, $emekaMain] = $this->person('Emeka', 50_000_000);
        [$wallet, $ngozi, $main] = $this->household(['funding' => 'split', 'my_share' => '210000'], [
            ['user_id' => $emeka->id, 'role' => 'co_owner', 'pledge' => '140000'],
        ]);
        $this->assertSame(21_000_000, AutomationRule::where('user_id', $ngozi->id)->where('to_wallet_id', $wallet->id)->sole()->amount);

        $this->join(WalletInvitation::where('invitee_user_id', $emeka->id)->sole(), $emeka, ['source_wallet_id' => $emekaMain->id]);
        $rule = AutomationRule::where('user_id', $emeka->id)->where('to_wallet_id', $wallet->id)->sole();
        $this->assertSame(14_000_000, $rule->amount);
        $this->assertSame(25, $rule->day_of_month);

        // Emeka's Main is short on the day: he's reminded, then Ngozi is told after 2 days.
        $emekaMain->update(['balance' => 0]);
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'share_missed')->count());
        $this->assertSame(0, AppNotification::where('user_id', $ngozi->id)->where('type', 'share_missed')->count());
        Carbon::setTestNow(Carbon::parse('2026-11-27 10:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'share_missed')->count());
    }

    public function test_owners_change_limits_from_wal_09(): void
    {
        [$bisi] = $this->person('Bisi');
        [$wallet, $ngozi] = $this->household([], [
            ['user_id' => $bisi->id, 'role' => 'contributor', 'spend' => ['categories' => ['Food and market'], 'daily_limit' => '15000']],
        ]);
        $this->join(WalletInvitation::where('invitee_user_id', $bisi->id)->sole(), $bisi);
        $food = BudgetCategory::where('name', 'Food and market')->sole();
        $fuel = BudgetCategory::where('name', 'Fuel and transport')->sole();

        Sanctum::actingAs($ngozi);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/budget/categories/{$food->id}", ['limit' => '160000'])->assertStatus(422);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/budget/categories/{$fuel->id}", ['limit' => '60000'])->assertOk();
        $this->patchJson("/api/v1/wallets/{$wallet->id}/budget/spenders/{$bisi->id}", ['categories' => [$food->id, $fuel->id], 'daily_limit' => '20000'])->assertOk()
            ->assertJsonPath('data.budget.spenders.0.daily_limit', '20000.00')
            ->assertJsonPath('data.budget.spenders.0.categories.1', 'Fuel and transport');

        // Bisi can't change her own limits.
        Sanctum::actingAs($bisi);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/budget/spenders/{$bisi->id}", ['categories' => null, 'daily_limit' => null])->assertNotFound();
    }
}
