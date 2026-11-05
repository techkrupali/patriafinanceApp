<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\Circle;
use App\Models\CircleMember;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\PlanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Free and Pro (client prototype PLN-01…04): plans, prices, trial, limits and
 * the comparison are set in admin; a family starts a free trial, it turns into
 * a payment from their wallet, can be cancelled or switched, falls back to Free
 * when unpaid, and Free's limits hold only when admin switches them on.
 */
class PlansTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Ngozi and Emeka in the Okafor family, Ngozi with ₦300,000 in Main. */
    private function family(): array
    {
        Http::fake();
        Mail::fake();
        Carbon::setTestNow('2026-10-25 10:00:00');
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $circle = Circle::create(['created_by' => $ngozi->id, 'owner_id' => $ngozi->id, 'name' => 'Okafor family', 'kind' => 'family', 'is_home' => true]);
        CircleMember::create(['circle_id' => $circle->id, 'user_id' => $ngozi->id, 'role' => 'owner']);
        CircleMember::create(['circle_id' => $circle->id, 'user_id' => $emeka->id, 'role' => 'member']);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 300_000_00]);

        return [$ngozi, $emeka, $main];
    }

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => 'admin'])->save();

        return $admin;
    }

    private function turnOnPro(): void
    {
        Sanctum::actingAs($this->admin());
        $pro = Plan::where('slug', 'pro')->sole();
        $this->patchJson("/api/v1/admin/plans/{$pro->id}", ['active' => true, 'monthly_price' => '0'])->assertStatus(422);
        $this->patchJson("/api/v1/admin/plans/{$pro->id}", ['active' => true, 'monthly_price' => '3000', 'yearly_price' => '30000', 'trial_days' => 30])->assertOk()
            ->assertJsonPath('data.plan.yearly_saves_months', 2);
    }

    public function test_admin_sets_the_plans_and_the_app_shows_them(): void
    {
        [$ngozi] = $this->family();
        Sanctum::actingAs($ngozi);
        // Pro is off until admin prices it: the app shows Free only, with the prototype's rows.
        $d = $this->getJson('/api/v1/plans')->assertOk()->json('data');
        $this->assertSame(['free'], array_column($d['plans'], 'slug'));
        $this->assertSame('free', $d['current']);
        $this->assertSame('Up to 3', $d['features'][0]['values']['free']);
        $this->assertSame(['name' => 'Okafor family', 'count' => 2], $d['family']);
        $this->patchJson('/api/v1/admin/plans/1', ['active' => true])->assertForbidden();

        $this->turnOnPro();
        $this->putJson('/api/v1/admin/plans/features', ['rows' => [
            ['label' => 'Wallets', 'values' => ['free' => 'Up to 3', 'pro' => 'Up to 20']],
            ['label' => 'Family members', 'values' => ['free' => '4', 'pro' => 'Everyone']],
        ]])->assertOk();

        Sanctum::actingAs($ngozi);
        $d = $this->getJson('/api/v1/plans')->assertOk()->json('data');
        $this->assertSame(['free', 'pro'], array_column($d['plans'], 'slug'));
        $this->assertSame(['3000.00', '30000.00', 30], [$d['plans'][1]['monthly_price'], $d['plans'][1]['yearly_price'], $d['plans'][1]['trial_days']]);
        $this->assertSame(['Wallets', 'Family members'], array_column($d['features'], 'label'));
        $this->assertSame('Everyone', $d['features'][1]['values']['pro']);
        $this->assertTrue($d['trial_available']);
        $this->assertSame('Main wallet', $d['wallets'][0]['name']);
    }

    public function test_a_free_trial_then_the_first_payment_and_the_whole_family_is_on_pro(): void
    {
        [$ngozi, $emeka, $main] = $this->family();
        $this->turnOnPro();
        Sanctum::actingAs($ngozi);
        $body = ['plan' => 'pro', 'interval' => 'yearly', 'wallet_id' => $main->id];
        $this->postJson('/api/v1/subscription', $body + ['pin' => '9999'])->assertStatus(422);
        $s = $this->postJson('/api/v1/subscription', $body + ['pin' => '1234'])->assertCreated()->json('data.subscription');
        $this->assertSame(['trialing', '30000.00', 2], [$s['status'], $s['price'], $s['family']['count']]);
        $this->assertSame('2026-11-24', substr($s['trial_ends_at'], 0, 10));
        $this->assertSame(300_000_00, $main->refresh()->balance); // nothing taken during the trial
        $this->assertSame('pro', PlanService::make()->planFor($emeka)->slug);
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'plan_started')->count());
        $this->postJson('/api/v1/subscription', $body + ['pin' => '1234'])->assertStatus(422);
        // Emeka sees it but can't change it.
        Sanctum::actingAs($emeka);
        $this->getJson('/api/v1/subscription')->assertJsonPath('data.subscription.mine', false)->assertJsonPath('data.subscription.payer', 'Ngozi');
        $this->postJson('/api/v1/subscription/cancel')->assertForbidden();

        // Three days before: a reminder. At the end: ₦30,000 from Main, a year more.
        Carbon::setTestNow('2026-11-21 12:00:00');
        $this->artisan('plans:renew')->assertSuccessful();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'plan_trial_ending')->count());
        Carbon::setTestNow('2026-11-24 11:00:00');
        $this->artisan('plans:renew')->assertSuccessful();
        $sub = Subscription::sole();
        $this->assertSame(['active', '2027-11-24'], [$sub->status, $sub->current_period_end->toDateString()]);
        $this->assertSame(270_000_00, $main->refresh()->balance);
        $this->assertSame('Patriai Pro · yearly', Transaction::where('type', 'subscription')->sole()->description);
        $this->assertSame('paid', SubscriptionPayment::sole()->status);
        $this->artisan('plans:renew')->assertSuccessful();
        $this->assertSame(270_000_00, $main->refresh()->balance); // once only
    }

    public function test_switch_cancel_resume_and_back_to_free(): void
    {
        [$ngozi, $emeka, $main] = $this->family();
        $this->turnOnPro();
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/subscription', ['plan' => 'pro', 'interval' => 'yearly', 'wallet_id' => $main->id, 'pin' => '1234'])->assertCreated();
        // On trial, switching is straight away.
        $this->patchJson('/api/v1/subscription', ['interval' => 'monthly'])->assertOk()->assertJsonPath('data.subscription.price', '3000.00');
        $this->postJson('/api/v1/subscription/cancel')->assertOk()->assertJsonPath('data.subscription.cancel_at_period_end', true);
        $this->postJson('/api/v1/subscription/resume')->assertOk()->assertJsonPath('data.subscription.cancel_at_period_end', false);
        $this->postJson('/api/v1/subscription/cancel')->assertOk();

        // Cancelled: at the trial's end, back to Free with nothing taken.
        Carbon::setTestNow('2026-11-25 10:00:00');
        $this->artisan('plans:renew')->assertSuccessful();
        $this->assertSame('expired', Subscription::sole()->status);
        $this->assertSame(300_000_00, $main->refresh()->balance);
        $this->assertSame('free', PlanService::make()->planFor($emeka)->slug);

        // The trial was used: this time it's paid now.
        $s = $this->postJson('/api/v1/subscription', ['plan' => 'pro', 'interval' => 'monthly', 'wallet_id' => $main->id, 'pin' => '1234'])->assertCreated()->json('data.subscription');
        $this->assertSame(['active', null], [$s['status'], $s['trial_ends_at']]);
        $this->assertSame(297_000_00, $main->refresh()->balance);
    }

    public function test_an_unpaid_renewal_gets_three_days_then_free(): void
    {
        [$ngozi, $emeka, $main] = $this->family();
        $this->turnOnPro();
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/subscription', ['plan' => 'pro', 'interval' => 'yearly', 'wallet_id' => $main->id, 'pin' => '1234'])->assertCreated();
        $main->update(['balance' => 10_000_00]);

        Carbon::setTestNow('2026-11-24 11:00:00');
        $this->artisan('plans:renew')->assertSuccessful();
        $sub = Subscription::sole();
        $this->assertSame('past_due', $sub->status);
        $this->assertSame('Not enough in Main wallet for ₦30,000.', $sub->failure);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'plan_payment_failed')->count());
        $this->assertSame('pro', PlanService::make()->planFor($emeka)->slug); // still Pro in the grace days
        $this->getJson('/api/v1/subscription')->assertJsonPath('data.subscription.failure', 'Not enough in Main wallet for ₦30,000.');

        Carbon::setTestNow('2026-11-27 12:00:00');
        $this->artisan('plans:renew')->assertSuccessful();
        $this->assertSame('expired', $sub->refresh()->status);
        $this->assertSame('free', PlanService::make()->planFor($ngozi)->slug);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'plan_ended')->count());
    }

    public function test_free_limits_hold_only_when_admin_turns_them_on(): void
    {
        [$ngozi, $emeka, $main] = $this->family();
        $savings = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'Rent', 'balance' => 0]);
        foreach ([1, 2] as $i) {
            AutomationRule::create(['user_id' => $ngozi->id, 'name' => "Rule {$i}", 'from_wallet_id' => $main->id, 'to_wallet_id' => $savings->id, 'amount' => 1000, 'frequency' => 'monthly', 'day_of_month' => 1, 'trigger' => 'schedule']);
        }
        $rule = ['name' => 'Third', 'from_wallet_id' => $main->id, 'to_wallet_id' => $savings->id, 'amount' => '5000', 'frequency' => 'monthly', 'day_of_month' => 5];
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/automations', $rule)->assertCreated(); // off: no limit

        Sanctum::actingAs($this->admin());
        $this->patchJson('/api/v1/admin/plans/settings', ['enforce' => true])->assertOk();
        $this->turnOnPro();
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/automations', ['name' => 'Fourth'] + $rule)->assertStatus(422)
            ->assertJsonPath('data.code', 'plan_limit')
            ->assertJsonPath('data.title', "You've used your 2 free rules")
            ->assertJsonPath('data.body', 'Pro gives your family more rules — as many as you need. Try it free for 30 days.')
            ->assertJsonPath('data.upgrade', true);

        // On Pro: no rule limit, for the family too.
        $this->postJson('/api/v1/subscription', ['plan' => 'pro', 'interval' => 'yearly', 'wallet_id' => $main->id, 'pin' => '1234'])->assertCreated();
        $this->postJson('/api/v1/automations', ['name' => 'Fourth'] + $rule)->assertCreated();
        $this->getJson('/api/v1/limits')->assertJsonPath('data.plan', 'pro');

        Sanctum::actingAs($this->admin());
        $d = $this->getJson('/api/v1/admin/plans')->assertOk()->json('data');
        $this->assertTrue($d['enforce']);
        $this->assertSame(1, $d['summary']['trials']);
        $this->assertSame('Ngozi Okafor', $d['subscriptions'][0]['user']['name']);
        $this->assertSame(2, $d['subscriptions'][0]['family']);
    }
}
