<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\AutomationRun;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Rules from the client prototype: AUT-03 "Household falls below ₦30,000",
 * AUT-04 only if Main has over ₦100,000 / before the 20th / once a week,
 * AUT-05 move or only notify and "also tell Emeka", AUT-06 review and
 * Emeka's yes, AUT-07 a rule from a sentence, AUT-08 the run log, AUT-09
 * run now, AUT-10 failed rules and the salary-day order.
 */
class RuleBuilderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'data' => []]));
        Carbon::setTestNow(Carbon::parse('2026-11-10 09:00:00', 'Africa/Lagos'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $main = 0): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor']);
        $w = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $main]);
        WalletMember::create(['wallet_id' => $w->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function wallet(User $owner, string $name, int $balance, string $type = 'spending'): Wallet
    {
        $w = Wallet::create(['user_id' => $owner->id, 'type' => $type, 'name' => $name, 'balance' => $balance]);
        WalletMember::create(['wallet_id' => $w->id, 'user_id' => $owner->id, 'role' => 'owner', 'status' => 'active']);

        return $w;
    }

    public function test_top_up_household_when_it_runs_low_with_emeka_agreeing(): void
    {
        $ngozi = $this->person('Ngozi', 15_000_000);
        $emeka = $this->person('Emeka');
        $house = $this->wallet($ngozi, 'Household', 2_840_000);
        WalletMember::create(['wallet_id' => $house->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        $main = $ngozi->mainWallet();
        Transaction::create(['wallet_id' => $house->id, 'user_id' => $ngozi->id, 'type' => 'withdrawal', 'direction' => 'debit', 'amount' => 500_000, 'fee' => 0, 'balance_after' => 2_840_000, 'status' => 'successful', 'reference' => 'PTX-H-1', 'description' => 'Market']);

        Sanctum::actingAs($ngozi);
        $draft = [
            'trigger' => 'balance', 'watch_wallet_id' => $house->id, 'threshold' => 30000,
            'min_balance' => 100000, 'before_day' => 20, 'max_per' => 'week',
            'action' => 'move', 'from_wallet_id' => $main->id, 'to_wallet_id' => $house->id, 'amount' => 50000,
            'notify_user_ids' => [$emeka->id],
        ];
        // AUT-06 review.
        $p = $this->postJson('/api/v1/automations/preview', $draft)->assertOk()->json('data');
        $this->assertSame('Keep Household topped up', $p['name']);
        $this->assertSame(['when' => 'Household falls below ₦30,000', 'if' => 'Main has over ₦100,000, before the 20th, once a week', 'then' => 'Move ₦50,000 from Main to Household, tell Emeka'], $p['words']);
        $this->assertSame('Last month this would have run once, on 10 Nov.', $p['last_month']);
        $this->assertSame('Emeka must agree because it moves money into a shared wallet.', $p['agreement_line']);

        // "Turn on and ask Emeka": nothing moves until he agrees.
        $id = $this->postJson('/api/v1/automations/builder', $draft)->assertCreated()->assertJsonPath('data.automation.waiting_for', ['Emeka'])->json('data.automation.id');
        $svc = AutomationService::make();
        $svc->runDue();
        $this->assertSame(2_840_000, (int) $house->fresh()->balance);
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'automation_agree')->count());

        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/automations/{$id}/detail")->assertOk()->assertJsonPath('data.can_agree', true);
        $this->postJson("/api/v1/automations/{$id}/agree", ['yes' => true])->assertOk();

        // Household is under ₦30,000 and Main over ₦100,000: ₦50,000 moves, once this week.
        $svc->runDue();
        $this->assertSame(7_840_000, (int) $house->fresh()->balance);
        $house->update(['balance' => 1_000_000]);
        $svc->runDue();
        $this->assertSame(1_000_000, (int) $house->fresh()->balance);
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'automation_run')->count());

        // AUT-08 the run log.
        Sanctum::actingAs($ngozi);
        $d = $this->getJson("/api/v1/automations/{$id}/detail")->assertOk()->json('data');
        $this->assertSame('Ran', $d['runs'][0]['label']);
        $this->assertSame('Household was ₦28,400 · moved ₦50,000', $d['runs'][0]['note']);

        // Next week Main is short: it fails and tells Ngozi; AUT-10 lists it.
        Carbon::setTestNow(now()->addWeek());
        $main->update(['balance' => 6_200_000]);
        $svc->runDue();
        $this->assertSame('failed', AutomationRun::where('automation_rule_id', $id)->latest('id')->value('status'));
        $help = $this->getJson('/api/v1/automations/help')->assertOk()->json('data');
        $this->assertSame("Keep Household topped up didn't run", $help['failed'][0]['title']);
        $this->assertStringStartsWith('Main wallet had ₦62,000, under ₦100,000', $help['failed'][0]['body']);

        // After the 20th it waits for salary.
        Carbon::setTestNow(Carbon::parse('2026-11-23 09:00:00', 'Africa/Lagos'));
        $main->update(['balance' => 50_000_000]);
        $svc->runDue();
        $this->assertSame('After the 20th, waited for salary', AutomationRun::where('automation_rule_id', $id)->latest('id')->value('note'));
        // AUT-09 "Run it now" ignores the limits.
        $this->postJson("/api/v1/automations/{$id}/run")->assertOk();
        $this->assertSame(6_000_000, (int) $house->fresh()->balance);
    }

    public function test_only_notify_on_events_and_salary_day_order(): void
    {
        $ngozi = $this->person('Ngozi', 0);
        $fees = $this->wallet($ngozi, 'School fees 2027', 9_000_000, 'savings');
        $fees->update(['target_amount' => 10_000_000]);
        $tolu = $this->wallet($ngozi, "Tolu's wallet", 100_000, 'child');
        Sanctum::actingAs($ngozi);

        $goal = $this->postJson('/api/v1/automations/builder', ['trigger' => 'event', 'event' => 'goal_reached', 'watch_wallet_id' => $fees->id, 'action' => 'notify'])->assertCreated()->json('data.automation');
        $this->assertSame('School fees 2027 reaches its goal', $goal['words']['when']);
        $this->assertSame('Tell you', $goal['words']['then']);
        $svc = AutomationService::make();
        $svc->runDue();
        $this->assertSame(0, AppNotification::where('user_id', $ngozi->id)->where('type', 'automation_notice')->count());
        $fees->update(['balance' => 10_000_000]);
        $svc->runDue();
        $svc->runDue();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'automation_notice')->count());

        $req = $this->postJson('/api/v1/automations/builder', ['trigger' => 'event', 'event' => 'request_made', 'watch_wallet_id' => $tolu->id, 'action' => 'notify'])->assertCreated()->json('data.automation');
        Carbon::setTestNow(now()->addMinute());
        ApprovalRequest::create(['wallet_id' => $tolu->id, 'initiator_id' => $ngozi->id, 'action' => 'withdrawal', 'amount' => 1_500_000, 'description' => 'School trip', 'payload' => [], 'required_approvals' => 1]);
        Carbon::setTestNow(now()->addMinute());
        $svc->runDue();
        $this->assertStringContainsString('asked for ₦15,000 from Tolu\'s wallet', AppNotification::where('user_id', $ngozi->id)->where('type', 'automation_notice')->latest('id')->value('body'));

        // AUT-10 salary day: rules out of Main on payday, in order.
        $main = $ngozi->mainWallet();
        Transaction::create(['wallet_id' => $main->id, 'user_id' => $ngozi->id, 'type' => 'fund', 'direction' => 'credit', 'amount' => 45_000_000, 'fee' => 0, 'balance_after' => 45_000_000, 'status' => 'successful', 'reference' => 'PTX-SAL-1', 'description' => 'Salary']);
        $a = AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Save for House rent', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 0, 'percent' => 15, 'trigger' => 'salary', 'frequency' => 'monthly', 'enabled' => true, 'priority' => 2]);
        $b = AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Save from every salary', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 0, 'percent' => 10, 'trigger' => 'salary', 'frequency' => 'monthly', 'enabled' => true, 'priority' => 1]);
        $help = $this->getJson('/api/v1/automations/help')->json('data.salary_day');
        $this->assertSame(['Save from every salary', 'Save for House rent'], array_column($help['rules'], 'name'));
        $this->assertSame('10% of salary · ₦45,000 to School fees 2027', $help['rules'][0]['line']);
        $this->assertStringStartsWith('2 rules want money on the 10th, ₦112,500 in total.', $help['line']);
        $this->putJson('/api/v1/automations/order', ['ids' => [$a->id, $b->id]])->assertOk()->assertJsonPath('data.salary_day.rules.0.name', 'Save for House rent');
    }

    public function test_contribution_rules_remind_before_and_charge_a_late_fee(): void
    {
        $ngozi = $this->person('Ngozi');
        $ada = $this->person('Ada', 5_000_000);
        $fees = $this->wallet($ngozi, 'School fees 2027', 0, 'savings');
        $fees->update(['meta' => ['reminder_day' => 12]]);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $ada->id, 'role' => 'contributor', 'status' => 'active']);
        Sanctum::actingAs($ngozi);

        $s = $this->getJson("/api/v1/wallets/{$fees->id}/contribution-rules")->assertOk()->json('data');
        $this->assertSame('2 days before, and on the day', $s['remind_label']);
        $this->assertSame('Off · families usually keep this friendly', $s['late_fee_label']);
        $this->assertNull($s['interest']);
        $this->putJson("/api/v1/wallets/{$fees->id}/contribution-rules", ['late_fee_on' => true, 'late_fee' => 2000])->assertOk()->assertJsonPath('data.late_fee_label', '₦2,000 after 7 days');
        Sanctum::actingAs($ada);
        $this->putJson("/api/v1/wallets/{$fees->id}/contribution-rules", ['late_fee_on' => false])->assertStatus(422);

        $svc = \App\Services\ContributionRulesService::make();
        // 10 Nov: two days before the 12th.
        $this->assertSame(2, $svc->runDaily()['before']);
        $this->assertSame(0, $svc->runDaily()['before']);
        // 19 Nov: a week late, nothing from Ada — the fee moves and Ngozi hears.
        Carbon::setTestNow(Carbon::parse('2026-11-19 09:00:00', 'Africa/Lagos'));
        $r = $svc->runDaily();
        $this->assertSame(['before' => 0, 'late' => 1, 'fees' => 1], $r);
        $this->assertSame(200_000, (int) $fees->fresh()->balance);
        $this->assertSame("Ada hasn't added to School fees 2027", AppNotification::where('user_id', $ngozi->id)->where('type', 'contribution_late')->value('title'));
    }

    public function test_steward_suggest_prepare_act_and_auto_actions(): void
    {
        $ngozi = $this->person('Ngozi', 10_000_000);
        $main = $ngozi->mainWallet();
        $house = $this->wallet($ngozi, 'Household', 0);
        $tithe = $this->wallet($ngozi, 'Tithes and offerings', 0, 'giving');
        Sanctum::actingAs($ngozi);
        $tool = app(\App\Services\Assistant\Tools\CreateTransferTool::class);
        $req = \Illuminate\Http\Request::create('/');
        $req->setUserResolver(fn () => $ngozi);
        $move = ['source_wallet_id' => $main->id, 'destination_wallet_id' => $house->id, 'amount' => 15000, 'confirmed' => true];

        // Default: Steward prepares, you confirm with your PIN.
        $this->getJson('/api/v1/steward/settings')->assertOk()->assertJsonPath('data.mode', 'prepare');
        $this->assertTrue($tool->handle($req, $move)['requires_pin_authorization']);
        // Suggest only.
        $this->putJson('/api/v1/steward/settings', ['mode' => 'suggest'])->assertOk();
        $this->assertStringContainsString('suggest only', $tool->handle($req, $move)['error'] ?? json_encode($tool->handle($req, $move)));
        // Act within ₦20,000: done without asking, and logged.
        $this->putJson('/api/v1/steward/settings', ['mode' => 'act', 'limit' => 20000])->assertOk()->assertJsonPath('data.limit_label', '₦20,000');
        $this->assertTrue($tool->handle($req, $move)['created']);
        $this->assertSame(1_500_000, (int) $house->fresh()->balance);
        $this->assertSame('Moved ₦15,000 from Main wallet to Household', $this->getJson('/api/v1/steward/actions')->json('data.actions.0.summary'));
        // Over the limit it still asks.
        $this->assertTrue($tool->handle($req, ['amount' => 25000] + $move)['requires_pin_authorization']);

        // RUL-09 "When salary lands, set aside my tithe — up to ₦60,000".
        $this->postJson('/api/v1/steward/auto-actions', ['when' => 'salary', 'will' => 'tithe', 'limit' => 60000])->assertOk();
        $credit = Transaction::create(['wallet_id' => $main->id, 'user_id' => $ngozi->id, 'type' => 'fund', 'direction' => 'credit', 'amount' => 90_000_000, 'fee' => 0, 'balance_after' => 98_500_000, 'status' => 'successful', 'reference' => 'PTX-SAL-9', 'description' => 'Salary']);
        $main->update(['balance' => 98_500_000]);
        AutomationService::make()->runIncome($main->fresh(), $credit);
        $this->assertSame(6_000_000, (int) $tithe->fresh()->balance);

        // "When a goal falls behind, suggest a catch-up plan."
        $fees = $this->wallet($ngozi, 'School fees 2027', 1_000_000, 'savings');
        $fees->forceFill(['target_amount' => 50_000_000, 'target_date' => now()->addMonths(2)->toDateString(), 'created_at' => now()->subMonths(4)])->save();
        $this->postJson('/api/v1/steward/auto-actions', ['when' => 'goal_behind', 'will' => 'catchup'])->assertOk();
        AutomationService::make()->runDue();
        $this->assertStringStartsWith('School fees 2027 is ₦', AppNotification::where('user_id', $ngozi->id)->where('type', 'automation_notice')->latest('id')->value('body'));
    }

    public function test_describe_a_rule_in_words(): void
    {
        $ngozi = $this->person('Ngozi', 15_000_000);
        $house = $this->wallet($ngozi, 'Household', 2_000_000);
        Sanctum::actingAs($ngozi);

        $res = $this->postJson('/api/v1/automations/parse', ['text' => 'Anytime Household money drop below 30k, abeg move 50k from my main wallet. But only if main get up to 100k.'])->assertOk()->json('data');
        $this->assertSame([], $res['missing']);
        $this->assertSame('balance', $res['draft']['trigger']);
        $this->assertSame($house->id, $res['draft']['watch_wallet_id']);
        $this->assertSame(['when' => 'Household falls below ₦30,000', 'if' => 'Main has over ₦100,000, once a week', 'then' => 'Move ₦50,000 from Main to Household'], $res['preview']['words']);

        $this->postJson('/api/v1/automations/parse', ['text' => 'please do something nice'])->assertOk()->assertJsonPath('data.draft', null);
    }
}
