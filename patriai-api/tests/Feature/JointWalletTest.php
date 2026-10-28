<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
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
 * Joint wallet from the client prototype (JNT-01…05): it waits for the partner
 * to accept with their PIN, both shares go in on the 26th, each spends alone up
 * to the limits (above them, to a new account or a personal wallet, the other
 * says yes), both hear about every payment, rule changes need both, and closing
 * splits the money the way they agreed.
 */
class JointWalletTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{account: string, amount: string}> */
    private array $payouts = [];

    protected function setUp(): void
    {
        parent::setUp();
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

    private function person(string $first, int $mainKobo = 0, int $tier = 3): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => $tier, 'phone' => '+23480' . random_int(10000000, 99999999)]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function payload(int $partnerId, int $mainId, array $overrides = []): array
    {
        return array_replace_recursive([
            'type' => 'joint',
            'name' => 'Ngozi and Emeka',
            'mode' => 'shared',
            'source_wallet_id' => $mainId,
            'members' => [['user_id' => $partnerId, 'role' => 'co_owner', 'pledge' => '150000', 'pledge_kind' => 'period']],
            'joint' => [
                'contribution' => ['mode' => 'equal', 'day' => 26, 'mine' => '150000', 'partner' => '150000'],
                'short' => 'retry',
                'limits' => ['per_payment' => '50000', 'per_day' => '100000'],
                'expiry_hours' => 24,
                'always' => ['new_account' => true, 'personal' => true, 'rules' => true],
                'notify' => ['weekly' => true, 'statement' => true, 'big_payment' => true, 'big_amount' => '100000'],
                'leave' => ['split' => 'contributed', 'notice_days' => 30],
            ],
        ], $overrides);
    }

    /** Created, accepted with Emeka's PIN, both shares in on 26 Nov. */
    private function openJoint(array $overrides = [], int $ngoziMain = 100_000_000, int $emekaMain = 100_000_000): array
    {
        [$ngozi, $main] = $this->person('Ngozi', $ngoziMain);
        [$emeka, $emekaMainWallet] = $this->person('Emeka', $emekaMain);
        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/wallets', $this->payload($emeka->id, $main->id, $overrides))->assertCreated()
            ->assertJsonPath('data.wallet.joint.state', 'waiting')
            ->json('data.wallet.id');
        $wallet = Wallet::find($id);

        Sanctum::actingAs($emeka);
        $invite = WalletInvitation::where('invitee_user_id', $emeka->id)->sole();
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['pin' => '1234'])->assertOk();

        return [$wallet->refresh(), $ngozi, $main, $emeka, $emekaMainWallet];
    }

    public function test_it_waits_for_the_partner_to_accept_with_their_pin(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 100_000_000);
        [$emeka] = $this->person('Emeka', 50_000_000);
        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/wallets', $this->payload($emeka->id, $main->id))->assertCreated()
            ->assertJsonPath('data.wallet.joint.state', 'waiting')
            ->assertJsonPath('data.wallet.joint.limits.per_payment', '50000.00')
            ->json('data.wallet.id');
        $wallet = Wallet::find($id);

        // "Account number · Ready when Emeka accepts"; Ngozi's share waits too.
        $this->assertNull($wallet->virtual_account);
        $this->getJson("/api/v1/wallets/{$id}/funding-details")->assertStatus(422);
        $this->assertFalse(AutomationRule::where('user_id', $ngozi->id)->where('to_wallet_id', $id)->sole()->enabled);

        Sanctum::actingAs($emeka);
        $invite = WalletInvitation::where('invitee_user_id', $emeka->id)->sole();
        $this->getJson('/api/v1/invitations')->assertOk()->assertJsonPath('data.invitations.0.joint.contribution.partner', '150000.00');
        $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertStatus(422);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['pin' => '9999'])->assertStatus(422);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['pin' => '1234'])->assertOk()
            ->assertJsonPath('data.wallet.joint.state', 'open');

        $wallet->refresh();
        $this->assertNotNull($wallet->virtual_account);
        $this->assertTrue(AutomationRule::where('user_id', $ngozi->id)->where('to_wallet_id', $id)->sole()->enabled);
        $rule = AutomationRule::where('user_id', $emeka->id)->where('to_wallet_id', $id)->sole();
        $this->assertSame([15_000_000, 26], [$rule->amount, $rule->day_of_month]);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'joint_open')->count());

        Carbon::setTestNow(Carbon::parse('2026-11-26 09:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(30_000_000, $wallet->refresh()->balance);
    }

    public function test_both_must_be_verified(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 100_000_000, tier: 0);
        [$emeka] = $this->person('Emeka');
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/wallets', $this->payload($emeka->id, $main->id))->assertStatus(422);

        // Only one partner, as a co-owner.
        [$ada] = $this->person('Ada');
        $ngozi->update(['kyc_tier' => 3]);
        $this->postJson('/api/v1/wallets', $this->payload($emeka->id, $main->id, ['members' => [1 => ['user_id' => $ada->id, 'role' => 'co_owner']]]))->assertStatus(422);
    }

    public function test_each_spends_alone_up_to_the_limits_and_the_other_approves_above(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->openJoint();
        $wallet->update(['balance' => 50_000_000]);
        $bank = ['bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'MAMA PUT', 'bank_name' => 'GTBank', 'pin' => '1234'];

        // A new account: Emeka says yes first.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '40000'] + $bank)->assertOk()->assertJsonPath('data.pending_approval', true);
        $request = ApprovalRequest::sole();
        $this->assertSame('a new account', $request->payload['over_limit']);
        $this->assertSame(24, (int) round(now()->diffInHours($request->expires_at)));
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$request->id}/respond", ['decision' => 'approve'])->assertOk();
        $this->assertCount(1, $this->payouts);
        // Every payment notifies both of you.
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'joint_payment')->count());
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'joint_payment')->count());

        // The same account again, within the limits: alone.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '45000'] + $bank)->assertOk()->assertJsonMissingPath('data.pending_approval');
        $this->assertCount(2, $this->payouts);
        // Over ₦100,000 alone today.
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '20000'] + $bank)->assertOk()->assertJsonPath('data.pending_approval', true);
        $this->assertSame('over ₦100,000 alone today', ApprovalRequest::latest('id')->first()->payload['over_limit']);
        // Over ₦50,000 a payment (Emeka hasn't spent today).
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '60000'] + $bank)->assertOk()->assertJsonPath('data.pending_approval', true);
        $this->assertSame('over ₦50,000 a payment', ApprovalRequest::latest('id')->first()->payload['over_limit']);
        // Moving money out to a personal wallet.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $wallet->id, 'amount' => '1000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $emeka->mainWallet()->id]])
            ->assertOk()->assertJsonPath('data.pending_approval', true);
        $this->assertSame('money out to a personal wallet', ApprovalRequest::latest('id')->first()->payload['over_limit']);
    }

    public function test_a_big_payment_alerts_both(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->openJoint(['joint' => ['limits' => ['per_payment' => '200000', 'per_day' => '300000'], 'always' => ['new_account' => false]]]);
        $wallet->update(['balance' => 50_000_000]);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '150000', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'LANDLORD', 'bank_name' => 'GTBank', 'pin' => '1234'])->assertOk();
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'joint_big_payment')->count());
    }

    public function test_if_one_is_short_both_hear_and_it_tries_again_in_two_days(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->openJoint(emekaMain: 1_000_000);
        Carbon::setTestNow(Carbon::parse('2026-11-26 09:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(15_000_000, $wallet->refresh()->balance);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'share_missed')->count());
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'share_missed')->count());

        $emeka->mainWallet()->update(['balance' => 20_000_000]);
        Carbon::setTestNow(Carbon::parse('2026-11-28 10:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(30_000_000, $wallet->refresh()->balance);
    }

    public function test_changing_the_rules_needs_both(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->openJoint();
        Sanctum::actingAs($ngozi);
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_enabled' => false])->assertStatus(422);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/changes", ['pin' => '1234', 'changes' => ['per_payment' => '80000']])->assertOk()->assertJsonPath('data.applied', false);
        $this->assertSame(5_000_000, $wallet->refresh()->meta['joint']['limits']['per_payment']);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/changes/answer", ['pin' => '1234', 'agree' => true])->assertStatus(422);

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/changes/answer", ['pin' => '1234', 'agree' => true])->assertOk()
            ->assertJsonPath('data.wallet.joint.limits.per_payment', '80000.00');
        // Including who changed it.
        $this->assertStringContainsString('Emeka agreed', AppNotification::where('user_id', $ngozi->id)->where('type', 'joint_rule_change')->latest('id')->first()->title);
    }

    public function test_closing_needs_both_pins_and_splits_by_what_each_put_in(): void
    {
        [$wallet, $ngozi, $main, $emeka, $emekaMain] = $this->openJoint([
            'members' => [['pledge' => '100000']],
            'joint' => ['contribution' => ['mode' => 'fixed', 'mine' => '200000', 'partner' => '100000']],
        ]);
        Carbon::setTestNow(Carbon::parse('2026-11-26 09:00:00'));
        AutomationService::make()->runDue();
        $this->assertSame(30_000_000, $wallet->refresh()->balance);

        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/close", ['pin' => '1234'])->assertOk()->assertJsonPath('data.closed', false);
        // Nothing leaves while it's closing.
        $this->postJson("/api/v1/wallets/{$wallet->id}/withdraw", ['amount' => '1000', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'X', 'bank_name' => 'GTBank', 'pin' => '1234'])->assertStatus(422);
        // Asking twice doesn't close it.
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/close", ['pin' => '1234'])->assertOk()->assertJsonPath('data.closed', false);

        $ngoziBefore = $main->refresh()->balance;
        $emekaBefore = $emekaMain->refresh()->balance;
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/close", ['pin' => '1234'])->assertOk()->assertJsonPath('data.closed', true);
        $this->assertSame($ngoziBefore + 20_000_000, $main->refresh()->balance);
        $this->assertSame($emekaBefore + 10_000_000, $emekaMain->refresh()->balance);
        $this->assertSame('closed', $wallet->refresh()->status);
        $this->assertSame(0, AutomationRule::where('to_wallet_id', $wallet->id)->where('enabled', true)->count());
    }

    public function test_notice_to_leave_then_the_money_splits(): void
    {
        [$wallet, $ngozi, $main, $emeka, $emekaMain] = $this->openJoint(['joint' => ['leave' => ['split' => 'equal']]]);
        $wallet->update(['balance' => 10_000_000]);
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/joint/leave", ['pin' => '1234'])->assertOk()->assertJsonPath('data.wallet.joint.state', 'leaving');
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'joint_leaving')->count());

        Carbon::setTestNow(Carbon::parse('2026-11-27 17:00:00')); // 18:00 Lagos, 30 days on
        $before = $emekaMain->refresh()->balance;
        $this->artisan('joint:run')->assertSuccessful();
        $this->assertSame('closed', $wallet->refresh()->status);
        $this->assertSame($before + 5_000_000, $emekaMain->refresh()->balance);
    }

    public function test_weekly_summary_and_monthly_statement_go_to_both(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->openJoint();
        Carbon::setTestNow(Carbon::parse('2026-11-01 17:00:00')); // Sunday the 1st, 6 pm Lagos
        $this->artisan('joint:run')->assertSuccessful();
        foreach ([$ngozi, $emeka] as $user) {
            $this->assertSame(1, AppNotification::where('user_id', $user->id)->where('type', 'joint_summary')->count());
            $this->assertSame(1, AppNotification::where('user_id', $user->id)->where('type', 'joint_statement')->count());
        }
    }
}
