<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Assistant\Tools\AppKnowledgeTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for get_app_info (App Knowledge & Basic Support).
 *
 * Content is grounded in the real app (config fee, KycService limits, documented
 * behaviour). The tool performs no financial action and exposes no secret.
 */
class AssistantAppKnowledgeTest extends TestCase
{
    use RefreshDatabase;

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function tool(): AppKnowledgeTool
    {
        return new AppKnowledgeTool();
    }

    private function ask(?string $topic): array
    {
        $user = User::factory()->make();

        return $this->tool()->handle($this->requestAs($user), $topic === null ? [] : ['topic' => $topic]);
    }

    // Common app / how-to questions return grounded answers.
    public function test_how_to_questions_return_articles(): void
    {
        foreach (['creating_a_wallet', 'sending_money', 'bank_transfers', 'withdrawals', 'approvals', 'automations', 'transaction_history', 'disputes'] as $topic) {
            $out = $this->ask($topic);
            $this->assertTrue($out['found'], "topic {$topic} should be found");
            $this->assertNotEmpty($out['answer']);
        }
    }

    // Fee answer reflects the real config value.
    public function test_fees_answer_uses_real_config(): void
    {
        $fee = number_format(((int) config('services.matrix.transfer_fee_kobo', 2000)) / 100, 2, '.', '');
        $out = $this->ask('fees');
        $this->assertStringContainsString('₦'.$fee, $out['answer']);
        $this->assertStringContainsStringIgnoringCase('free', $out['answer']);
    }

    // Limits answer reflects the real KYC tier numbers.
    public function test_limits_answer_uses_real_kyc_tiers(): void
    {
        $out = $this->ask('limits');
        $this->assertStringContainsString('₦200,000', $out['answer']); // tier 0-1 daily
        $this->assertStringContainsString('₦2,000,000', $out['answer']); // tier 2 daily
        $this->assertStringContainsString('25 wallets', $out['answer']); // tier 3 wallets
    }

    // Pending/failed explanation is present and accurate (no invented cause).
    public function test_pending_failed_explanation(): void
    {
        $out = $this->ask('pending_or_failed');
        $this->assertStringContainsStringIgnoringCase('approval', $out['answer']);
        $this->assertStringContainsStringIgnoringCase('refunded', $out['answer']);
        $this->assertStringContainsStringIgnoringCase('reversed', $out['answer']);
    }

    // Aliases resolve to the right article (natural phrasing).
    public function test_aliases_resolve(): void
    {
        $this->assertSame('sending_money', $this->ask('transfer')['topic']);
        $this->assertSame('pin_and_security', $this->ask('security')['topic']);
        $this->assertSame('pending_or_failed', $this->ask('why pending')['topic']);
        $this->assertSame('getting_support', $this->ask('help')['topic']);
    }

    // Unknown question → found=false with topic list (hallucination prevention).
    public function test_unknown_question_is_not_answered(): void
    {
        $out = $this->ask('what is the weather in Lagos');
        $this->assertFalse($out['found']);
        $this->assertNotEmpty($out['available_topics']);
        $this->assertStringContainsStringIgnoringCase('do not guess', $out['message']);
    }

    // No topic → lists what it can answer.
    public function test_no_topic_lists_available(): void
    {
        $out = $this->ask(null);
        $this->assertFalse($out['found']);
        $this->assertGreaterThanOrEqual(15, count($out['available_topics']));
    }

    // No secret is ever present in any article, and none is requested.
    public function test_no_secret_leakage_across_all_articles(): void
    {
        $user = User::factory()->make();
        $req = $this->requestAs($user);
        $out = $this->tool()->handle($req, []); // full topic list
        $json = json_encode($out);

        // Iterate every article and assert it never exposes a secret value.
        foreach ($out['available_topics'] as $t) {
            $answer = $this->tool()->handle($req, ['topic' => $t['topic']])['answer'];
            // The PIN article talks ABOUT the PIN but must never expose/ask for one.
            $this->assertStringNotContainsString('your PIN is', $answer);
            $this->assertDoesNotMatchRegularExpression('/\b\d{4,}\s*(is your|pin|otp|code)\b/i', $answer);
        }
        $this->assertStringNotContainsStringIgnoringCase('password:', $json);
    }

    // Schema has no identity/secret fields.
    public function test_schema_is_minimal_and_safe(): void
    {
        $props = $this->tool()->inputSchema()['properties'];
        foreach (['user_id', 'owner_id', 'pin', 'password', 'otp'] as $f) {
            $this->assertArrayNotHasKey($f, $props);
        }
        $this->assertFalse($this->tool()->inputSchema()['additionalProperties']);
    }

    // The endpoint requires authentication (scoping).
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'how do fees work?'])
            ->assertStatus(401);
    }

    // End-to-end: an app-knowledge question yields a text reply and no financial action/action payload.
    public function test_end_to_end_knowledge_answer_has_no_action(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        $user = User::factory()->create();

        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push(['stop_reason' => 'tool_use', 'content' => [[
                    'type' => 'tool_use', 'id' => 't1', 'name' => 'get_app_info', 'input' => ['topic' => 'fees'],
                ]]], 200)
                ->push(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => 'External bank transfers cost ₦20; wallet-to-wallet is free.']]], 200),
        ]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'how do fees work?']);

        $res->assertOk()
            ->assertJsonPath('data.action', null); // informational only — no action/UI payload
        $this->assertNotEmpty($res->json('data.reply'));
        $this->assertStringNotContainsStringIgnoringCase('"pin"', $res->getContent());
    }
}
