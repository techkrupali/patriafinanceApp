<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\CreateTransferTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for the create_transfer ACTION tool.
 *
 * The tool is a PREPARE + secure hand-off: it validates read-only using the
 * backend's own wallet-authorization methods, requires explicit confirmation,
 * and returns a hand-off to the PIN-protected transfer screen. It never moves
 * money, never touches the PIN, and never writes to the database. The real money
 * movement stays on POST /transfers, which remains the sole authority.
 */
class AssistantCreateTransferTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(); // no real payment provider is ever contacted
    }

    private function wallet(User $user, string $type, string $name, int $balanceKobo = 0): Wallet
    {
        return Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => $name,
            'balance' => $balanceKobo,
            'status' => 'active',
        ]);
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function payload(Wallet $from, Wallet $to, array $extra = []): array
    {
        return array_merge([
            'source_wallet_id' => $from->id,
            'destination_wallet_id' => $to->id,
            'amount' => 5000,
            'confirmed' => true,
        ], $extra);
    }

    // 1. Authenticated user can PREPARE an allowed transfer (no money moved).
    public function test_prepares_an_allowed_transfer_without_moving_money(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main Wallet', 1_000_000); // ₦10,000
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to));

        $this->assertFalse($out['created']);              // AI never creates the transaction
        $this->assertTrue($out['requires_pin_authorization']);
        $this->assertSame('5000.00', $out['summary']['amount']);
        $this->assertSame(0, Transaction::count());       // nothing moved
        $this->assertSame(1_000_000, $from->refresh()->balance);
        $this->assertSame(0, $to->refresh()->balance);
        // Hand-off carries a prefill for the secure screen + an idempotency key.
        $this->assertSame($from->id, $out['authorization']['transfer']['from_wallet_id']);
        $this->assertNotEmpty($out['authorization']['transfer']['idempotency_key']);
    }

    // 2. Unauthenticated request returns 401.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'send money'])
            ->assertStatus(401);
    }

    // 3 & 13. No identity or PIN fields in the schema; smuggled values ignored.
    public function test_schema_has_no_identity_or_pin_fields(): void
    {
        $props = (new CreateTransferTool())->inputSchema()['properties'];
        foreach (['user_id', 'owner_id', 'sender_id', 'pin', 'password', 'otp', 'transaction_pin'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $props, "{$forbidden} must not be in the schema");
        }
        $this->assertFalse((new CreateTransferTool())->inputSchema()['additionalProperties']);

        $alice = User::factory()->create();
        $from = $this->wallet($alice, 'main', 'Main', 1_000_000);
        $to = $this->wallet($alice, 'savings', 'Savings');

        $out = (new CreateTransferTool())->handle(
            $this->requestAs($alice),
            $this->payload($from, $to, ['user_id' => 999999, 'pin' => '1234']),
        );

        // Extra keys are simply ignored; the transfer is scoped to Alice.
        $this->assertTrue($out['requires_pin_authorization']);
        $this->assertSame($from->id, $out['authorization']['transfer']['from_wallet_id']);
    }

    // 4. Another user's wallet cannot be used (source or destination).
    public function test_cannot_use_another_users_wallet(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $aliceMain = $this->wallet($alice, 'main', 'Alice Main', 100_000);
        $bobSavings = $this->wallet($bob, 'savings', 'Bob Savings');

        // Destination belongs to Bob.
        $out = (new CreateTransferTool())->handle($this->requestAs($alice), $this->payload($aliceMain, $bobSavings));
        $this->assertFalse($out['created']);
        $this->assertArrayHasKey('error', $out);

        // Source belongs to Bob.
        $bobMain = $this->wallet($bob, 'main', 'Bob Main', 100_000);
        $aliceSav = $this->wallet($alice, 'savings', 'Alice Sav');
        $out = (new CreateTransferTool())->handle($this->requestAs($alice), $this->payload($bobMain, $aliceSav));
        $this->assertFalse($out['created']);
        $this->assertSame(0, Transaction::count());
    }

    // 5 & 12. A viewer member cannot transfer — backend permission is authoritative.
    public function test_unauthorized_member_cannot_transfer(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $shared = $this->wallet($owner, 'shared', 'Family Pot', 100_000);
        $viewerWallet = $this->wallet($viewer, 'main', 'Viewer Main');
        WalletMember::create([
            'wallet_id' => $shared->id,
            'user_id' => $viewer->id,
            'role' => 'viewer',
            'status' => 'active',
        ]);

        $out = (new CreateTransferTool())->handle($this->requestAs($viewer), $this->payload($shared, $viewerWallet));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('permission', $out['error']);
        $this->assertSame(0, Transaction::count());
    }

    // 6. Insufficient balance is rejected.
    public function test_insufficient_balance_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 1_000); // ₦10 only
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to, ['amount' => 5000]));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('available', $out['error']);
    }

    // 7. Invalid amount is rejected.
    public function test_invalid_amount_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 100_000);
        $to = $this->wallet($user, 'savings', 'Savings');

        foreach ([0, -100, 'abc'] as $bad) {
            $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to, ['amount' => $bad]));
            $this->assertFalse($out['created']);
        }
    }

    // 8. Source and destination cannot be the same wallet.
    public function test_same_source_and_destination_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 100_000);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $from));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('same', $out['error']);
    }

    // 9, 10 & 11. Confirmation required; unconfirmed / cancelled never hands off or moves money.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 1_000_000);
        $to = $this->wallet($user, 'savings', 'Savings');

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to, ['confirmed' => false]));
        $this->assertFalse($out['created']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertArrayNotHasKey('authorization', $out); // no hand-off yet
        $this->assertSame(0, Transaction::count());

        // Cancelled → confirmed never sent.
        $noKey = $this->payload($from, $to);
        unset($noKey['confirmed']);
        $out = (new CreateTransferTool())->handle($this->requestAs($user), $noKey);
        $this->assertFalse($out['created']);
        $this->assertArrayNotHasKey('authorization', $out);
        $this->assertSame(0, Transaction::count());
    }

    // 14. Tool writes nothing to the database.
    public function test_tool_never_writes(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 1_000_000);
        $to = $this->wallet($user, 'savings', 'Savings');

        $before = Transaction::count();
        (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to));

        $this->assertSame($before, Transaction::count());
        $this->assertSame(1_000_000, $from->refresh()->balance);
    }

    // 15. Existing transfer API still works AND still requires the PIN.
    public function test_existing_transfer_api_still_works_and_requires_pin(): void
    {
        $user = User::factory()->create(); // factory sets PIN = 1234
        $from = $this->wallet($user, 'main', 'Main', 100_000);
        $to = $this->wallet($user, 'savings', 'Savings');
        Sanctum::actingAs($user);

        // Missing PIN → rejected by validation (422).
        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $from->id,
            'amount' => '100',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $to->id],
        ])->assertStatus(422);
        $this->assertSame(0, Transaction::count());

        // With PIN → succeeds (wallet→wallet, no external provider).
        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $from->id,
            'amount' => '100',
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $to->id],
        ])->assertOk()->assertJsonPath('status', true);

        $this->assertSame(90_000, $from->refresh()->balance);
        $this->assertSame(10_000, $to->refresh()->balance);
    }

    // 16. Retrying the tool never double-sends (it sends nothing) and carries an idempotency key.
    public function test_retry_is_safe_and_idempotency_key_present(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 1_000_000);
        $to = $this->wallet($user, 'savings', 'Savings');

        $tool = new CreateTransferTool();
        $a = $tool->handle($this->requestAs($user), $this->payload($from, $to));
        $b = $tool->handle($this->requestAs($user), $this->payload($from, $to));

        $this->assertTrue($a['requires_pin_authorization']);
        $this->assertTrue($b['requires_pin_authorization']);
        $this->assertSame(0, Transaction::count()); // no money moved on either call
        $this->assertIsString($a['authorization']['transfer']['idempotency_key']);
        $this->assertNotEmpty($a['authorization']['transfer']['idempotency_key']);
    }

    // 17. No real external financial transaction occurs (nothing hit the provider).
    public function test_no_external_provider_calls(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user, 'main', 'Main', 1_000_000);
        $to = $this->wallet($user, 'savings', 'Savings');

        (new CreateTransferTool())->handle($this->requestAs($user), $this->payload($from, $to));

        Http::assertNothingSent();
    }
}
