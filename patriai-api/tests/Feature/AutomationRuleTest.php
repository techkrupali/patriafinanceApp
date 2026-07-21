<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * runRule() idempotency: a rule may move money at most once per period, even
 * when the runner fires twice (cron + manual "run now", or overlapping ticks).
 */
class AutomationRuleTest extends TestCase
{
    use RefreshDatabase;

    public function test_run_rule_moves_money_once_per_period(): void
    {
        $user = User::factory()->create();

        $from = Wallet::create([
            'user_id' => $user->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => 50_000, // ₦500.00
        ]);
        $to = Wallet::create([
            'user_id' => $user->id,
            'type' => 'savings',
            'name' => 'Savings Wallet',
            'balance' => 0,
        ]);

        $rule = AutomationRule::create([
            'user_id' => $user->id,
            'name' => 'Daily sweep',
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'amount' => 10_000, // ₦100.00
            'frequency' => 'daily',
            'enabled' => true,
        ]);

        $service = AutomationService::make();
        $now = now();

        $first = $service->runRule($rule, $now, force: true);
        $this->assertSame('ran', $first['status']);
        $this->assertNotEmpty($first['reference']);

        // Second run in the SAME period must be a no-op skip.
        $second = $service->runRule($rule->refresh(), $now, force: true);
        $this->assertSame('skipped', $second['status']);
        $this->assertSame('Already ran this period', $second['reason']);

        // Money moved exactly once.
        $this->assertSame(40_000, $from->refresh()->balance);
        $this->assertSame(10_000, $to->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $from->id)->where('type', 'transfer_out')->count());
        $this->assertSame($rule->refresh()->last_run_period, $rule->currentPeriod($now));
    }
}
