<?php

namespace Tests\Feature;

use App\Models\BudgetCategory;
use App\Models\SavingsPlan;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Insights and statements (client prototype INS-01…07, STM-01/02): money in and
 * out of the wallets a person can see (moves between them don't count), where
 * it went, budget against what was spent, where each goal lands, who put in
 * what, and statements for several wallets as PDF, Excel, CSV or a zip.
 */
class InsightsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $lagos): void
    {
        Carbon::setTestNow(Carbon::parse($lagos, 'Africa/Lagos')->utc());
    }

    /**
     * The Okafors, from August to 24 October 2026: Ngozi's salary into Main,
     * School fees 2027 (Ngozi owns it, Emeka co-owns, Aunty Ada puts in), a
     * Household budget, a car deposit saved by hand.
     */
    private function family(): array
    {
        Http::fake();
        $this->at('2026-07-01 09:00');
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $ada = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Eze', 'kyc_tier' => 2]);
        $mains = [];
        foreach ([$ngozi, $emeka, $ada] as $u) {
            $mains[$u->id] = Wallet::create(['user_id' => $u->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);
        }
        $main = $mains[$ngozi->id];
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0, 'target_amount' => 850_000_00, 'target_date' => '2027-01-08']);
        foreach ([[$ngozi, 'owner'], [$emeka, 'co_owner'], [$ada, 'contributor']] as [$u, $role]) {
            WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active']);
        }
        SavingsPlan::create(['wallet_id' => $fees->id, 'amount' => 100_000_00, 'frequency' => 'monthly', 'day_of_month' => 1, 'auto_save' => true]);
        $car = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Car deposit', 'balance' => 0, 'target_amount' => 2_500_000_00, 'target_date' => '2027-06-30']);
        $home = Wallet::create(['user_id' => $ngozi->id, 'type' => 'spending', 'name' => 'Household', 'balance' => 0, 'meta' => ['budget' => ['amount' => 350_000_00, 'period' => 'monthly', 'start_day' => 1]]]);
        $cats = [];
        foreach ([['Food and market', 150_000_00], ['Fuel and transport', 70_000_00], ['Electricity and water', 40_000_00], ['Other', 90_000_00]] as $i => [$name, $limit]) {
            $cats[$name] = BudgetCategory::create(['wallet_id' => $home->id, 'name' => $name, 'limit' => $limit, 'position' => $i + 1]);
        }

        $svc = WalletService::make();
        $bank = ['kind' => 'bank', 'bank_name' => 'GTBank', 'account_number' => '0222333444', 'account_name' => 'MAMA NKECHI STORES'];
        $pay = function (Wallet $w, int $kobo, string $note, ?BudgetCategory $cat = null) use ($svc, $bank, $ngozi) {
            $t = $svc->debit($w->refresh(), $kobo, 0, 'withdrawal', $bank, $note, $ngozi->id);
            if ($cat) {
                $t->update(['budget_category_id' => $cat->id]);
            }
        };

        // August and September: salary, savings by hand into the car deposit, market money.
        foreach (['2026-08-25 10:00' => 700_000_00, '2026-09-25 10:00' => 700_000_00] as $when => $salary) {
            $this->at($when);
            $svc->credit($main->refresh(), $salary, 'fund', ['kind' => 'bank_deposit', 'source_name' => 'ACME LTD'], null, 'SALARY ACME LTD');
            $svc->transferBetweenWallets($main->refresh(), $car->refresh(), 100_000_00, $ngozi);
            $svc->transferBetweenWallets($main->refresh(), $home->refresh(), 200_000_00, $ngozi);
            $pay($home, 100_000_00, 'Mile 12 market', $cats['Food and market']);
        }
        // October.
        $this->at('2026-10-02 09:00');
        $svc->credit($main->refresh(), 780_000_00, 'fund', ['kind' => 'bank_deposit', 'source_name' => 'ACME LTD'], null, 'SALARY OCT ACME LTD');
        $svc->transferBetweenWallets($main->refresh(), $fees->refresh(), 300_000_00, $ngozi);
        $svc->transferBetweenWallets($main->refresh(), $car->refresh(), 100_000_00, $ngozi);
        $svc->transferBetweenWallets($main->refresh(), $home->refresh(), 300_000_00, $ngozi);
        $svc->credit($mains[$emeka->id]->refresh(), 500_000_00, 'fund', [], null, 'Salary');
        $svc->credit($mains[$ada->id]->refresh(), 500_000_00, 'fund', [], null, 'Gift');
        $svc->transferBetweenWallets($mains[$emeka->id]->refresh(), $fees->refresh(), 280_000_00, $emeka);
        $svc->transferBetweenWallets($mains[$ada->id]->refresh(), $fees->refresh(), 100_000_00, $ada);
        $pay($home, 118_000_00, 'Rice and oil', $cats['Food and market']);
        $pay($home, 40_000_00, 'Prepaid meter', $cats['Electricity and water']);
        $pay($home, 66_000_00, 'Fuel for the week', $cats['Fuel and transport']);
        $pay($main, 50_000_00, 'Church thanksgiving');

        $this->at('2026-10-24 12:00');

        return [$ngozi, $emeka, $ada, $main->refresh(), $fees->refresh(), $car->refresh(), $home->refresh()];
    }

    public function test_money_in_and_out_leaves_out_moves_between_your_own_wallets(): void
    {
        [$ngozi] = $this->family();
        Sanctum::actingAs($ngozi);

        // In this month: salary ₦780k + Emeka ₦280k + Aunty Ada ₦100k into School fees. Out: ₦274k of payments.
        $d = $this->getJson('/api/v1/insights?range=month')->assertOk()->json('data');
        $this->assertSame('1160000.00', $d['in']);
        $this->assertSame('274000.00', $d['out']);
        $this->assertSame('886000.00', $d['left']);
        $this->assertSame('Salaries and gifts from family', $d['in_note']);
        $this->assertCount(5, $d['bars']); // 1–7 … 29–31
        $this->assertSame('1–7', $d['bars'][0]['label']);
        $this->assertSame('1160000.00', $d['bars'][0]['in']);

        // Six months: May … October, one bar each; August had ₦700k in and ₦100k out.
        $d = $this->getJson('/api/v1/insights')->assertOk()->json('data');
        $this->assertSame(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], array_column($d['bars'], 'label'));
        $this->assertSame('700000.00', $d['bars'][3]['in']);
        $this->assertSame('100000.00', $d['bars'][3]['out']);
        $this->assertSame('2560000.00', $d['in']);
        $this->assertSame('474000.00', $d['out']);
        $this->assertSame('Household 64% used', $d['lines']['budget']);
        $this->assertSame('Food and market is up 18% since September', $d['lines']['categories']);
        $this->assertSame('1 goal is behind', $d['lines']['forecast']);
        $this->assertSame('3 people this year', $d['lines']['contributions']);
    }

    public function test_spending_by_category_with_the_change_from_last_month(): void
    {
        [$ngozi] = $this->family();
        Sanctum::actingAs($ngozi);

        $d = $this->getJson('/api/v1/insights/categories')->assertOk()->json('data');
        $this->assertSame('2026-10', $d['month']);
        $this->assertSame('October', $d['label']);
        $this->assertSame('274000.00', $d['total']);
        $this->assertSame('2026-09', $d['previous']);
        $this->assertNull($d['next']);
        $rows = collect($d['categories'])->keyBy('key');
        $this->assertSame(['food', 'transport', 'giving', 'bills'], array_column($d['categories'], 'key'));
        $this->assertSame('118000.00', $rows['food']['amount']);
        $this->assertSame(43, $rows['food']['percent']);
        $this->assertSame(18, $rows['food']['change']);
        $this->assertNull($rows['bills']['change']);

        $d = $this->getJson('/api/v1/insights/categories?month=2026-09')->assertOk()->json('data');
        $this->assertSame('100000.00', $d['total']);
        $this->assertSame('2026-10', $d['next']);
        // Before the first wallet opened there's nothing to go back to.
        $this->assertSame('2026-07', $this->getJson('/api/v1/insights/categories?month=2025-01')->json('data.month'));
    }

    public function test_budget_against_the_days_gone(): void
    {
        [$ngozi] = $this->family();
        Sanctum::actingAs($ngozi);

        $b = $this->getJson('/api/v1/insights/budget')->assertOk()->json('data.budgets.0');
        $this->assertSame('Household', $b['name']);
        $this->assertSame([24, 31], [$b['days_gone'], $b['days_total']]);
        $this->assertSame('224000.00', $b['spent']);
        $this->assertSame(64, $b['percent']);
        $this->assertSame(77, $b['time_percent']);
        $this->assertSame("77% of the month has passed, so you're slightly ahead", $b['pace']);
        $states = collect($b['categories'])->pluck('state', 'name')->all();
        $this->assertSame(['Food and market' => 'within', 'Fuel and transport' => 'close', 'Electricity and water' => 'used', 'Other' => 'within'], $states);
    }

    public function test_forecast_says_which_goals_land_and_what_closes_the_gap(): void
    {
        [$ngozi] = $this->family();
        Sanctum::actingAs($ngozi);

        $d = $this->getJson('/api/v1/insights/forecast')->assertOk()->json('data');
        $goals = collect($d['goals'])->keyBy('name');
        // School fees: ₦680k, ₦100k a month on auto-save → there by early December.
        $this->assertSame('on_track', $goals['School fees 2027']['status']);
        $this->assertSame('2026-12-15', $goals['School fees 2027']['reach_date']);
        $this->assertSame('₦850,000 by 8 Jan · Reach it 15 Dec', $goals['School fees 2027']['line']);
        // Car deposit: ₦300k, about ₦100k a month by hand → about ₦1.1m by June.
        $car = $goals['Car deposit'];
        $this->assertSame('short', $car['status']);
        $this->assertSame('101466.67', $car['per_month']);
        $this->assertStringStartsWith('₦2,500,000 by Jun 2027 · ₦1,', $car['line']);
        $this->assertSame((int) $d['short_wallet_id'], $car['wallet_id']);
        $this->assertStringStartsWith('To reach Car deposit by June 2027, save about ₦', $d['tip']);
        $this->assertStringContainsString('or move the date to', $d['tip']);
    }

    public function test_owners_see_who_put_in_what_and_contributors_only_themselves(): void
    {
        [$ngozi, $emeka, $ada] = $this->family();

        Sanctum::actingAs($ngozi);
        $d = $this->getJson('/api/v1/insights/contributions')->assertOk()->json('data');
        $this->assertTrue($d['owner_view']);
        $this->assertSame('680000.00', $d['total']);
        $this->assertSame(['You', 'Emeka', 'Ada'], array_column($d['people'], 'name'));
        $this->assertSame(['300000.00', '280000.00', '100000.00'], array_column($d['people'], 'amount'));
        $this->assertSame('School fees 2027', $d['people'][1]['note']);

        Sanctum::actingAs($ada);
        $d = $this->getJson('/api/v1/insights/contributions')->assertOk()->json('data');
        $this->assertFalse($d['owner_view']);
        $this->assertSame(['You'], array_column($d['people'], 'name'));
        $this->assertSame('100000.00', $d['total']);
    }

    public function test_wallet_report_and_who_may_see_it(): void
    {
        [$ngozi, $emeka, $ada, $main, $fees] = $this->family();
        Sanctum::actingAs($ngozi);

        $d = $this->getJson("/api/v1/insights/wallets/{$fees->id}")->assertOk()->json('data');
        $this->assertSame('680000.00', $d['balance']);
        $this->assertSame('680000.00', $d['put_in']);
        $this->assertSame('July', $d['since_label']);
        $this->assertSame(['name' => 'Ngozi', 'percent' => 44], $d['biggest_contributor']);
        $this->assertSame('Goal ₦850,000 by 8 Jan 2027', $d['balance_note']);

        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);
        $this->getJson("/api/v1/insights/wallets/{$fees->id}")->assertNotFound();
    }

    public function test_statements_for_several_wallets_one_by_one_combined_or_zipped(): void
    {
        [$ngozi, $emeka, $ada, $main, $fees, $car, $home] = $this->family();
        Mail::fake();
        Sanctum::actingAs($ngozi);

        $this->getJson('/api/v1/statements')->assertOk()
            ->assertJsonPath('data.wallets.0.name', 'Main wallet')
            ->assertJsonCount(4, 'data.wallets');
        $months = $this->getJson("/api/v1/statements/months?wallet={$main->id}")->assertOk()->json('data.months');
        $this->assertSame(['October 2026', 'September 2026', 'August 2026', 'July 2026'], array_column($months, 'label'));
        $this->assertTrue($months[0]['in_progress']);
        $this->assertSame('2026-11-01', $months[0]['ready_on']);
        $this->assertSame(5, $months[0]['count']);

        // STM-02: each wallet's own dates; a wallet opened in July starts then.
        $body = ['wallet_ids' => [$main->id, $fees->id, $home->id], 'period' => 'this_year', 'combined' => false];
        $files = $this->postJson('/api/v1/statements/batch', $body)->assertOk()->json('data.files');
        $this->assertSame(['Main wallet', 'School fees 2027', 'Household'], array_column($files, 'name'));
        $this->assertSame('1 Jul to 24 Oct 2026', $files[1]['label']);
        $this->assertSame(3, $files[1]['count']);
        $this->assertSame('All 3 wallets', $this->postJson('/api/v1/statements/batch', ['combined' => true] + $body)->json('data.files.0.name'));

        // One file, the zip of all, and the combined file in each format.
        $url = $this->postJson('/api/v1/statements/batch/link', $body + ['format' => 'pdf', 'wallet_id' => $fees->id])->json('data.url');
        $this->assertStringContainsString('/api/v1/statement-files?', $url); // on the live server only /api reaches Laravel
        $this->assertStringStartsWith('%PDF-1.4', $this->get($url)->assertOk()->getContent());
        $zip = $this->get($this->postJson('/api/v1/statements/batch/link', $body + ['format' => 'csv'])->json('data.url'))
            ->assertOk()->assertHeader('Content-Type', 'application/zip')->getContent();
        $this->assertStringStartsWith("PK\x03\x04", $zip);
        $this->assertStringContainsString('school-fees-2027-statement-20260701-20261024.csv', $zip);
        $xlsx = $this->get($this->postJson('/api/v1/statements/batch/link', ['combined' => true, 'format' => 'xlsx'] + $body)->json('data.url'))
            ->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')->getContent();
        $this->assertStringContainsString('xl/worksheets/sheet4.xml', $xlsx);
        $csvUrl = $this->postJson('/api/v1/statements/batch/link', ['combined' => true, 'format' => 'csv'] + $body)->json('data.url');
        $csv = $this->get($csvUrl)->assertOk()->getContent();
        $this->assertStringContainsString('"School fees 2027","1 Jul to 24 Oct 2026",0.00,"680,000.00",0.00,"680,000.00",3', $csv);
        // A move with no note says where it went.
        $this->assertStringContainsString('"To School fees 2027"', $csv);
        // A changed link is refused.
        $this->get(str_replace('format=csv', 'format=pdf', $csvUrl))->assertForbidden();

        $this->postJson('/api/v1/statements/batch/email', ['combined' => true, 'format' => 'pdf'] + $body)->assertOk()
            ->assertJsonPath('data.sent_to', $ngozi->email);

        // Someone else's wallet can't be put in.
        $emekaMain = Wallet::where('user_id', $emeka->id)->where('type', 'main')->first();
        $this->postJson('/api/v1/statements/batch', ['wallet_ids' => [$main->id, $emekaMain->id], 'period' => 'this_year'])->assertStatus(422);
        $this->postJson('/api/v1/statements/batch', ['wallet_ids' => [$main->id], 'period' => 'custom', 'from' => '2026-10-10', 'to' => '2026-10-01'])->assertStatus(422);
    }
}
