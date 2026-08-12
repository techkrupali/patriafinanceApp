<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\CreateTransferTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Coverage for one-off external bank transfers via create_transfer.
 *
 * The tool resolves the bank code (GET /banks), verifies the account name
 * (POST /banks/verify-account), runs a read-only dry-run (canWithdraw, fee-
 * inclusive balance, approval check) and returns a secure_transfer hand-off with
 * a bank destination + idempotency_key. It moves NO money and never handles a
 * PIN — the real payout stays on POST /transfers.
 */
class AssistantBankTransferTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::forget('matrix.banks');
        // Fake the banking provider deterministically. Verification succeeds except
        // for the sentinel account number 0000000000 (used to test failure).
        Http::fake(function ($request) {
            $url = $request->url();
            if (str_contains($url, 'get-banks')) {
                return Http::response(['status' => true, 'data' => [
                    ['bank_name' => 'GTBank', 'bank_code' => '058'],
                    ['bank_name' => 'Access Bank', 'bank_code' => '044'],
                ]], 200);
            }
            if (str_contains($url, 'verify-bank-account')) {
                if (($request->data()['account_number'] ?? '') === '0000000000') {
                    return Http::response(['status' => false, 'message' => 'Account not found'], 200);
                }
                return Http::response(['status' => true, 'data' => [
                    'first_name' => 'John', 'last_name' => 'Doe', 'bank_name' => 'GTBank',
                ]], 200);
            }
            return Http::response(['status' => true, 'data' => []], 200);
        });
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function wallet(User $user, int $balanceKobo = 1_000_000, string $status = 'active'): Wallet
    {
        return Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => $balanceKobo, 'status' => $status]);
    }

    private function bankPayload(Wallet $from, array $extra = []): array
    {
        return array_merge([
            'destination_type' => 'bank',
            'source_wallet_id' => $from->id,
            'amount' => 5000,
            'bank' => 'GTBank',
            'account_number' => '1234567890',
            'confirmed' => true,
        ], $extra);
    }

    // Bank name → code resolution + account verification + verified name in summary.
    public function test_resolves_bank_verifies_account_and_returns_verified_name(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['confirmed' => false]));

        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame('bank', $out['summary']['destination']['kind']);
        $this->assertSame('John Doe', $out['summary']['destination']['name']);   // verified name
        $this->assertSame('GTBank', $out['summary']['destination']['bank_name']);
        $this->assertSame('******7890', $out['summary']['destination']['account_masked']);
        $this->assertSame('5000.00', $out['summary']['amount']);
        $this->assertSame('20.00', $out['summary']['fee']);                       // ₦20 fee
        $this->assertSame(0, Transaction::count());
    }

    // Confirmed bank transfer → secure hand-off with bank destination + idempotency, no PIN, no money.
    public function test_confirmed_bank_transfer_returns_secure_action(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from));

        $this->assertFalse($out['created']);
        $this->assertTrue($out['requires_pin_authorization']);
        $dest = $out['authorization']['transfer']['destination'];
        $this->assertSame('bank', $dest['kind']);
        $this->assertSame('058', $dest['bank_code']);
        $this->assertSame('1234567890', $dest['account_number']); // full number for POST /transfers
        $this->assertSame('John Doe', $dest['account_name']);
        $this->assertNotEmpty($out['authorization']['transfer']['idempotency_key']);
        // No PIN anywhere in the tool result.
        $this->assertStringNotContainsStringIgnoringCase('"pin"', json_encode($out));
        $this->assertSame(0, Transaction::count()); // no external payout during the tool call
    }

    // Confirmation is required — confirmed=false / omitted moves nothing and returns no hand-off.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['confirmed' => false]));
        $this->assertFalse($out['created']);
        $this->assertArrayNotHasKey('authorization', $out);

        $p = $this->bankPayload($from);
        unset($p['confirmed']);
        $out = (new CreateTransferTool())->handle($this->requestAs($user), $p);
        $this->assertArrayNotHasKey('authorization', $out);
        $this->assertSame(0, Transaction::count());
    }

    // Another user's wallet cannot be used as the source.
    public function test_cannot_use_another_users_wallet(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $bobWallet = $this->wallet($bob);

        $out = (new CreateTransferTool())->handle($this->requestAs($alice), $this->bankPayload($bobWallet));

        $this->assertFalse($out['created']);
        $this->assertArrayHasKey('error', $out);
    }

    // A member without withdrawal permission (viewer) is rejected.
    public function test_member_without_withdraw_permission_is_rejected(): void
    {
        $owner = User::factory()->create();
        $viewer = User::factory()->create();
        $wallet = $this->wallet($owner);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $viewer->id, 'role' => 'viewer', 'status' => 'active']);

        $out = (new CreateTransferTool())->handle($this->requestAs($viewer), $this->bankPayload($wallet));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('permission', $out['error']);
    }

    // Insufficient balance INCLUDING the fee is rejected.
    public function test_insufficient_balance_including_fee_is_rejected(): void
    {
        $user = User::factory()->create();
        // ₦5,000 exactly — leaves nothing for the ₦20 fee.
        $from = $this->wallet($user, balanceKobo: 500_000);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['amount' => 5000]));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('fee', $out['error']);
    }

    // Invalid bank / account number is handled safely.
    public function test_invalid_bank_and_account_are_rejected_safely(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);

        $badAcct = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['account_number' => '123']));
        $this->assertFalse($badAcct['created']);
        $this->assertStringContainsStringIgnoringCase('account number', $badAcct['error']);

        $badBank = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['bank' => 'Nonexistent Bank']));
        $this->assertFalse($badBank['created']);
        $this->assertStringContainsStringIgnoringCase('bank', $badBank['error']);
        $this->assertSame(0, Transaction::count());
    }

    // Verification failure at the provider is surfaced safely (sentinel account).
    public function test_unverifiable_account_is_rejected(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);

        $out = (new CreateTransferTool())->handle($this->requestAs($user), $this->bankPayload($from, ['account_number' => '0000000000']));

        $this->assertFalse($out['created']);
        $this->assertStringContainsStringIgnoringCase('verify', $out['error']);
        $this->assertSame(0, Transaction::count());
    }

    // Approval-required transfer is flagged (existing approval mechanism, not bypassed).
    public function test_approval_requirement_is_surfaced(): void
    {
        $owner = User::factory()->create();
        $approver = User::factory()->create();
        $wallet = Wallet::create([
            'user_id' => $owner->id, 'type' => 'main', 'name' => 'Main Wallet',
            'balance' => 1_000_000, 'status' => 'active',
            'approval_enabled' => true, 'approval_threshold' => 100_000, 'required_approvals' => 1,
        ]);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $approver->id, 'role' => 'co_owner', 'status' => 'active', 'can_approve' => true]);

        $out = (new CreateTransferTool())->handle($this->requestAs($owner), $this->bankPayload($wallet, ['confirmed' => false, 'amount' => 5000]));

        $this->assertTrue($out['summary']['may_require_approval']);
    }

    // No pin/otp/identity fields exist in the schema.
    public function test_schema_has_no_pin_or_identity_fields(): void
    {
        $props = (new CreateTransferTool())->inputSchema()['properties'];
        foreach (['pin', 'password', 'otp', 'transaction_pin', 'user_id', 'owner_id', 'sender_id'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $props, "{$forbidden} must not be in the schema");
        }
        $this->assertFalse((new CreateTransferTool())->inputSchema()['additionalProperties']);
    }

    // Retrying the tool never issues a payout (it issues none) and mints a fresh key each time.
    public function test_retry_moves_no_money(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);
        $tool = new CreateTransferTool();

        $a = $tool->handle($this->requestAs($user), $this->bankPayload($from));
        $b = $tool->handle($this->requestAs($user), $this->bankPayload($from));

        $this->assertTrue($a['requires_pin_authorization']);
        $this->assertTrue($b['requires_pin_authorization']);
        $this->assertSame(0, Transaction::count());
        $this->assertNotEmpty($a['authorization']['transfer']['idempotency_key']);
    }

    // The existing /transfers bank flow still requires a PIN (unchanged).
    public function test_existing_transfers_bank_flow_still_requires_pin(): void
    {
        $user = User::factory()->create();
        $from = $this->wallet($user);
        \Laravel\Sanctum\Sanctum::actingAs($user);

        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $from->id,
            'amount' => '5000',
            'destination' => ['kind' => 'bank', 'bank_code' => '058', 'account_number' => '1234567890', 'account_name' => 'John Doe', 'bank_name' => 'GTBank'],
        ])->assertStatus(422); // missing pin

        $this->assertSame(0, Transaction::count());
    }
}
