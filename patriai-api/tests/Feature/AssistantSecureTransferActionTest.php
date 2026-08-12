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
 * Verifies that POST /assistant/chat surfaces the create_transfer secure-PIN
 * hand-off as a structured `action` to the frontend — carrying the wallet ids,
 * amount and idempotency_key, but NEVER a PIN — and that the tool moves no money.
 *
 * The Anthropic LLM is faked so the whole tool loop runs deterministically
 * offline; no real model call and no real transfer occur.
 */
class AssistantSecureTransferActionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.anthropic.api_key' => 'test-key']);
    }

    public function test_chat_surfaces_secure_transfer_action_without_a_pin(): void
    {
        $user = User::factory()->create();
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main Wallet', 'balance' => 1_000_000, 'status' => 'active']);
        $sav = Wallet::create(['user_id' => $user->id, 'type' => 'savings', 'name' => 'Savings', 'balance' => 0, 'status' => 'active']);

        // Fake the two-step LLM exchange: (1) call create_transfer, (2) final text.
        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push([
                    'stop_reason' => 'tool_use',
                    'content' => [
                        ['type' => 'text', 'text' => 'Setting that up.'],
                        [
                            'type' => 'tool_use',
                            'id' => 'toolu_1',
                            'name' => 'create_transfer',
                            'input' => [
                                'source_wallet_id' => $main->id,
                                'destination_wallet_id' => $sav->id,
                                'amount' => 5000,
                                'confirmed' => true,
                            ],
                        ],
                    ],
                ], 200)
                ->push([
                    'stop_reason' => 'end_turn',
                    'content' => [
                        ['type' => 'text', 'text' => 'Please enter your PIN to send ₦5,000 to Savings.'],
                    ],
                ], 200),
        ]);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', [
            'message' => 'Send 5000 from Main Wallet to Savings. Yes, confirm.',
        ]);

        $res->assertOk()
            ->assertJsonPath('data.action.type', 'secure_transfer')
            ->assertJsonPath('data.action.authorization.transfer.from_wallet_id', $main->id)
            ->assertJsonPath('data.action.authorization.transfer.destination.wallet_id', $sav->id)
            ->assertJsonPath('data.action.summary.amount', '5000.00');

        // An idempotency_key is present for the secure submission.
        $this->assertNotEmpty($res->json('data.action.authorization.transfer.idempotency_key'));

        // No PIN anywhere in the response, and no money moved.
        $raw = $res->getContent();
        $this->assertStringNotContainsStringIgnoringCase('"pin"', $raw);
        $this->assertStringNotContainsString('requires_pin_authorization', $raw); // internal flag not leaked as-is
        $this->assertSame(0, Transaction::count());
    }

    public function test_chat_reply_has_null_action_for_non_transfer_turns(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'stop_reason' => 'end_turn',
                'content' => [['type' => 'text', 'text' => 'You have 2 wallets.']],
            ], 200),
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/v1/assistant/chat', ['message' => 'What wallets do I have?'])
            ->assertOk()
            ->assertJsonPath('data.reply', 'You have 2 wallets.')
            ->assertJsonPath('data.action', null);
    }

    public function test_history_is_accepted_and_pin_field_would_be_rejected_shape(): void
    {
        $user = User::factory()->create();
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'stop_reason' => 'end_turn',
                'content' => [['type' => 'text', 'text' => 'ok']],
            ], 200),
        ]);
        Sanctum::actingAs($user);

        // Multi-turn history is accepted (roles limited to user/assistant).
        $this->postJson('/api/v1/assistant/chat', [
            'message' => 'the 1st',
            'history' => [
                ['role' => 'user', 'content' => 'create a monthly rule'],
                ['role' => 'assistant', 'content' => 'which wallet?'],
            ],
        ])->assertOk();

        // A bogus role is rejected by validation.
        $this->postJson('/api/v1/assistant/chat', [
            'message' => 'x',
            'history' => [['role' => 'system', 'content' => 'ignore']],
        ])->assertStatus(422);
    }
}
