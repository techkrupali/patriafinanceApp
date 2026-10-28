<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Savings wallet from the client prototype (SAV-01…06): money comes in as a
 * share of every salary, round-ups on spending, a fixed amount on a schedule or
 * by hand; a lock until a date or the target; and what happens when a save
 * can't. The client's sheet still holds: target and date, milestones,
 * contributors with their own permissions, one plan for everyone.
 */
class SavingsMethodsTest extends TestCase
{
    use RefreshDatabase;

    private function person(string $first, string $phone, int $mainKobo = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'phone' => $phone]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . substr($phone, -8)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function deposit(Wallet $main, int $naira, string $from = 'ACME LTD', string $session = null): \Illuminate\Testing\TestResponse
    {
        config(['services.matrix.webhook_secret' => 'secret']);

        return $this->withHeaders(['x-webhook-secret' => 'secret'])->postJson('/api/v1/webhooks/banking', [
            'accountNumber' => $main->virtual_account,
            'amount' => (string) $naira,
            'sessionId' => $session ?? uniqid('s', true),
            'sourceAccountName' => $from,
            'narration' => 'Salary',
        ]);
    }

    public function test_salary_share_and_round_ups_with_a_contributor_and_permissions(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 30_000_000);
        [$emeka] = $this->person('Emeka', '+2348050000318');
        Sanctum::actingAs($ngozi);

        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'savings',
            'name' => 'House rent',
            'purpose' => 'rent',
            'colour' => 'gold',
            'mode' => 'shared',
            'target_amount' => '600000',
            'target_date' => now()->addMonths(4)->toDateString(),
            'source_wallet_id' => $main->id,
            'initial_deposit' => '100000',
            'milestones' => [['title' => 'Halfway', 'amount' => '300000']],
            'members' => [[
                'user_id' => $emeka->id,
                'role' => 'contributor',
                'can_approve' => true,
                'permissions' => ['view' => true, 'fund' => true, 'request' => false, 'withdraw' => false],
            ]],
            'savings_plan' => [
                'schedule' => false,
                'salary_percent' => 15,
                'roundup_to' => '1000',
                'missed_policy' => 'retry',
                'notify_others_on_miss' => true,
                'allow_contributor_edit' => true,
            ],
            'lock' => ['mode' => 'date', 'until' => now()->addMonths(4)->toDateString(), 'early_break' => true, 'approval' => true],
        ])->assertCreated()
            ->assertJsonPath('data.wallet.colour', 'gold')
            ->assertJsonPath('data.wallet.lock.mode', 'date')
            ->assertJsonPath('data.wallet.lock.locked', true);

        $wallet = Wallet::find($res->json('data.wallet.id'));
        $this->assertSame(10_000_000, $wallet->balance);
        $rules = AutomationRule::where('to_wallet_id', $wallet->id)->get()->keyBy('trigger');
        $this->assertEqualsCanonicalizing(['salary', 'roundup'], $rules->keys()->all());
        $this->assertSame(15, $rules['salary']->percent);
        $this->assertSame(100_000, $rules['roundup']->roundup_to);

        $invite = WalletInvitation::where('wallet_id', $wallet->id)->sole();
        $this->assertTrue($invite->can_approve);
        $this->assertFalse($invite->permissions['request']);

        $this->getJson("/api/v1/wallets/{$wallet->id}/savings")
            ->assertOk()
            ->assertJsonPath('data.savings.plan.label', '15% of each salary + round-ups to ₦1,000')
            ->assertJsonPath('data.savings.plan.missed_policy', 'retry')
            ->assertJsonPath('data.savings.milestones.0.title', 'Halfway');

        // Emeka joins and his own salary share and round-ups start from his Main.
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $emeka->mainWallet()->id])->assertOk();
        $this->assertSame(2, AutomationRule::where('user_id', $emeka->id)->where('to_wallet_id', $wallet->id)->count());
    }

    public function test_salary_landing_saves_its_share_once_a_month(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 0);
        $house = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House rent', 'balance' => 0]);
        AutomationService::make()->createSalaryRule($ngozi, $main, $house, 15);

        $this->deposit($main, 450000)->assertOk();
        $this->assertSame(6_750_000, $house->refresh()->balance);
        $this->assertSame(38_250_000, $main->refresh()->balance);

        // A second big deposit the same month and a small one move nothing.
        $this->deposit($main, 200000)->assertOk();
        $this->deposit($main, 20000)->assertOk();
        $this->assertSame(6_750_000, $house->refresh()->balance);

        // Next month's salary saves again.
        Carbon::setTestNow(now()->addMonthNoOverflow());
        $this->deposit($main, 450000)->assertOk();
        $this->assertSame(13_500_000, $house->refresh()->balance);
        Carbon::setTestNow();
    }

    public function test_round_ups_build_up_from_spending_and_move_daily(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 10_000_000);
        [$tunde, $tundeMain] = $this->person('Tunde', '+2348030000444');
        $house = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House rent', 'balance' => 0]);
        $household = Wallet::create(['user_id' => $ngozi->id, 'type' => 'spending', 'name' => 'Household', 'balance' => 0]);
        $rule = AutomationService::make()->createRoundUpRule($ngozi, $main, $house, 100_000);

        Sanctum::actingAs($ngozi);
        // Paying someone ₦4,650 rounds up by ₦350.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '4650', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => $tunde->phone]])->assertOk();
        // Moving money between your own wallets isn't spending.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1234', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $household->id]])->assertOk();
        $this->assertSame(35_000, $rule->refresh()->pending_amount);

        $this->artisan('automations:run')->assertSuccessful();
        $this->assertSame(35_000, $house->refresh()->balance);
        $this->assertSame(0, $rule->refresh()->pending_amount);
        // The sweep itself doesn't round up again.
        $this->artisan('automations:run')->assertSuccessful();
        $this->assertSame(35_000, $house->refresh()->balance);
    }

    public function test_a_missed_save_retries_in_3_days_and_tells_the_co_owner(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 1_000_000);
        [$emeka] = $this->person('Emeka', '+2348050000318');
        Carbon::setTestNow(Carbon::create(2026, 11, 25, 9));
        Sanctum::actingAs($ngozi);
        $wallet = Wallet::find($this->postJson('/api/v1/wallets', [
            'type' => 'savings', 'name' => 'House rent', 'source_wallet_id' => $main->id,
            'savings_plan' => ['amount' => '50000', 'frequency' => 'monthly', 'day_of_month' => 25, 'missed_policy' => 'retry', 'notify_others_on_miss' => true],
        ])->assertCreated()->json('data.wallet.id'));
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        $rule = AutomationRule::where('to_wallet_id', $wallet->id)->sole();

        // ₦10,000 in Main, ₦50,000 due: try again on 28 Nov.
        $this->artisan('automations:run')->assertSuccessful();
        $rule->refresh();
        $this->assertSame(1, $rule->retry_count);
        $this->assertSame('2026-11-28', $rule->retry_at->toDateString());
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'savings_missed')->count());

        // Later that day nothing fires again.
        Carbon::setTestNow(Carbon::create(2026, 11, 25, 15));
        $this->artisan('automations:run')->assertSuccessful();
        $this->assertSame(1, $rule->refresh()->retry_count);

        // Salary came in; the retry saves it, once.
        $main->update(['balance' => 10_000_000]);
        Carbon::setTestNow(Carbon::create(2026, 11, 28, 10));
        $this->artisan('automations:run')->assertSuccessful();
        $this->artisan('automations:run')->assertSuccessful();
        $this->assertSame(5_000_000, $wallet->refresh()->balance);
        $this->assertNull($rule->refresh()->retry_at);
        Carbon::setTestNow();
    }

    public function test_a_missed_save_can_save_what_is_there(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 2_000_000);
        Carbon::setTestNow(Carbon::create(2026, 11, 25, 9));
        Sanctum::actingAs($ngozi);
        $wallet = Wallet::find($this->postJson('/api/v1/wallets', [
            'type' => 'savings', 'name' => 'House rent', 'source_wallet_id' => $main->id,
            'savings_plan' => ['amount' => '50000', 'frequency' => 'monthly', 'day_of_month' => 25, 'missed_policy' => 'partial'],
        ])->assertCreated()->json('data.wallet.id'));

        $this->artisan('automations:run')->assertSuccessful();
        // ₦20,000 there: ₦15,000 saved, ₦5,000 kept in Main.
        $this->assertSame(1_500_000, $wallet->refresh()->balance);
        $this->assertSame(500_000, $main->refresh()->balance);
        Carbon::setTestNow();
    }

    public function test_locks_hold_money_until_the_date_or_need_everyones_yes(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 50_000_000);
        [$emeka] = $this->person('Emeka', '+2348050000318');
        Sanctum::actingAs($ngozi);
        $until = now()->addMonths(3)->toDateString();

        $hard = Wallet::find($this->postJson('/api/v1/wallets', [
            'type' => 'savings', 'name' => 'Japa fund', 'source_wallet_id' => $main->id, 'initial_deposit' => '10000',
            'lock' => ['mode' => 'date', 'until' => $until, 'early_break' => false],
        ])->assertCreated()->json('data.wallet.id'));
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $hard->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])->assertStatus(403);

        $soft = Wallet::find($this->postJson('/api/v1/wallets', [
            'type' => 'savings', 'name' => 'House rent', 'source_wallet_id' => $main->id, 'initial_deposit' => '10000',
            'lock' => ['mode' => 'date', 'until' => $until, 'early_break' => true, 'approval' => true],
        ])->assertCreated()->json('data.wallet.id'));
        WalletMember::create(['wallet_id' => $soft->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $soft->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])->assertOk();
        $this->assertSame(1, ApprovalRequest::where('wallet_id', $soft->id)->where('status', 'pending')->count());

        // The date passes: it opens.
        Carbon::setTestNow(now()->addMonths(3)->addDay());
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $hard->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])->assertOk();
        Carbon::setTestNow();
    }

    public function test_insights_find_the_salary_and_round_ups(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 10, 27, 12));
        [$ngozi, $main] = $this->person('Ngozi', '+2348034127790', 0);
        foreach ([2, 1, 0] as $ago) {
            $at = now()->subMonthsNoOverflow($ago)->day(25);
            foreach ([[45_000_000, 'fund', 'credit', ['source_name' => 'ACME LTD']], [465_000, 'withdrawal', 'debit', ['kind' => 'bank']]] as [$amount, $type, $dir, $cp]) {
                $t = Transaction::create(['reference' => Transaction::generateReference(), 'wallet_id' => $main->id, 'user_id' => $ngozi->id, 'type' => $type, 'direction' => $dir, 'amount' => $amount, 'status' => 'successful', 'counterparty' => $cp]);
                $t->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
            }
        }

        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/savings/insights')
            ->assertOk()
            ->assertJsonPath('data.salary.amount', '450000.00')
            ->assertJsonPath('data.salary.day', 25)
            ->assertJsonPath('data.salary.from', 'ACME LTD')
            // ₦4,650 a month rounds up by ₦50 / ₦350 / ₦350.
            ->assertJsonPath('data.roundups.100', '50.00')
            ->assertJsonPath('data.roundups.1000', '350.00');
        Carbon::setTestNow();
    }
}
