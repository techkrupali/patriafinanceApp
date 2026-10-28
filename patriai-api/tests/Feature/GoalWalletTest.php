<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\Organisation;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Goal wallet from the client prototype (GLW-01…05): what it covers, a plan
 * with each person's own amount and a one-off gift, reminders before each save,
 * a contribution link, a lock until the goal or a date, paying the school
 * directly, and everyone getting their money back if it's cancelled.
 */
class GoalWalletTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{account: string, amount: string}> */
    private array $payouts = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://patriai.test', 'services.matrix.webhook_secret' => 'secret']);
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/banktransfer-payout')) {
                $this->payouts[] = ['account' => $request['destination_account'], 'amount' => $request['amount']];
            }

            return Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]);
        });
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
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function schoolFees(array $overrides = []): array
    {
        [$ngozi, $main] = $this->person('Ngozi', 100_000_000);
        [$emeka, $emekaMain] = $this->person('Emeka', 50_000_000);
        [$ada] = $this->person('Ada');
        $school = Organisation::create(['name' => 'Greenfield School Ltd', 'kind' => 'school', 'account_name' => 'GREENFIELD SCHOOL LTD', 'account_number' => '0055667788', 'bank_code' => '058', 'bank_name' => 'GTBank', 'verified' => true]);
        Sanctum::actingAs($ngozi);
        $res = $this->postJson('/api/v1/wallets', array_replace_recursive([
            'type' => 'goal',
            'name' => 'School fees 2027',
            'purpose' => 'school_fees',
            'mode' => 'shared',
            'target_amount' => '850000',
            'target_date' => '2027-01-08',
            'source_wallet_id' => $main->id,
            'goal' => [
                'kind' => 'school_fees',
                'for' => 'Tolu and Kamsi, second term',
                'lines' => [['name' => 'Tolu · JSS3 fees', 'amount' => '420000'], ['name' => 'Kamsi · Primary 5 fees', 'amount' => '330000'], ['name' => 'Books and uniforms', 'amount' => '100000']],
                'link' => true,
                'reminders' => ['before_save' => true, 'nudge' => true],
                'payout' => ['organisation_id' => $school->id, 'run_on' => '2027-01-06'],
            ],
            'savings_plan' => ['schedule' => true, 'amount' => '120000', 'frequency' => 'monthly', 'day_of_month' => 26, 'auto_save' => true, 'allow_contributor_edit' => true],
            'members' => [
                ['user_id' => $emeka->id, 'role' => 'co_owner', 'pledge' => '120000', 'pledge_kind' => 'period'],
                ['user_id' => $ada->id, 'role' => 'contributor', 'pledge' => '150000', 'pledge_kind' => 'gift'],
            ],
            'lock' => ['mode' => 'target', 'until' => '2027-01-05', 'early_break' => true, 'approval' => true],
        ], $overrides))->assertCreated()
            ->assertJsonPath('data.wallet.goal.kind', 'school_fees')
            ->assertJsonPath('data.wallet.goal.link', 'https://patriai.test/g/okafor-fees')
            ->assertJsonPath('data.wallet.goal.payout.to', 'Greenfield School Ltd')
            ->assertJsonPath('data.wallet.goal.lines.2.amount', '100000.00');

        return [Wallet::find($res->json('data.wallet.id')), $ngozi, $main, $emeka, $emekaMain, $ada];
    }

    public function test_each_person_gets_their_own_amount_and_a_gift_is_just_asked_for(): void
    {
        [$wallet, $ngozi, $main, $emeka, $emekaMain, $ada] = $this->schoolFees();
        $this->assertSame(12_000_000, AutomationRule::where('user_id', $ngozi->id)->where('to_wallet_id', $wallet->id)->sole()->amount);

        $this->assertStringContainsString('asked you to put in ₦120,000', AppNotification::where('user_id', $emeka->id)->where('type', 'invitation_received')->sole()->body);
        $this->assertStringContainsString('asked for a ₦150,000 gift', AppNotification::where('user_id', $ada->id)->where('type', 'invitation_received')->sole()->body);

        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept', ['source_wallet_id' => $emekaMain->id])->assertOk();
        $this->assertSame(12_000_000, AutomationRule::where('user_id', $emeka->id)->where('to_wallet_id', $wallet->id)->sole()->amount);

        $adaMain = $ada->mainWallet();
        Sanctum::actingAs($ada);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $ada->id)->sole()->id . '/accept', ['source_wallet_id' => $adaMain->id])->assertOk();
        $this->assertSame(0, AutomationRule::where('user_id', $ada->id)->count());

        // Two days before the 26th, both savers hear.
        Carbon::setTestNow(Carbon::parse('2026-11-24 09:00:00'));
        $this->artisan('goals:remind')->assertSuccessful();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'savings_reminder')->count());
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'savings_reminder')->count());
    }

    public function test_the_contribution_link_shows_the_goal_and_where_to_pay(): void
    {
        [$wallet] = $this->schoolFees();
        $wallet->update(['virtual_account' => '9012345678', 'virtual_account_bank' => 'Assetmatrix MFB']);

        $this->get('/g/okafor-fees')->assertOk()
            ->assertSee('School fees 2027')
            ->assertSee('Tolu and Kamsi, second term')
            ->assertSee('9012345678')
            ->assertSee('Books and uniforms');
        $this->get('/g/nobody')->assertNotFound();
    }

    public function test_locked_until_the_goal_or_the_date_whichever_comes_first(): void
    {
        [$wallet] = $this->schoolFees();
        $this->assertTrue($wallet->refresh()->isGoalLocked());
        Carbon::setTestNow(Carbon::parse('2027-01-05 08:00:00'));
        $this->assertFalse($wallet->refresh()->isGoalLocked());
    }

    public function test_it_pays_the_school_directly_on_the_day(): void
    {
        [$wallet, $ngozi] = $this->schoolFees();

        // Short on the day: the owner hears, nothing goes.
        $wallet->update(['balance' => 50_000_000]);
        Carbon::setTestNow(Carbon::parse('2027-01-06 06:30:00', 'UTC')); // 7:30 am in Lagos
        $this->artisan('goals:pay')->assertSuccessful();
        $this->assertSame([], $this->payouts);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'goal_payout_short')->count());

        $wallet->update(['balance' => 86_000_000]);
        Carbon::setTestNow(Carbon::parse('2027-01-07 06:30:00', 'UTC'));
        $this->artisan('goals:pay')->assertSuccessful();
        $this->assertSame([['account' => '0055667788', 'amount' => '850000.00']], $this->payouts);
        $this->assertNotNull($wallet->refresh()->meta['goal']['payout']['paid_at']);
        // Once.
        $this->artisan('goals:pay')->assertSuccessful();
        $this->assertCount(1, $this->payouts);
    }

    public function test_cancelled_everyone_gets_back_what_they_put_in(): void
    {
        [$wallet, $ngozi, $main, $emeka, $emekaMain] = $this->schoolFees(['initial_deposit' => '100000']);
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept', ['source_wallet_id' => $emekaMain->id])->assertOk();
        Carbon::setTestNow(Carbon::parse('2026-11-26 09:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(10_000_000 + 12_000_000 + 12_000_000, $wallet->refresh()->balance);
        // Uncle Obi pays through the link (a bank transfer).
        $wallet->update(['virtual_account' => '9012345678']);
        $this->withHeaders(['x-webhook-secret' => 'secret'])->postJson('/api/v1/webhooks/banking', ['accountNumber' => '9012345678', 'amount' => '20000', 'sessionId' => 'obi-1', 'sourceAccountName' => 'OBI OKAFOR'])->assertOk();

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/goal/cancel", ['pin' => '1234'])->assertNotFound();
        Sanctum::actingAs($ngozi);
        $before = $main->refresh()->balance;
        $this->postJson("/api/v1/wallets/{$wallet->id}/goal/cancel", ['pin' => '1234'])->assertOk()->assertJsonPath('data.wallet.status', 'closed');

        $this->assertSame(50_000_000 - 12_000_000 + 12_000_000, $emekaMain->refresh()->balance);
        // Ngozi: her ₦220,000 back, plus the ₦20,000 that came by bank.
        $this->assertSame($before + 22_000_000 + 2_000_000, $main->refresh()->balance);
        $this->assertSame(0, $wallet->refresh()->balance);
        $this->assertSame(0, AutomationRule::where('to_wallet_id', $wallet->id)->where('enabled', true)->count());
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'goal_cancelled')->count());
    }
}
