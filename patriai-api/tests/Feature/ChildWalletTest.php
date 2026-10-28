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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Child wallet from the client prototype (CHW-01…07): pocket money every Monday
 * at 7:00 am out of a spending category, paused in school holidays; small
 * requests approved on their own; a goal the child saves into and the parents
 * match; a code for the child's phone; a co-parent.
 */
class ChildWalletTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3, 'phone' => '+23480' . random_int(10000000, 99999999)]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function kamsi(array $overrides = []): array
    {
        [$ngozi, $main] = $this->person('Ngozi', 10_000_000);
        [$emeka] = $this->person('Emeka');
        $household = Wallet::create(['user_id' => $ngozi->id, 'type' => 'spending', 'name' => 'Household', 'balance' => 10_000_000, 'meta' => ['budget' => ['amount' => 15_000_000, 'period' => 'monthly', 'start_day' => 25, 'alerts' => []]]]);
        WalletMember::create(['wallet_id' => $household->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        $schoolRuns = BudgetCategory::create(['wallet_id' => $household->id, 'name' => 'School runs and lunch', 'limit' => 4_500_000, 'position' => 1]);

        Sanctum::actingAs($ngozi);
        $code = $this->postJson('/api/v1/children/link-code', ['first_name' => 'Kamsi'])->assertOk()->json('data.code');
        $this->assertMatchesRegularExpression('/^KMS-\d{4}$/', $code);

        $id = $this->postJson('/api/v1/wallets', array_replace_recursive([
            'type' => 'child',
            'name' => "Kamsi's wallet",
            'mode' => 'shared',
            'members' => [['user_id' => $emeka->id, 'role' => 'co_owner', 'can_approve' => true]],
            'child' => [
                'first_name' => 'Kamsi',
                'last_name' => 'Okafor',
                'age_band' => '6_9',
                'allowance' => ['amount' => '3000', 'frequency' => 'weekly', 'starts_on' => '2026-11-02', 'from_wallet_id' => $household->id, 'category_id' => $schoolRuns->id, 'pause_holidays' => true, 'notify' => true],
                'controls' => ['daily_limit' => '1500', 'shops' => true, 'friends' => false, 'online' => false, 'cash' => false],
                'requests' => ['auto_limit' => '2000', 'auto_per_week' => 3, 'expiry_hours' => 24, 'reason_required' => true],
                'goal' => ['name' => 'New bicycle', 'amount' => '25000', 'save_percent' => 20, 'match_percent' => 50, 'match_wallet_id' => $main->id],
                'phone' => ['mode' => 'own', 'code' => $code],
                'coparent' => ['approve' => true, 'change' => true, 'see' => true],
                'gifts' => true,
            ],
        ], $overrides))->assertCreated()
            ->assertJsonPath('data.wallet.child.first_name', 'Kamsi')
            ->assertJsonPath('data.wallet.child.phone.code', $code)
            ->assertJsonPath('data.wallet.child.goal.name', 'New bicycle')
            ->json('data.wallet.id');

        return [Wallet::find($id), $ngozi, $main, $emeka, $household, $schoolRuns];
    }

    private function childUser(Wallet $wallet): User
    {
        $child = User::factory()->create(['first_name' => 'Kamsi', 'last_name' => 'Okafor']);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $child->id, 'role' => 'child', 'status' => 'active', 'permissions' => ['view' => true, 'fund' => false, 'request' => true, 'withdraw' => false]]);

        return $child;
    }

    public function test_pocket_money_every_monday_at_seven_with_saving_and_a_match(): void
    {
        [$wallet, $ngozi, $main, $emeka, $household, $schoolRuns] = $this->kamsi();
        $goal = Wallet::find($wallet->meta['child']['goal_wallet_id']);
        $this->assertSame(2_500_000, (int) $goal->target_amount);
        $this->assertSame(1, WalletInvitation::where('wallet_id', $wallet->id)->where('invitee_user_id', $emeka->id)->where('role', 'co_owner')->count());
        $this->assertSame('any', $wallet->meta['approval_mode']);

        $rules = AutomationRule::orderBy('id')->get();
        $this->assertSame([300_000, 60_000, 30_000], $rules->pluck('amount')->all());
        $this->assertSame([7, 8, 8], $rules->pluck('at_hour')->all());
        $this->assertSame($schoolRuns->id, $rules[0]->budget_category_id);

        // Monday 2 Nov, 6:30 am in Lagos: not yet.
        Carbon::setTestNow(Carbon::parse('2026-11-02 05:30:00', 'UTC'));
        AutomationService::make()->runDue();
        $this->assertSame(0, $wallet->refresh()->balance);
        // 7:30 am: the pocket money lands, out of School runs and lunch.
        Carbon::setTestNow(Carbon::parse('2026-11-02 06:30:00', 'UTC'));
        AutomationService::make()->runDue();
        $this->assertSame(300_000, $wallet->refresh()->balance);
        $this->assertSame($schoolRuns->id, Transaction::where('wallet_id', $household->id)->where('direction', 'debit')->sole()->budget_category_id);
        // 8:30 am: Kamsi's ₦600 goes to the bicycle, and the parents add ₦300.
        Carbon::setTestNow(Carbon::parse('2026-11-02 07:30:00', 'UTC'));
        AutomationService::make()->runDue();
        $this->assertSame(240_000, $wallet->refresh()->balance);
        $this->assertSame(90_000, $goal->refresh()->balance);
    }

    public function test_it_pauses_in_the_school_holidays(): void
    {
        [$wallet] = $this->kamsi();
        Carbon::setTestNow(Carbon::parse('2026-12-21 07:30:00', 'UTC')); // a Monday in the Christmas break
        AutomationService::make()->runDue();
        $this->assertSame(0, $wallet->refresh()->balance);
        Carbon::setTestNow(Carbon::parse('2027-01-11 07:30:00', 'UTC')); // term has begun
        AutomationService::make()->runDue();
        $this->assertSame(300_000 - 60_000, $wallet->refresh()->balance);
    }

    public function test_small_requests_go_through_and_bigger_ones_go_to_a_parent(): void
    {
        [$wallet, $ngozi] = $this->kamsi();
        $wallet->update(['balance' => 2_000_000]);
        $child = $this->childUser($wallet);
        Sanctum::actingAs($child);
        $bank = ['kind' => 'bank', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'OLA STORES', 'bank_name' => 'GTBank'];

        // Friends are off; a reason is needed.
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '500', 'pin' => '1234', 'description' => 'snacks', 'destination' => ['kind' => 'user', 'identifier' => $ngozi->phone]])
            ->assertStatus(422)->assertJsonPath('errors.destination.0', "Kamsi can't send money to friends. A parent can turn it on.");
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '500', 'pin' => '1234', 'destination' => $bank])
            ->assertStatus(422)->assertJsonValidationErrors('description');

        // "Ask for ₦1,500 for Ola's birthday gift" → Approved.
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '1500', 'pin' => '1234', 'description' => "Ola's birthday gift", 'destination' => $bank])
            ->assertOk()->assertJsonPath('data.pending_approval', false)->assertJsonPath('data.approval.status', 'executed');
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'approval_auto')->count());

        // Over the day's ₦1,500: a parent decides.
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '500', 'pin' => '1234', 'description' => 'bread', 'destination' => $bank])
            ->assertOk()->assertJsonPath('data.pending_approval', true);
        // Over ₦2,000: always a parent.
        Carbon::setTestNow(Carbon::parse('2026-10-29 10:00:00'));
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '3000', 'pin' => '1234', 'description' => 'school trip', 'destination' => $bank])
            ->assertOk()->assertJsonPath('data.pending_approval', true);
        // Expires after 24 hours if nobody answers.
        $this->assertSame(24, (int) round(now()->diffInHours(ApprovalRequest::latest('id')->first()->expires_at)));
    }

    public function test_up_to_three_automatic_approvals_a_week(): void
    {
        [$wallet] = $this->kamsi(['child' => ['controls' => ['daily_limit' => '5000']]]);
        $wallet->update(['balance' => 2_000_000]);
        $child = $this->childUser($wallet);
        Sanctum::actingAs($child);
        $bank = ['kind' => 'bank', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'OLA STORES', 'bank_name' => 'GTBank'];
        foreach (['500', '600', '700'] as $amount) {
            $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => $amount, 'pin' => '1234', 'description' => 'lunch', 'destination' => $bank])->assertJsonPath('data.pending_approval', false);
        }
        $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '800', 'pin' => '1234', 'description' => 'lunch', 'destination' => $bank])->assertJsonPath('data.pending_approval', true);
    }

    public function test_a_new_code_to_link_the_phone_later(): void
    {
        [$wallet, $ngozi, , $emeka] = $this->kamsi();
        $old = $wallet->meta['child']['phone']['code'];
        $new = $this->postJson("/api/v1/wallets/{$wallet->id}/child/link-code")->assertOk()->json('data.code');
        $this->assertNotSame($old, $new);
        $this->assertSame($new, $wallet->refresh()->meta['child']['phone']['code']);

        // Expired codes aren't shown.
        Carbon::setTestNow(now()->addMinutes(11));
        $this->getJson("/api/v1/wallets/{$wallet->id}")->assertOk()->assertJsonPath('data.wallet.child.phone.code', null);

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$wallet->id}/child/link-code")->assertNotFound();
    }
}
