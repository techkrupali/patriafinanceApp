<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\CharityDonation;
use App\Models\Organisation;
use App\Models\Transaction;
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
 * SAV-05 "Allow early break — 5% of the amount is kept as a fee", "Where the fee
 * goes — 50% to a charity you pick" (BRK-01/02/04), and SAV-06 "Tell me — Push
 * and SMS".
 */
class SavingsEarlyBreakTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, sms: string}> */
    private array $sms = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.termii.api_key' => 'test-key']);
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/api/sms/send')) {
                $this->sms[] = ['to' => $request['to'], 'sms' => $request['sms']];
            }

            return Http::response(['status' => true, 'data' => ['balance' => 0]]);
        });
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0, string $phone = '+2348034127790'): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3, 'phone' => $phone]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function houseRent(User $ngozi, Wallet $main, array $lock = [], array $members = [], array $plan = []): Wallet
    {
        $charity = Organisation::create(['name' => "Hope Harbour Children's Home", 'kind' => 'charity', 'cause' => 'children', 'area' => 'Surulere', 'state' => 'Lagos', 'account_name' => 'HOPE HARBOUR', 'account_number' => '0011002200', 'bank_code' => '058', 'bank_name' => 'GTBank', 'verified' => true]);
        Sanctum::actingAs($ngozi);
        $res = $this->postJson('/api/v1/wallets', [
            'type' => 'savings',
            'name' => 'House rent',
            'target_amount' => '600000',
            'target_date' => '2027-02-25',
            'source_wallet_id' => $main->id,
            'initial_deposit' => '100000',
            'members' => $members,
            'savings_plan' => array_merge(['amount' => '20000', 'frequency' => 'monthly', 'day_of_month' => 25, 'missed_policy' => 'retry'], $plan),
            'lock' => array_merge(['mode' => 'date', 'until' => '2027-02-25', 'early_break' => true, 'approval' => true, 'charity_id' => $charity->id], $lock),
        ])->assertCreated()
            ->assertJsonPath('data.wallet.lock.fee_percent', 5)
            ->assertJsonPath('data.wallet.lock.charity.name', "Hope Harbour Children's Home");

        return Wallet::find($res->json('data.wallet.id'));
    }

    public function test_breaking_early_keeps_five_percent_half_for_the_charity(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        $rent = $this->houseRent($ngozi, $main);

        // BRK-04: take out ₦50,000 → ₦2,500 fee → ₦47,500 in Main.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $rent->id, 'amount' => '50000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])->assertOk();
        $this->assertSame(5_000_000, $rent->refresh()->balance);
        $this->assertSame(20_000_000 + 4_750_000, $main->refresh()->balance);
        $fee = Transaction::where('wallet_id', $rent->id)->where('type', 'fee')->sole();
        $this->assertSame(250_000, $fee->amount);
        $donation = CharityDonation::sole();
        $this->assertSame(125_000, $donation->amount);
        $this->assertSame('pending', $donation->status);
        $this->assertMatchesRegularExpression('/^HH-2026-\d{4}$/', $donation->receipt_no);
    }

    public function test_with_a_co_saver_the_fee_is_taken_when_they_approve(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        [$emeka] = $this->person('Emeka', 0, '+2348050000318');
        $rent = $this->houseRent($ngozi, $main, [], [['user_id' => $emeka->id, 'role' => 'co_owner']]);
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::sole()->id . '/accept')->assertOk();

        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/transfers', ['from_wallet_id' => $rent->id, 'amount' => '20000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])
            ->assertOk()->assertJsonPath('data.pending_approval', true)->json('data.approval.id');
        $this->assertSame(0, Transaction::where('type', 'fee')->count());

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk();
        $this->assertSame('executed', ApprovalRequest::find($id)->status);
        $this->assertSame(100_000, Transaction::where('wallet_id', $rent->id)->where('type', 'fee')->sole()->amount);
        $this->assertSame(20_000_000 + 1_900_000, $main->refresh()->balance);
    }

    public function test_no_fee_once_it_opens_or_without_a_lock(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 30_000_000);
        $rent = $this->houseRent($ngozi, $main);

        Carbon::setTestNow(Carbon::parse('2027-02-26 10:00:00'));
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $rent->id, 'amount' => '50000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id]])->assertOk();
        $this->assertSame(0, Transaction::where('type', 'fee')->count());
        $this->assertSame(0, CharityDonation::count());
    }

    public function test_tell_me_by_sms_when_a_save_is_missed(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 10_000_000);
        $rent = $this->houseRent($ngozi, $main, [], [], ['notify_sms' => true]);
        $main->update(['balance' => 0]);

        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));
        AutomationService::make()->runDue();
        $this->assertCount(1, $this->sms);
        $this->assertSame('2348034127790', $this->sms[0]['to']);
        $this->assertStringContainsString("save into House rent didn't go", $this->sms[0]['sms']);
        $this->assertTrue($rent->savingsPlan->notify_sms);
        $this->assertSame(1, AutomationRule::where('to_wallet_id', $rent->id)->count());
    }
}
