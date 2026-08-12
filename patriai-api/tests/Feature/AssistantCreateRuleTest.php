<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Assistant\Tools\CreateRuleTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Coverage for the create_rule ACTION tool.
 *
 * The tool reuses AutomationController::store + AutomationService::createRule,
 * so all authorization (both wallets owned by the caller) is enforced by the
 * existing backend. The tool adds a hard confirmation gate and never accepts a
 * user_id. It writes only through the existing service.
 */
class AssistantCreateRuleTest extends TestCase
{
    use RefreshDatabase;

    private function wallet(User $user, string $type, string $name): Wallet
    {
        return Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => $name,
            'balance' => 0,
            'status' => 'active',
        ]);
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    /** A valid, confirmed monthly rule payload. */
    private function payload(Wallet $from, Wallet $to, array $extra = []): array
    {
        return array_merge([
            'source_wallet_id' => $from->id,
            'destination_wallet_id' => $to->id,
            'amount' => 5000,
            'frequency' => 'monthly',
            'day_of_month' => 1,
            'confirmed' => true,
        ], $extra);
    }

    // 1. Authenticated user can create an allowed rule.
    public function test_creates_an_allowed_rule(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main Wallet');
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateRuleTool())->handle($this->requestAs($user), $this->payload($from, $to));

        $this->assertTrue($out['created']);
        $this->assertSame(1, AutomationRule::where('user_id', $user->id)->count());
        $rule = AutomationRule::first();
        $this->assertSame($from->id, $rule->from_wallet_id);
        $this->assertSame($to->id, $rule->to_wallet_id);
        $this->assertSame(500000, $rule->amount); // ₦5,000 in kobo
        $this->assertSame('monthly', $rule->frequency);
        $this->assertSame(1, $rule->day_of_month);
    }

    // 2. Unauthenticated request returns 401.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'create a rule'])
            ->assertStatus(401);
    }

    // 3. The tool cannot accept a user_id — not in the schema; smuggled value ignored.
    public function test_schema_has_no_identity_fields_and_user_id_is_ignored(): void
    {
        $schema = (new CreateRuleTool())->inputSchema();
        $this->assertArrayNotHasKey('user_id', $schema['properties']);
        $this->assertArrayNotHasKey('owner_id', $schema['properties']);
        $this->assertFalse($schema['additionalProperties']);

        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $from = $this->wallet($alice, 'main', 'Alice Main');
        $to = $this->wallet($alice, 'savings', 'Alice Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($alice),
            $this->payload($from, $to, ['user_id' => $bob->id]),
        );

        $this->assertTrue($out['created']);
        // The rule belongs to Alice (the authed user), never Bob.
        $this->assertSame($alice->id, AutomationRule::first()->user_id);
        $this->assertSame(0, AutomationRule::where('user_id', $bob->id)->count());
    }

    // 4. User cannot create a rule using another user's wallet.
    public function test_cannot_use_another_users_wallet(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $aliceMain = $this->wallet($alice, 'main', 'Alice Main');
        $bobSavings = $this->wallet($bob, 'savings', 'Bob Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($alice),
            $this->payload($aliceMain, $bobSavings),
        );

        $this->assertFalse($out['created']);
        $this->assertSame('Both wallets must belong to you.', $out['error']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 5. User cannot use a wallet they are only a MEMBER of (rules are owner-only).
    public function test_cannot_use_a_non_owned_member_wallet(): void
    {
        $owner = User::factory()->create();
        $member = $this->wallet($owner, 'shared', 'Family Pot'); // owned by someone else
        $mine = $this->wallet($u = User::factory()->create(), 'main', 'My Main');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($u),
            $this->payload($mine, $member),
        );

        $this->assertFalse($out['created']);
        $this->assertSame('Both wallets must belong to you.', $out['error']);
    }

    // 6. Invalid amount is rejected.
    public function test_invalid_amount_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($user),
            $this->payload($from, $to, ['amount' => 0]),
        );

        $this->assertFalse($out['created']);
        $this->assertNotEmpty($out['error']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 7. Invalid frequency is rejected.
    public function test_invalid_frequency_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($user),
            $this->payload($from, $to, ['frequency' => 'hourly']),
        );

        $this->assertFalse($out['created']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 8. Invalid day_of_month is rejected.
    public function test_invalid_day_of_month_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($user),
            $this->payload($from, $to, ['day_of_month' => 31]), // backend caps at 28
        );

        $this->assertFalse($out['created']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 9. Confirmation is required before tool execution.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateRuleTool())->handle(
            $this->requestAs($user),
            $this->payload($from, $to, ['confirmed' => false]),
        );

        $this->assertFalse($out['created']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 10. User cancellation (never confirmed) does not create a rule.
    public function test_unconfirmed_call_creates_nothing(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        // Model builds the summary but the user cancels → confirmed is never sent.
        $payload = $this->payload($from, $to);
        unset($payload['confirmed']);

        $out = (new CreateRuleTool())->handle($this->requestAs($user), $payload);

        $this->assertFalse($out['created']);
        $this->assertSame(0, AutomationRule::count());
    }

    // 11. Backend validation errors are handled safely (no stack trace leaks).
    public function test_backend_errors_are_returned_safely(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');

        // Same wallet for source & destination → service rejects.
        $out = (new CreateRuleTool())->handle(
            $this->requestAs($user),
            $this->payload($from, $from),
        );

        $this->assertFalse($out['created']);
        $this->assertIsString($out['error']);
        $this->assertStringNotContainsStringIgnoringCase('exception', $out['error']);
        $this->assertStringNotContainsStringIgnoringCase('stack', $out['error']);
    }

    // 12. Existing automation endpoint still works unchanged.
    public function test_existing_automation_endpoint_still_works(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        \Laravel\Sanctum\Sanctum::actingAs($user);

        $this->postJson('/api/v1/automations', [
            'name' => 'Monthly savings',
            'from_wallet_id' => $from->id,
            'to_wallet_id' => $to->id,
            'amount' => '5000',
            'frequency' => 'monthly',
            'day_of_month' => 1,
        ])->assertStatus(201)->assertJsonPath('status', true);

        $this->assertSame(1, AutomationRule::where('user_id', $user->id)->count());
    }

    // 13. The tool writes ONLY through the existing service (no extra tables touched).
    public function test_tool_writes_only_the_rule_via_the_service(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $before = AutomationRule::count();
        $out = (new CreateRuleTool())->handle($this->requestAs($user), $this->payload($from, $to));

        $this->assertTrue($out['created']);
        $this->assertSame($before + 1, AutomationRule::count());
        // No money moved — creating a rule doesn't run it.
        $this->assertSame(0, \App\Models\Transaction::count());
    }

    // 14. Duplicate behaviour follows the existing backend (which permits duplicates).
    public function test_duplicate_behaviour_matches_backend(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main');
        $to = $this->wallet($user, 'savings', 'Savings');

        $tool = new CreateRuleTool();
        $tool->handle($this->requestAs($user), $this->payload($from, $to));
        $tool->handle($this->requestAs($user), $this->payload($from, $to));

        // The existing backend has no create-time duplicate guard, so two rules
        // exist — the tool does not invent a new duplicate system.
        $this->assertSame(2, AutomationRule::where('user_id', $user->id)->count());
    }
}
