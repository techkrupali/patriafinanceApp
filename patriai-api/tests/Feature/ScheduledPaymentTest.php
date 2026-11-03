<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\BudgetCategory;
use App\Models\ScheduledPayment;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\ScheduledPaymentService;
use App\Services\SecurityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * SND-14 "Repeat payment — ₦18,000 to Bisi, every Saturday from Household" and
 * SND-15 Scheduled payments: set up once with the PIN; each date sends through
 * the same checks as a payment by hand, and never twice.
 */
class ScheduledPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['token' => 't', 'reference' => 'BANK-REF']]));
    }

    private function person(string $first, string $username, int $balance = 0, int $tier = 3): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'name' => "{$first} Okafor", 'username' => $username, 'kyc_tier' => $tier]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $balance, 'status' => 'active']);

        return [$user, $main];
    }

    private function schedule(Wallet $from, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/v1/scheduled-payments', $extra + [
            'from_wallet_id' => $from->id,
            'amount' => '18000',
            'note' => 'market money',
            'destination' => ['kind' => 'user', 'identifier' => '@bisi'],
            'frequency' => 'weekly',
            'starts_at' => '2026-11-07T07:00:00+01:00',
            'pin' => '1234',
        ]);
    }

    public function test_weekly_payment_runs_on_its_dates_and_never_twice(): void
    {
        Carbon::setTestNow('2026-11-01 09:00:00');
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        [$bisi, $bisiMain] = $this->person('Bisi', 'bisi');
        Sanctum::actingAs($ngozi);

        $this->schedule($main, ['pin' => '9999'])->assertStatus(422);
        $this->schedule($main, ['destination' => ['kind' => 'user', 'identifier' => '@nobody']])->assertNotFound();
        $id = $this->schedule($main)->assertCreated()->assertJsonPath('data.when', 'Every Saturday')->assertJsonPath('data.to_name', 'Bisi Okafor')
            ->assertJsonPath('data.next_run_at', '2026-11-07T06:00:00+00:00')->json('data.id');
        $service = ScheduledPaymentService::make();

        // Not before 7:00 am Saturday.
        $this->assertSame([], $service->runDue(Carbon::parse('2026-11-07 05:59:00')));
        $ran = $service->runDue(Carbon::parse('2026-11-07 06:01:00'));
        $this->assertSame('sent', $ran[0]['result']);
        $this->assertSame(1_800_000, $bisiMain->fresh()->balance);
        $this->assertSame(8_200_000, $main->fresh()->balance);
        $this->assertSame('market money', $main->transactions()->latest('id')->value('description'));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'scheduled_payment_sent', 'title' => 'Paid ₦18,000 to Bisi Okafor']);
        // The same minute again pays nothing.
        $this->assertSame([], $service->runDue(Carbon::parse('2026-11-07 06:02:00')));
        $p = ScheduledPayment::find($id);
        $this->assertSame('2026-11-14 06:00:00', $p->next_run_at->format('Y-m-d H:i:s'));
        $this->assertSame(1, $p->runs);

        // Down for three weeks: one payment now, not three; the next date is still a Saturday.
        $service->runDue(Carbon::parse('2026-12-02 10:00:00'));
        $this->assertSame(3_600_000, $bisiMain->fresh()->balance);
        $this->assertSame('2026-12-05 06:00:00', $p->fresh()->next_run_at->format('Y-m-d H:i:s'));
    }

    public function test_once_a_number_of_times_monthly_end_of_month_pause_and_cancel(): void
    {
        Carbon::setTestNow('2026-10-30 09:00:00');
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        $this->person('Bisi', 'bisi');
        Sanctum::actingAs($ngozi);
        $service = ScheduledPaymentService::make();

        // Once: done after it runs.
        $once = $this->schedule($main, ['frequency' => 'once', 'starts_at' => '2026-11-02T07:00:00+01:00'])->assertJsonPath('data.when', '2 Nov 2026, once')->json('data.id');
        $service->runDue(Carbon::parse('2026-11-02 08:00:00'));
        $this->assertSame('done', ScheduledPayment::find($once)->status);

        // Monthly on the 31st: the last day of shorter months, then back to the 31st.
        $m = ScheduledPayment::find($this->schedule($main, ['frequency' => 'monthly', 'starts_at' => '2026-12-31T07:00:00+01:00', 'ends_after' => 3])->assertJsonPath('data.when', 'Monthly, 31st')->json('data.id'));
        $this->assertSame(['2026-12-31', '2027-01-31', '2027-02-28'], array_map(fn ($n) => $m->occurrence($n)->setTimezone('Africa/Lagos')->toDateString(), [0, 1, 2]));
        foreach (['2026-12-31 06:30', '2027-01-31 06:30', '2027-02-28 06:30'] as $at) {
            $service->runDue(Carbon::parse($at));
        }
        $this->assertSame('done', $m->fresh()->status);
        $this->assertSame(3, $m->fresh()->runs);

        // Pause, then back on: dates missed while paused are not paid.
        $w = $this->schedule($main, ['starts_at' => '2026-11-07T07:00:00+01:00'])->json('data.id');
        $this->patchJson("/api/v1/scheduled-payments/{$w}", ['status' => 'paused'])->assertOk()->assertJsonPath('data.status', 'paused');
        $this->assertSame([], array_filter($service->runDue(Carbon::parse('2026-11-07 07:00:00')), fn ($r) => $r['id'] === $w));
        Carbon::setTestNow('2026-11-18 09:00:00');
        $this->patchJson("/api/v1/scheduled-payments/{$w}", ['status' => 'active'])->assertOk()->assertJsonPath('data.next_run_at', '2026-11-21T06:00:00+00:00');
        $this->deleteJson("/api/v1/scheduled-payments/{$w}")->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame([], $service->runDue(Carbon::parse('2026-11-21 07:00:00')));
        $this->patchJson("/api/v1/scheduled-payments/{$w}", ['status' => 'active'])->assertNotFound();
    }

    public function test_each_run_follows_the_wallet_rules_limits_and_money(): void
    {
        Carbon::setTestNow('2026-11-01 09:00:00');
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 1_000_000);
        [$emeka] = $this->person('Emeka', 'emeka');
        $this->person('Bisi', 'bisi');
        $service = ScheduledPaymentService::make();
        Sanctum::actingAs($ngozi);

        // Not enough money: nothing sent, Ngozi is told.
        $poor = $this->schedule($main, ['amount' => '50000', 'starts_at' => '2026-11-02T07:00:00+01:00'])->json('data.id');
        $this->assertSame('failed', $service->runDue(Carbon::parse('2026-11-02 07:00:00'))[0]['result']);
        $this->assertSame(1_000_000, $main->fresh()->balance);
        $this->assertStringContainsString('available balance', ScheduledPayment::find($poor)->last_reason);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'scheduled_payment_failed']);

        // A shared wallet's approval rule: the run asks Emeka.
        $house = Wallet::create(['user_id' => $ngozi->id, 'type' => 'joint', 'name' => 'Our house', 'balance' => 5_000_000, 'status' => 'active', 'approval_enabled' => true, 'approval_threshold' => 0, 'required_approvals' => 1]);
        WalletMember::create(['wallet_id' => $house->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active', 'can_approve' => true]);
        $this->schedule($house, ['starts_at' => '2026-11-03T07:00:00+01:00'])->assertCreated();
        $items = collect($this->getJson('/api/v1/scheduled-payments')->assertOk()->json('data.items'));
        $this->assertTrue($items->firstWhere('from.name', 'Our house')['approval']);
        $this->assertFalse($items->firstWhere('from.name', 'Main wallet')['approval']);
        $ran = collect($service->runDue(Carbon::parse('2026-11-03 07:00:00')))->firstWhere('result', 'approval');
        $this->assertNotNull($ran);
        $this->assertSame(1, ApprovalRequest::where('wallet_id', $house->id)->where('status', 'pending')->count());
        $this->assertSame(5_000_000, $house->fresh()->balance);

        // Limits still apply: a Tier 1 sender's daily limit stops the run.
        [$kemi, $kemiMain] = $this->person('Kemi', 'kemi', 20_000_000, 1);
        Sanctum::actingAs($kemi);
        $big = $this->schedule($kemiMain, ['amount' => '60000', 'starts_at' => '2026-11-04T07:00:00+01:00'])->json('data.id');
        $service->runDue(Carbon::parse('2026-11-04 07:00:00'));
        $this->assertSame('failed', ScheduledPayment::find($big)->last_result);
        $this->assertStringContainsString('one payment can be up to ₦50,000', ScheduledPayment::find($big)->last_reason);
        $this->assertSame(20_000_000, $kemiMain->fresh()->balance);
    }

    public function test_skips_when_the_category_is_used_up(): void
    {
        Carbon::setTestNow('2026-11-01 09:00:00');
        [$ngozi] = $this->person('Ngozi', 'ngozi');
        [, $bisiMain] = $this->person('Bisi', 'bisi');
        $household = Wallet::create(['user_id' => $ngozi->id, 'type' => 'spending', 'name' => 'Household', 'balance' => 10_000_000, 'status' => 'active', 'meta' => ['budget' => ['amount' => 5_000_000, 'period' => 'monthly', 'over_limit' => 'approve']]]);
        $food = BudgetCategory::create(['wallet_id' => $household->id, 'name' => 'Food and market', 'limit' => 2_000_000, 'position' => 0]);
        Sanctum::actingAs($ngozi);
        $id = $this->schedule($household, ['amount' => '18000', 'budget_category_id' => $food->id, 'skip_if_over' => true, 'starts_at' => '2026-11-07T07:00:00+01:00'])->json('data.id');
        $service = ScheduledPaymentService::make();

        $service->runDue(Carbon::parse('2026-11-07 07:00:00'));
        $this->assertSame('sent', ScheduledPayment::find($id)->last_result);
        // ₦2,000 of Food and market is left: next Saturday is skipped, not sent for approval.
        $service->runDue(Carbon::parse('2026-11-14 07:00:00'));
        $p = ScheduledPayment::find($id);
        $this->assertSame('skipped', $p->last_result);
        $this->assertStringContainsString('Food and market', $p->last_reason);
        $this->assertSame(1_800_000, $bisiMain->fresh()->balance);
        $this->assertSame(0, ApprovalRequest::count());
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'scheduled_payment_skipped']);
        $this->assertSame('active', $p->status);
    }

    public function test_two_step_once_when_set_up_and_the_list_for_the_next_30_days(): void
    {
        Carbon::setTestNow('2026-11-01 09:00:00');
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 200_000_000);
        $this->person('Bisi', 'bisi', 0, 3);
        $secret = SecurityService::base32Encode(random_bytes(20));
        $ngozi->forceFill(['two_factor_method' => 'authenticator', 'two_factor_secret' => $secret, 'two_factor_confirmed_at' => now()])->save();
        Sanctum::actingAs($ngozi);

        // Over ₦500,000: two-step when it's set up, not on each run (no phone is there then).
        $this->schedule($main, ['amount' => '600000', 'frequency' => 'monthly', 'starts_at' => '2026-11-15T07:00:00+01:00'])->assertStatus(422)->assertJsonPath('data.code', 'two_factor_required');
        $big = $this->schedule($main, ['amount' => '600000', 'frequency' => 'monthly', 'starts_at' => '2026-11-15T07:00:00+01:00', 'two_factor_code' => SecurityService::totp($secret, intdiv(time(), 30))])->assertCreated()->json('data.id');
        $this->schedule($main)->assertCreated(); // ₦18,000 every Saturday

        // SND-15: Saturdays 7, 14, 21, 28 Nov + the 15th: ₦672,000 in the next 30 days.
        $list = $this->getJson('/api/v1/scheduled-payments')->assertOk()->assertJsonPath('data.next_30_days', '672000.00')->assertJsonPath('data.short_count', 0)->json('data.items');
        $this->assertSame(['Every Saturday', 'Monthly, 15th'], array_column($list, 'when'));

        // Short: with ₦500,000 in Main, two Saturdays go first and the 15th is ₦136,000 short;
        // it sends nothing, so the Saturdays after it are fine.
        $main->update(['balance' => 50_000_000]);
        $this->getJson('/api/v1/scheduled-payments')->assertJsonPath('data.short_count', 1)->assertJsonPath('data.items.1.short', '136000.00')->assertJsonPath('data.items.0.short', null);

        ScheduledPaymentService::make()->runDue(Carbon::parse('2026-11-15 06:00:00'));
        $main->update(['balance' => 200_000_000]);
        ScheduledPaymentService::make()->runDue(Carbon::parse('2026-12-15 06:00:00'));
        $this->assertSame('sent', ScheduledPayment::find($big)->last_result);
        $this->artisan('payments:run-scheduled')->assertSuccessful();
    }

    public function test_rule_first_sunday_ask_first_and_if_short(): void
    {
        Carbon::setTestNow('2026-10-25 09:00:00');
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        [$emeka] = $this->person('Emeka', 'emeka');
        [$bisi, $bisiMain] = $this->person('Bisi', 'bisi');
        $tithe = Wallet::create(['user_id' => $ngozi->id, 'type' => 'giving', 'name' => 'Tithes and offerings', 'balance' => 2_840_000, 'status' => 'active']);
        WalletMember::create(['wallet_id' => $tithe->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        Sanctum::actingAs($ngozi);

        // RUL-03 "First Sunday of the month, 7:00 am"; RUL-04 ask Ngozi or Emeka; RUL-05 warn 3 days before, cancel on the day.
        $p = $this->schedule($tithe, [
            'name' => 'Tithe', 'amount' => '45000', 'frequency' => 'monthly', 'week_of_month' => 1, 'weekday' => 7,
            'starts_at' => '2026-10-26T07:00:00+01:00',
            'confirm' => ['user_ids' => [$ngozi->id, $emeka->id], 'mode' => 'any'],
            'short_policy' => ['check_days' => 3, 'remind_day_before' => true, 'on_day' => 'cancel'],
        ])->assertCreated()->assertJsonPath('data.when', 'First Sunday of the month, 7:00 am')->json('data');
        $this->assertSame('2026-11-01T06:00:00+00:00', $p['next_run_at']);
        $svc = ScheduledPaymentService::make();

        // Thu 29 Oct: ₦28,400 there, ₦45,000 going out → RUL-07 warning; again on Sat.
        $svc->runDue(Carbon::parse('2026-10-29 08:00:00'));
        $this->assertSame("Not enough for Sunday's payment", AppNotification::where('user_id', $ngozi->id)->where('type', 'scheduled_payment_short')->value('title'));
        $short = $this->getJson("/api/v1/scheduled-payments/{$p['id']}/shortfall")->assertOk()->json('data');
        $this->assertSame('₦16,600 short', $short['short_label']);
        // Saturday 7 pm: the confirmers are asked.
        $svc->runDue(Carbon::parse('2026-10-31 18:30:00'));
        $this->assertSame(2, AppNotification::where('user_id', $ngozi->id)->where('type', 'scheduled_payment_short')->count());
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'scheduled_payment_confirm')->count());

        // Sunday 7 am, nobody confirmed: it waits until noon, then it's skipped.
        $this->assertSame([], $svc->runDue(Carbon::parse('2026-11-01 06:05:00')));
        $r = $svc->runDue(Carbon::parse('2026-11-01 11:05:00'));
        $this->assertSame('skipped', $r[0]['result']);
        $this->assertSame('2026-12-06 06:00:00', ScheduledPayment::find($p['id'])->next_run_at->format('Y-m-d H:i:s'));

        // December: Emeka says yes, but the wallet is still short → cancelled, the rule stays on.
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/scheduled-payments/{$p['id']}/confirm")->assertOk()->assertJsonPath('data.confirmed', true);
        $r = $svc->runDue(Carbon::parse('2026-12-06 06:05:00'));
        $this->assertSame('cancelled', $r[0]['result']);
        $this->assertStringStartsWith('Tithe was cancelled', AppNotification::where('user_id', $ngozi->id)->where('type', 'scheduled_payment_cancelled')->value('title'));

        // RUL-08 "Send it now instead", with what's there.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/scheduled-payments/{$p['id']}/send-now", ['pin' => '1234', 'amount' => '28400'])->assertOk();
        $this->assertSame(0, (int) $tithe->fresh()->balance);
    }
}
