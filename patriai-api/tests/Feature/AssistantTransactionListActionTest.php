<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Verifies that POST /assistant/chat surfaces find_transactions results as a
 * structured `transaction_list` action — reusing the authorized, scoped output of
 * the existing tool. The LLM is faked so the tool loop runs deterministically.
 */
class AssistantTransactionListActionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.anthropic.api_key' => 'test-key']);
    }

    /** Fake the LLM: turn 1 calls find_transactions(input), turn 2 replies with text. */
    private function fakeFindTransactions(array $input): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push([
                    'stop_reason' => 'tool_use',
                    'content' => [[
                        'type' => 'tool_use',
                        'id' => 'toolu_1',
                        'name' => 'find_transactions',
                        'input' => $input,
                    ]],
                ], 200)
                ->push([
                    'stop_reason' => 'end_turn',
                    'content' => [['type' => 'text', 'text' => 'Here are your transactions.']],
                ], 200),
        ]);
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
            'counterparty' => ['kind' => 'wallet', 'wallet_name' => 'Johns Wallet', 'owner' => 'John Doe'],
        ], $attrs));
    }

    public function test_returns_transaction_list_action_with_fields_and_summary(): void
    {
        $user = User::factory()->create();
        $w = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => 0, 'status' => 'active']);
        $this->txn($w);
        $this->txn($w, ['amount' => 2_500_000]); // ₦25,000

        $this->fakeFindTransactions([]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'show my transactions']);

        $res->assertOk()
            ->assertJsonPath('data.action.type', 'transaction_list')
            ->assertJsonPath('data.action.summary.count', 2)
            ->assertJsonPath('data.action.summary.total_transactions', 2)
            ->assertJsonPath('data.action.summary.total_amount', '35000.00') // ₦10k + ₦25k
            ->assertJsonPath('data.action.has_more', false);

        $rows = $res->json('data.action.transactions');
        $this->assertCount(2, $rows);
        // Exposes the expected safe fields.
        foreach (['id', 'reference', 'date', 'type', 'direction', 'amount', 'status', 'wallet', 'recipient'] as $key) {
            $this->assertArrayHasKey($key, $rows[0]);
        }
        $this->assertSame('Main Wallet', $rows[0]['wallet']);

        // No sensitive/internal fields leak.
        $raw = $res->getContent();
        $this->assertStringNotContainsStringIgnoringCase('"pin"', $raw);
        $this->assertStringNotContainsString('counterparty', $raw);
        $this->assertStringNotContainsString('user_id', $raw);
    }

    public function test_pagination_has_more_is_surfaced(): void
    {
        $user = User::factory()->create();
        $w = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => 0, 'status' => 'active']);
        foreach (range(1, 5) as $i) {
            $this->txn($w);
        }

        $this->fakeFindTransactions(['per_page' => 2, 'page' => 1]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'show my transactions']);

        $res->assertOk()
            ->assertJsonPath('data.action.summary.count', 2)
            ->assertJsonPath('data.action.summary.total_transactions', 5)
            ->assertJsonPath('data.action.page', 1)
            ->assertJsonPath('data.action.per_page', 2)
            ->assertJsonPath('data.action.has_more', true);
    }

    public function test_empty_result_is_handled(): void
    {
        $user = User::factory()->create();
        Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => 0, 'status' => 'active']);

        $this->fakeFindTransactions(['status' => 'failed']); // none
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'show my failed transactions']);

        $res->assertOk()
            ->assertJsonPath('data.action.type', 'transaction_list')
            ->assertJsonPath('data.action.summary.count', 0)
            ->assertJsonPath('data.action.summary.total_amount', '0.00')
            ->assertJsonPath('data.action.has_more', false);
        $this->assertSame([], $res->json('data.action.transactions'));
    }

    public function test_only_the_users_authorized_transactions_appear(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $aliceW = Wallet::create(['user_id' => $alice->id, 'type' => 'main', 'name' => 'Alice Main', 'balance' => 0, 'status' => 'active']);
        $bobW = Wallet::create(['user_id' => $bob->id, 'type' => 'main', 'name' => 'Bob Main', 'balance' => 0, 'status' => 'active']);
        $this->txn($aliceW);
        $this->txn($bobW); // Bob's — must never appear for Alice

        $this->fakeFindTransactions([]);
        Sanctum::actingAs($alice);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'show my transactions']);

        $res->assertOk()->assertJsonPath('data.action.summary.count', 1);
        $walletNames = collect($res->json('data.action.transactions'))->pluck('wallet')->all();
        $this->assertSame(['Alice Main'], $walletNames);
    }

    public function test_display_is_capped_at_50(): void
    {
        $user = User::factory()->create();
        $w = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => 0, 'status' => 'active']);
        foreach (range(1, 60) as $i) {
            $this->txn($w);
        }

        // Model asks for 100 (the tool's cap), but the display action caps at 50.
        $this->fakeFindTransactions(['per_page' => 100]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'show all my transactions']);

        $res->assertOk()->assertJsonPath('data.action.summary.count', 50);
        $this->assertCount(50, $res->json('data.action.transactions'));
        $res->assertJsonPath('data.action.has_more', true);
    }
}
