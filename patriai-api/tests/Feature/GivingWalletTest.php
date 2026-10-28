<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\GivingPayment;
use App\Models\GivingSchedule;
use App\Models\Organisation;
use App\Models\SavedAccount;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\GivingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Giving wallet from the client prototype (GIV-01…07, WAL-18): money set aside
 * first — client: "fixed deposits and percentage of deposits from 1 or more
 * wallets" — then paid to saved accounts on giving dates at 7:00 am, a group
 * split evenly, a pledge in parts from Main, payments that wait for a yes,
 * receipts, anonymous giving and the yearly statement.
 */
class GivingWalletTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{account: string, amount: string, description: string}> */
    private array $payouts = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.matrix.webhook_secret' => 'secret']);
        Http::fake(function ($request) {
            $url = $request->url();
            if (str_contains($url, '/users/login')) {
                return Http::response(['status' => true, 'data' => ['token' => 't']]);
            }
            if (str_contains($url, '/verify-bank-account')) {
                return Http::response(['status' => true, 'data' => ['first_name' => 'LITTLE SAINTS', 'last_name' => 'ORPHANAGE', 'bank_name' => 'Zenith Bank']]);
            }
            if (str_contains($url, '/banktransfer-payout')) {
                $this->payouts[] = ['account' => $request['destination_account'], 'amount' => $request['amount'], 'description' => $request['description']];

                return Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]);
            }

            return Http::response(['status' => true, 'data' => []]);
        });
        // Wednesday 28 October 2026, 10:00 in Lagos.
        Carbon::setTestNow(Carbon::parse('2026-10-28 09:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0, string $account = '8034127790'): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => $account]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function org(string $name, string $number, string $kind = 'church'): Organisation
    {
        return Organisation::create(['name' => $name, 'kind' => $kind, 'area' => 'Ikeja', 'state' => 'Lagos', 'account_name' => strtoupper($name), 'account_number' => $number, 'bank_code' => '058', 'bank_name' => 'GTBank', 'verified' => true]);
    }

    private function deposit(Wallet $wallet, int $naira): void
    {
        $this->withHeaders(['x-webhook-secret' => 'secret'])->postJson('/api/v1/webhooks/banking', [
            'accountNumber' => $wallet->virtual_account,
            'amount' => (string) $naira,
            'sessionId' => uniqid('s', true),
            'sourceAccountName' => 'ACME LTD',
            'narration' => 'Salary',
        ])->assertOk();
    }

    /** Saved accounts: two verified churches in a group, and Little Saints checked with the bank. */
    private function recipients(User $ngozi): array
    {
        $grace = $this->org('Grace Parish Church', '0011223344');
        $stJude = $this->org("St Jude's Church", '0099887766');
        Sanctum::actingAs($ngozi);
        $a = $this->postJson('/api/v1/saved-accounts', ['organisation_id' => $grace->id, 'group' => 'Our churches'])->assertCreated()->json('data.account.id');
        $this->postJson('/api/v1/saved-accounts', ['organisation_id' => $stJude->id, 'group' => 'Our churches'])->assertCreated();
        $saints = $this->postJson('/api/v1/saved-accounts', ['account_number' => '0049116612', 'bank_code' => '057', 'nickname' => 'Little Saints Orphanage', 'category' => 'institutions'])
            ->assertCreated()
            ->assertJsonPath('data.account.account_name', 'LITTLE SAINTS ORPHANAGE')
            ->assertJsonPath('data.account.verified', false)
            ->json('data.account.id');
        $groups = $this->getJson('/api/v1/saved-accounts')->assertOk()
            ->assertJsonPath('data.groups.0.name', 'Our churches')
            ->assertJsonCount(2, 'data.groups.0.accounts')
            ->json('data.groups');

        return ['grace' => $a, 'group' => $groups[0]['id'], 'saints' => $saints];
    }

    private function giving(User $ngozi, Wallet $main, array $r, array $overrides = [], array $extra = []): Wallet
    {
        [$business] = [Wallet::create(['user_id' => $ngozi->id, 'type' => 'shared', 'name' => 'Shop takings', 'balance' => 0, 'virtual_account' => '8034127791'])];
        WalletMember::create(['wallet_id' => $business->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        Sanctum::actingAs($ngozi);
        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'giving',
            'name' => 'Tithes and offerings',
            'purpose' => 'tithes',
            'giving' => array_replace([
                'kind' => 'tithes',
                'source_wallet_id' => $main->id,
                'recipients' => [['group_id' => $r['group']], ['saved_account_id' => $r['saints']]],
                // Client: a percentage of deposits from more than one wallet, and a fixed amount.
                'set_aside' => [
                    ['kind' => 'percent', 'source_wallet_id' => $main->id, 'percent' => 10],
                    ['kind' => 'percent', 'source_wallet_id' => $business->id, 'percent' => 5],
                    ['kind' => 'fixed', 'source_wallet_id' => $main->id, 'amount' => '20000', 'day_of_month' => 25],
                ],
                'schedules' => [
                    ['label' => 'Tithe', 'amount' => '45000', 'group_id' => $r['group'], 'frequency' => 'monthly_weekday', 'day_of_week' => 7, 'week_of_month' => 1],
                    ['label' => 'Sunday offering', 'amount' => '2000', 'saved_account_id' => $r['grace'], 'frequency' => 'weekly', 'day_of_week' => 7],
                    ['label' => 'Monthly gift', 'amount' => '10000', 'saved_account_id' => $r['saints'], 'frequency' => 'monthly', 'day_of_month' => 15],
                ],
                'ask_first' => false,
                'thanksgiving_reminder' => true,
                'receipts' => true,
                'yearly_statement' => true,
                'anonymous' => false,
                'pledge' => [
                    'name' => 'Church building fund', 'total' => '500000', 'paid_before' => '200000', 'due_date' => '2026-12-31',
                    'group_id' => $r['group'],
                    'parts' => [['date' => '2026-11-25', 'amount' => '150000'], ['date' => '2026-12-25', 'amount' => '150000']],
                ],
            ], $overrides),
        ] + $extra)->assertCreated();

        return Wallet::find($res->json('data.wallet.id'));
    }

    public function test_set_aside_from_more_than_one_wallet_as_a_share_of_deposits_and_a_fixed_amount(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        $wallet = $this->giving($ngozi, $main, $this->recipients($ngozi));
        $business = Wallet::where('name', 'Shop takings')->sole();

        $rules = AutomationRule::where('to_wallet_id', $wallet->id)->get();
        $this->assertSame(['deposit', 'deposit', 'schedule'], $rules->pluck('trigger')->sort()->values()->all());
        $this->assertSame(2_000_000, $rules->firstWhere('trigger', 'schedule')->amount);

        // ₦450,000 lands in Main: 10% set aside at once. ₦100,000 into the shop: 5%.
        $this->deposit($main, 450_000);
        $this->assertSame(4_500_000, $wallet->refresh()->balance);
        $this->deposit($business, 100_000);
        $this->assertSame(5_000_000, $wallet->refresh()->balance);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('title', 'Set aside ₦5000.00 into Tithes and offerings')->count());

        // The fixed ₦20,000 on the 25th.
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00', 'UTC'));
        $this->artisan('automations:run')->assertSuccessful();
        $this->assertSame(7_000_000, $wallet->refresh()->balance);
    }

    public function test_giving_dates_pay_at_seven_with_a_group_split_and_main_covering_a_shortfall(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        $wallet = $this->giving($ngozi, $main, $this->recipients($ngozi));

        // Sunday 1 November, 6:30 am in Lagos: too early.
        Carbon::setTestNow(Carbon::parse('2026-11-01 05:30:00', 'UTC'));
        $this->artisan('giving:run')->assertSuccessful();
        $this->assertSame([], $this->payouts);

        // 7:00 am: first Sunday — tithe split between the churches, and the Sunday offering.
        Carbon::setTestNow(Carbon::parse('2026-11-01 06:00:00', 'UTC'));
        $this->artisan('giving:run')->assertSuccessful();
        $this->assertEqualsCanonicalizing(['0011223344', '0099887766', '0011223344'], array_column($this->payouts, 'account'));
        $this->assertEqualsCanonicalizing(['22500.00', '22500.00', '2000.00'], array_column($this->payouts, 'amount'));
        $this->assertStringContainsString('from Ngozi Okafor', $this->payouts[0]['description']);
        // Nothing was set aside, so Main covered it (amounts plus bank fees).
        $paid = GivingPayment::where('status', 'paid')->get();
        $this->assertCount(3, $paid);
        $this->assertStringContainsString('came from Main wallet', $paid->first()->note);
        $this->assertSame(0, $wallet->refresh()->balance);
        $this->assertSame(30_000_000 - 4_700_000 - 3 * 2_000, $main->refresh()->balance);
        $this->assertSame(3, AppNotification::where('user_id', $ngozi->id)->where('type', 'giving_receipt')->count());

        // Once per date.
        $this->artisan('giving:run')->assertSuccessful();
        $this->assertCount(3, $this->payouts);
    }

    public function test_ask_me_first_waits_for_a_yes_and_anonymous_hides_the_name(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        $wallet = $this->giving($ngozi, $main, $this->recipients($ngozi), ['ask_first' => true, 'anonymous' => true, 'pledge' => null]);

        Carbon::setTestNow(Carbon::parse('2026-11-08 07:00:00', 'UTC')); // second Sunday: just the offering
        $this->artisan('giving:run')->assertSuccessful();
        $this->assertSame([], $this->payouts);
        $waiting = GivingPayment::where('status', 'awaiting')->sole();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'giving_confirm')->count());

        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/wallets/{$wallet->id}/giving")->assertOk()->assertJsonPath('data.giving.awaiting.0.label', 'Sunday offering');
        $this->postJson("/api/v1/giving-payments/{$waiting->id}/confirm")->assertOk()->assertJsonPath('message', 'Sent');
        $this->assertSame('Sunday offering from Patriai member', $this->payouts[0]['description']);

        // Someone else can't send Ngozi's giving.
        [$emeka] = $this->person('Emeka', 0, '8050000318');
        Carbon::setTestNow(Carbon::parse('2026-11-15 07:00:00', 'UTC'));
        $this->artisan('giving:run')->assertSuccessful();
        $next = GivingPayment::where('status', 'awaiting')->first();
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/giving-payments/{$next->id}/skip")->assertStatus(422);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/giving-payments/{$next->id}/skip")->assertOk();
        $this->assertSame('skipped', $next->refresh()->status);
    }

    public function test_a_pledge_is_paid_in_parts_from_main(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 60_000_000);
        $wallet = $this->giving($ngozi, $main, $this->recipients($ngozi), ['schedules' => []]);
        $this->assertSame(2, GivingSchedule::whereNotNull('pledge_id')->count());

        Carbon::setTestNow(Carbon::parse('2026-11-25 07:00:00', 'UTC'));
        $this->artisan('giving:run')->assertSuccessful();
        $this->assertEqualsCanonicalizing(['75000.00', '75000.00'], array_column($this->payouts, 'amount'));
        // From Main, not from what was set aside.
        $this->assertSame(0, $wallet->refresh()->balance);
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/wallets/{$wallet->id}/giving")->assertOk()
            ->assertJsonPath('data.giving.pledge.paid', '350000.00')
            ->assertJsonPath('data.giving.pledge.total', '500000.00')
            ->assertJsonPath('data.giving.coming_up.0.label', 'Pledge part 2');

        // The parts must add up to what's left.
        $this->postJson('/api/v1/wallets', [
            'type' => 'giving', 'name' => 'Bad pledge',
            'giving' => ['pledge' => ['name' => 'Fund', 'total' => '500000', 'paid_before' => '0', 'due_date' => '2026-12-31', 'saved_account_id' => SavedAccount::first()->id, 'parts' => [['date' => '2026-11-25', 'amount' => '100']]]],
        ])->assertStatus(422);
    }

    public function test_the_giving_view_statement_reminder_and_who_can_see_it(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        [$emeka] = $this->person('Emeka', 0, '8050000318');
        $wallet = $this->giving($ngozi, $main, $this->recipients($ngozi), [], ['members' => [['user_id' => $emeka->id, 'role' => 'viewer']]]);
        $this->assertSame('viewer', WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->role);

        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/wallets/{$wallet->id}/giving")->assertOk()
            ->assertJsonPath('data.giving.coming_up.0.label', 'Tithe')
            ->assertJsonPath('data.giving.coming_up.0.date', '2026-11-01')
            ->assertJsonPath('data.giving.coming_up.0.to', 'Our churches')
            ->assertJsonPath('data.giving.coming_up.0.when', 'First Sunday')
            ->assertJsonPath('data.giving.recipients.0.name', 'Our churches')
            ->assertJsonPath('data.giving.recipients.1.name', 'Little Saints Orphanage')
            ->assertJsonPath('data.giving.settings.anonymous', false);

        // A one-off for a thanksgiving Sunday.
        $this->postJson("/api/v1/wallets/{$wallet->id}/giving/schedules", ['label' => 'Thanksgiving', 'amount' => '15000', 'saved_account_id' => SavedAccount::where('nickname', 'Grace Parish Church')->value('id'), 'frequency' => 'once', 'run_on' => '2026-11-08'])
            ->assertCreated();
        $this->assertSame(1, GivingService::make()->remindThanksgiving());

        Carbon::setTestNow(Carbon::parse('2026-11-08 07:00:00', 'UTC'));
        $this->artisan('giving:run')->assertSuccessful();
        $this->artisan('giving:statements', ['year' => 2026])->assertSuccessful();
        $statement = AppNotification::where('user_id', $ngozi->id)->where('type', 'giving_statement')->sole();
        $this->assertStringContainsString('₦17,000 given', $statement->body);
    }
}
