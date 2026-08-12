<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\CreateWalletTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Coverage for the create_wallet ACTION tool.
 *
 * The tool reuses WalletController::store + WalletService::createWallet, so all
 * validation, the KYC wallet-count limit, ownership assignment and virtual-
 * account provisioning are enforced by the existing backend. The tool adds a
 * hard confirmation gate, restricts to safe single-owner types, and never
 * accepts a user_id. It writes only through the existing service.
 */
class AssistantCreateWalletTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Keep virtual-account provisioning offline & deterministic.
        Http::fake();
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function payload(array $extra = []): array
    {
        return array_merge([
            'name' => 'Vacation Fund',
            'wallet_type' => 'savings',
            'confirmed' => true,
        ], $extra);
    }

    // 1. Authenticated user can create an allowed wallet.
    public function test_creates_an_allowed_wallet(): void
    {
        $user = User::factory()->create();

        $out = (new CreateWalletTool())->handle($this->requestAs($user), $this->payload());

        $this->assertTrue($out['created']);
        $wallet = Wallet::where('user_id', $user->id)->where('type', 'savings')->first();
        $this->assertNotNull($wallet);
        $this->assertSame('Vacation Fund', $wallet->name);
        $this->assertSame(0, $wallet->balance);
        $this->assertSame('NGN', $wallet->currency);
    }

    // 2. Unauthenticated request returns 401.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'create a wallet'])
            ->assertStatus(401);
    }

    // 3. user_id cannot be supplied (not in schema; smuggled value ignored).
    public function test_schema_has_no_identity_fields_and_user_id_is_ignored(): void
    {
        $schema = (new CreateWalletTool())->inputSchema();
        $this->assertArrayNotHasKey('user_id', $schema['properties']);
        $this->assertArrayNotHasKey('owner_id', $schema['properties']);
        $this->assertFalse($schema['additionalProperties']);

        $alice = User::factory()->create();
        $bob = User::factory()->create();

        $out = (new CreateWalletTool())->handle($this->requestAs($alice), $this->payload(['user_id' => $bob->id]));

        $this->assertTrue($out['created']);
        $this->assertSame($alice->id, Wallet::where('type', 'savings')->first()->user_id);
        $this->assertSame(0, Wallet::where('user_id', $bob->id)->count());
    }

    // 4. Wallet is always owned by the authenticated user (owner member row too).
    public function test_wallet_is_owned_by_authenticated_user(): void
    {
        $user = User::factory()->create();

        (new CreateWalletTool())->handle($this->requestAs($user), $this->payload());

        $wallet = Wallet::where('user_id', $user->id)->first();
        $this->assertSame($user->id, $wallet->user_id);
        $this->assertTrue(
            WalletMember::where('wallet_id', $wallet->id)
                ->where('user_id', $user->id)
                ->where('role', 'owner')
                ->exists()
        );
    }

    // 5. Invalid / unsupported wallet type is rejected without touching the backend.
    public function test_unsupported_wallet_type_is_rejected(): void
    {
        $user = User::factory()->create();

        foreach (['project', 'child', 'main', 'crypto'] as $type) {
            $out = (new CreateWalletTool())->handle($this->requestAs($user), $this->payload(['wallet_type' => $type]));
            $this->assertFalse($out['created'], "type {$type} should be rejected");
            $this->assertNotEmpty($out['error']);
        }

        $this->assertSame(0, Wallet::count());
    }

    // 6. Invalid name is rejected by the backend (too long).
    public function test_invalid_name_is_rejected(): void
    {
        $user = User::factory()->create();

        $out = (new CreateWalletTool())->handle($this->requestAs($user), $this->payload(['name' => str_repeat('x', 200)]));

        $this->assertFalse($out['created']);
        $this->assertNotEmpty($out['error']);
        $this->assertSame(0, Wallet::count());
    }

    // 7. Currency is not a create parameter — always NGN (no currency field).
    public function test_currency_is_not_settable_and_defaults_to_ngn(): void
    {
        $schema = (new CreateWalletTool())->inputSchema();
        $this->assertArrayNotHasKey('currency', $schema['properties']);
        $this->assertArrayNotHasKey('initial_balance', $schema['properties']);

        $user = User::factory()->create();
        (new CreateWalletTool())->handle($this->requestAs($user), $this->payload());
        $this->assertSame('NGN', Wallet::first()->currency);
    }

    // 8 & 9. Confirmation is required; confirmed=false / omitted creates nothing.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();

        $out = (new CreateWalletTool())->handle($this->requestAs($user), $this->payload(['confirmed' => false]));
        $this->assertFalse($out['created']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame(0, Wallet::count());

        $noKey = $this->payload();
        unset($noKey['confirmed']);
        $out = (new CreateWalletTool())->handle($this->requestAs($user), $noKey);
        $this->assertFalse($out['created']);
        $this->assertSame(0, Wallet::count());
    }

    // 10. Existing wallet creation endpoint continues to work.
    public function test_existing_wallet_endpoint_still_works(): void
    {
        $user = User::factory()->create();
        \Laravel\Sanctum\Sanctum::actingAs($user);

        $this->postJson('/api/v1/wallets', [
            'type' => 'savings',
            'name' => 'Manual Wallet',
        ])->assertStatus(201)->assertJsonPath('status', true);

        $this->assertSame(1, Wallet::where('user_id', $user->id)->where('name', 'Manual Wallet')->count());
    }

    // 11. Backend errors are returned safely (KYC wallet limit → clean message).
    public function test_backend_limit_error_is_returned_safely(): void
    {
        $user = User::factory()->create(); // tier 0 → max 5 wallets
        $max = \App\Services\KycService::make()->limits((int) $user->kyc_tier)['max_wallets'];
        for ($i = 0; $i < $max; $i++) {
            Wallet::create(['user_id' => $user->id, 'type' => 'savings', 'name' => "W{$i}", 'balance' => 0]);
        }

        $out = (new CreateWalletTool())->handle($this->requestAs($user), $this->payload());

        $this->assertFalse($out['created']);
        $this->assertIsString($out['error']);
        $this->assertStringContainsStringIgnoringCase('limit', $out['error']);
        $this->assertStringNotContainsStringIgnoringCase('exception', $out['error']);
        $this->assertSame($max, Wallet::where('user_id', $user->id)->count()); // none added
    }

    // 12. Tool writes only via the service (creates exactly one wallet + owner row).
    public function test_tool_writes_only_the_wallet_via_the_service(): void
    {
        $user = User::factory()->create();

        (new CreateWalletTool())->handle($this->requestAs($user), $this->payload());

        $this->assertSame(1, Wallet::count());
        $this->assertSame(1, WalletMember::count());
        $this->assertSame(0, \App\Models\Transaction::count()); // no money movement
    }
}
