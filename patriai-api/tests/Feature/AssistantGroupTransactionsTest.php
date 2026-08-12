<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\GroupTransactionsTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for group_transactions — grouped/aggregate summaries for a wallet,
 * bank account, or recipient. Reuses TransactionQueryService (scoping, filters,
 * pagination, aggregate). Read-only; no user_id; masks account numbers.
 */
class AssistantGroupTransactionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.anthropic.api_key' => 'test-key']);
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function wallet(User $u, string $name = 'Main Wallet'): Wallet
    {
        return Wallet::create(['user_id' => $u->id, 'type' => 'main', 'name' => $name, 'balance' => 0, 'status' => 'active']);
    }

    private function txn(Wallet $w, array $attrs = []): Transaction
    {
        return Transaction::create(array_merge([
            'reference' => Transaction::generateReference(),
            'wallet_id' => $w->id,
            'user_id' => $w->user_id,
            'type' => 'transfer_out',
            'direction' => 'debit',
            'amount' => 1_000_000, // ₦10,000
            'status' => 'successful',
            'description' => 'Payment',
            'counterparty' => ['kind' => 'bank', 'account_name' => 'John Doe', 'account_number' => '1234567890', 'bank_name' => 'GTBank'],
        ], $attrs));
    }

    private function setCreatedAt(Transaction $t, string $when): void
    {
        $t->created_at = $when;
        $t->save();
    }

    private function tool(): GroupTransactionsTool
    {
        return new GroupTransactionsTool();
    }

    // 1 & 3 & 4. Group by wallet: count + total correct.
    public function test_group_by_wallet(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['amount' => 1_000_000]);
        $this->txn($w, ['amount' => 2_500_000]);

        $out = $this->tool()->handle($this->requestAs($user), ['wallet_id' => $w->id]);

        $this->assertTrue($out['grouped']);
        $this->assertSame('wallet', $out['target']['type']);
        $this->assertSame('Main Wallet', $out['target']['wallet_name']);
        $this->assertSame(2, $out['summary']['transaction_count']);
        $this->assertSame('35000.00', $out['summary']['total_amount']);
        $this->assertCount(2, $out['transactions']);
    }

    // 2 & 15. Group by bank account: matches via counterparty; account masked.
    public function test_group_by_bank_account_masks_number(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['amount' => 1_000_000]);
        $this->txn($w, ['amount' => 4_000_000]);
        // A different account — must not be counted.
        $this->txn($w, ['amount' => 9_900_000, 'counterparty' => ['kind' => 'bank', 'account_name' => 'Jane', 'account_number' => '9999999999', 'bank_name' => 'GTBank']]);

        $out = $this->tool()->handle($this->requestAs($user), ['account_number' => '1234567890']);

        $this->assertTrue($out['grouped']);
        $this->assertSame('bank_account', $out['target']['type']);
        $this->assertSame('••••••7890', $out['target']['display']); // masked, no full number
        $this->assertStringNotContainsString('1234567890', json_encode($out['target']));
        $this->assertSame(2, $out['summary']['transaction_count']);
        $this->assertSame('50000.00', $out['summary']['total_amount']);
    }

    // 5. Date filtering.
    public function test_date_filtering(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->setCreatedAt($this->txn($w), '2026-07-05 10:00:00'); // out of range
        $this->setCreatedAt($this->txn($w), '2026-08-10 10:00:00'); // in range

        $out = $this->tool()->handle($this->requestAs($user), [
            'account_number' => '1234567890',
            'date_from' => '2026-08-01',
            'date_to' => '2026-08-31',
        ]);

        $this->assertSame(1, $out['summary']['transaction_count']);
        $this->assertSame('10000.00', $out['summary']['total_amount']);
    }

    // 6 & 7. Status + direction filtering.
    public function test_status_and_direction_filtering(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['status' => 'successful', 'direction' => 'debit']);
        $this->txn($w, ['status' => 'failed', 'direction' => 'debit']);
        $this->txn($w, ['status' => 'successful', 'direction' => 'credit', 'type' => 'transfer_in']);

        $succ = $this->tool()->handle($this->requestAs($user), ['wallet_id' => $w->id, 'status' => 'successful']);
        $this->assertSame(2, $succ['summary']['transaction_count']);

        $debit = $this->tool()->handle($this->requestAs($user), ['wallet_id' => $w->id, 'direction' => 'debit']);
        $this->assertSame(2, $debit['summary']['transaction_count']);
        $this->assertSame('20000.00', $debit['summary']['total_outgoing']);
    }

    // 8 & 12. Ambiguous recipient handled; empty result handled.
    public function test_ambiguous_recipient_and_empty(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        // Two different "John" recipients.
        $this->txn($w, ['counterparty' => ['kind' => 'user', 'name' => 'John Doe']]);
        $this->txn($w, ['counterparty' => ['kind' => 'user', 'name' => 'Johnny Cash']]);

        $out = $this->tool()->handle($this->requestAs($user), ['recipient' => 'John']);
        $this->assertFalse($out['grouped']);
        $this->assertTrue($out['needs_disambiguation']);
        $this->assertContains('John Doe', $out['candidates']);
        $this->assertContains('Johnny Cash', $out['candidates']);

        // Empty result for a non-existent target.
        $empty = $this->tool()->handle($this->requestAs($user), ['account_number' => '0000000000']);
        $this->assertTrue($empty['grouped']);
        $this->assertSame(0, $empty['summary']['transaction_count']);
        $this->assertSame('0.00', $empty['summary']['total_amount']);
        $this->assertSame([], $empty['transactions']);
    }

    // 9 & 10. Another user's / inaccessible-wallet transactions cannot be returned.
    public function test_cannot_reach_other_users_data(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $aliceW = $this->wallet($alice, 'Alice Main');
        $bobW = $this->wallet($bob, 'Bob Main');
        $this->txn($aliceW);
        $this->txn($bobW); // Bob's — same account number

        // Alice groups by the shared account number → only her 1 transaction.
        $out = $this->tool()->handle($this->requestAs($alice), ['account_number' => '1234567890']);
        $this->assertSame(1, $out['summary']['transaction_count']);

        // Alice groups by Bob's wallet id → rejected (not accessible).
        $out = $this->tool()->handle($this->requestAs($alice), ['wallet_id' => $bobW->id]);
        $this->assertFalse($out['grouped']);
        $this->assertStringContainsStringIgnoringCase("couldn't find that wallet", $out['error']);
    }

    // 11. Shared-wallet permissions: an active member sees the shared wallet's group.
    public function test_active_member_can_group_shared_wallet(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $shared = $this->wallet($owner, 'Family Pot');
        WalletMember::create(['wallet_id' => $shared->id, 'user_id' => $member->id, 'role' => 'contributor', 'status' => 'active']);
        $this->txn($shared, ['amount' => 3_000_000]);

        $out = $this->tool()->handle($this->requestAs($member), ['wallet_id' => $shared->id]);
        $this->assertTrue($out['grouped']);
        $this->assertSame(1, $out['summary']['transaction_count']);
        $this->assertSame('30000.00', $out['summary']['total_amount']);
    }

    // 13 & 14. Pagination + has_more; the grand total spans all pages.
    public function test_pagination_and_grand_total(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        foreach (range(1, 5) as $i) {
            $this->txn($w, ['amount' => 1_000_000]);
        }

        $p1 = $this->tool()->handle($this->requestAs($user), ['wallet_id' => $w->id, 'per_page' => 2, 'page' => 1]);
        $this->assertCount(2, $p1['transactions']);
        $this->assertTrue($p1['has_more']);
        // Grand total spans ALL 5, not just the page of 2.
        $this->assertSame(5, $p1['summary']['transaction_count']);
        $this->assertSame('50000.00', $p1['summary']['total_amount']);

        $p3 = $this->tool()->handle($this->requestAs($user), ['wallet_id' => $w->id, 'per_page' => 2, 'page' => 3]);
        $this->assertCount(1, $p3['transactions']);
        $this->assertFalse($p3['has_more']);
        $this->assertSame(5, $p3['summary']['transaction_count']); // same grand total
    }

    // 16 & 17. Structured transaction_group action end-to-end; no secrets leak.
    public function test_end_to_end_transaction_group_action(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['amount' => 1_000_000]);
        $this->txn($w, ['amount' => 2_500_000]);

        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push(['stop_reason' => 'tool_use', 'content' => [[
                    'type' => 'tool_use', 'id' => 't1', 'name' => 'group_transactions',
                    'input' => ['account_number' => '1234567890'],
                ]]], 200)
                ->push(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'You sent ₦35,000 across 2 transactions.']]], 200),
        ]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'how much have I sent to account 1234567890?']);

        $res->assertOk()
            ->assertJsonPath('data.action.type', 'transaction_group')
            ->assertJsonPath('data.action.target.type', 'bank_account')
            ->assertJsonPath('data.action.target.display', '••••••7890')
            ->assertJsonPath('data.action.summary.transaction_count', 2)
            ->assertJsonPath('data.action.summary.total_amount', '35000.00');

        $raw = $res->getContent();
        $this->assertStringNotContainsStringIgnoringCase('"pin"', $raw);
        $this->assertStringNotContainsString('1234567890', $raw); // full number never exposed
        $this->assertStringNotContainsString('counterparty', $raw);
        $this->assertStringNotContainsString('user_id', $raw);
    }

    // No pin/identity fields in the schema.
    public function test_schema_has_no_identity_or_secret_fields(): void
    {
        $props = $this->tool()->inputSchema()['properties'];
        foreach (['user_id', 'owner_id', 'sender_id', 'pin', 'password', 'otp'] as $f) {
            $this->assertArrayNotHasKey($f, $props, "{$f} must not be in the schema");
        }
        $this->assertFalse($this->tool()->inputSchema()['additionalProperties']);
    }
}
