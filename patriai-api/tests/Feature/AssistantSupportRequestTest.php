<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\SupportRequest;
use App\Models\User;
use App\Services\Assistant\Tools\CreateSupportRequestTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for create_support_request — backend-team escalation.
 *
 * Persists a minimal SupportRequest via SupportService, redacts secrets, masks
 * account numbers, dedupes retries, and notifies admins via the existing
 * NotificationService. Confirmation is a hard gate; no user_id/PIN in the schema.
 */
class AssistantSupportRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
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
            'subject' => 'Transfer pending 3 days',
            'description' => 'My transfer has been pending for 3 days and I do not know why.',
            'category' => 'transfer',
            'confirmed' => true,
        ], $extra);
    }

    // 1 & 4. Authenticated user can create exactly one request.
    public function test_creates_one_support_request(): void
    {
        $user = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload());

        $this->assertTrue($out['created']);
        $this->assertSame(1, SupportRequest::count());
        $sr = SupportRequest::first();
        $this->assertSame('transfer', $sr->category);
        $this->assertSame('pending', $sr->status);
        $this->assertSame('Transfer pending 3 days', $out['support_request']['subject']);
    }

    // 2. Unauthenticated request is rejected.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'contact support'])
            ->assertStatus(401);
    }

    // 3. confirmed=false / omitted creates nothing.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload(['confirmed' => false]));
        $this->assertFalse($out['created']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame(0, SupportRequest::count());

        $p = $this->payload();
        unset($p['confirmed']);
        (new CreateSupportRequestTool())->handle($this->requestAs($user), $p);
        $this->assertSame(0, SupportRequest::count());
    }

    // 5. Retry does not create a duplicate.
    public function test_retry_does_not_duplicate(): void
    {
        $user = User::factory()->create();
        $tool = new CreateSupportRequestTool();

        $a = $tool->handle($this->requestAs($user), $this->payload());
        $b = $tool->handle($this->requestAs($user), $this->payload());

        $this->assertTrue($a['created']);
        $this->assertTrue($b['created']);
        $this->assertTrue($b['duplicate']);
        $this->assertSame($a['support_request']['id'], $b['support_request']['id']);
        $this->assertSame(1, SupportRequest::count());
    }

    // A genuinely different problem still creates a separate request.
    public function test_different_problem_creates_new_request(): void
    {
        $user = User::factory()->create();
        $tool = new CreateSupportRequestTool();

        $tool->handle($this->requestAs($user), $this->payload());
        $tool->handle($this->requestAs($user), $this->payload(['subject' => 'Cannot verify my BVN', 'description' => 'KYC keeps failing.']));

        $this->assertSame(2, SupportRequest::count());
    }

    // 6. Support notification is triggered to admins (existing NotificationService).
    public function test_notifies_admin_team(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $user = User::factory()->create();

        (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload());

        $this->assertSame(1, AppNotification::where('user_id', $admin->id)->where('type', 'support_request')->count());
    }

    // 7 & 8. Identity comes from auth; a smuggled user_id cannot reassign ownership.
    public function test_request_always_belongs_to_authenticated_user(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($alice), $this->payload(['user_id' => $bob->id]));

        $this->assertTrue($out['created']);
        $this->assertSame($alice->id, SupportRequest::first()->user_id);
        $this->assertSame(0, SupportRequest::where('user_id', $bob->id)->count());
    }

    // 9, 10, 11. No pin/otp/password (or other identity/secret) field in the schema.
    public function test_schema_has_no_secret_or_identity_fields(): void
    {
        $props = (new CreateSupportRequestTool())->inputSchema()['properties'];
        foreach (['pin', 'otp', 'password', 'transaction_pin', 'auth_token', 'token', 'user_id', 'owner_id', 'approver_id'] as $f) {
            $this->assertArrayNotHasKey($f, $props, "{$f} must not be in the schema");
        }
        $this->assertFalse((new CreateSupportRequestTool())->inputSchema()['additionalProperties']);
    }

    // 12 & 13. Secrets are not persisted; account numbers are masked.
    public function test_secrets_redacted_and_account_masked_in_storage(): void
    {
        $user = User::factory()->create();

        (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload([
            'subject' => 'Issue with account 1234567890',
            'description' => 'My pin is 4321 and my token is abcdefghij1234567890 for account 1234567890.',
        ]));

        $sr = SupportRequest::first();
        // No secret values persisted.
        $this->assertStringNotContainsString('4321', $sr->description);
        $this->assertStringNotContainsString('abcdefghij1234567890', $sr->description);
        // Full account number never stored; masked instead.
        $this->assertStringNotContainsString('1234567890', $sr->description);
        $this->assertStringNotContainsString('1234567890', $sr->subject);
        $this->assertStringContainsString('••••••7890', $sr->subject);
    }

    // 14. A provided reference is stored (redacted) and the request is the user's own.
    public function test_reference_is_stored_and_scoped(): void
    {
        $user = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload([
            'reference' => 'PTR260811ABC',
        ]));

        $this->assertTrue($out['created']);
        $sr = SupportRequest::first();
        $this->assertSame('PTR260811ABC', $sr->reference);
        $this->assertSame($user->id, $sr->user_id);
    }

    // 15. An unknown/unresolvable issue can be escalated.
    public function test_unknown_issue_can_be_escalated(): void
    {
        $user = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($user), $this->payload([
            'subject' => 'App behaving strangely',
            'description' => 'The balance on my dashboard looks wrong and I cannot explain it.',
            'category' => 'other',
        ]));

        $this->assertTrue($out['created']);
        $this->assertSame('other', SupportRequest::first()->category);
    }

    // Missing subject/description is rejected before any write.
    public function test_missing_fields_rejected(): void
    {
        $user = User::factory()->create();

        $out = (new CreateSupportRequestTool())->handle($this->requestAs($user), ['subject' => '', 'description' => 'x', 'confirmed' => true]);
        $this->assertFalse($out['created']);
        $this->assertSame(0, SupportRequest::count());
    }

    // 16 & 17. End-to-end: the assistant surfaces a support_request action; no secret leaks.
    public function test_end_to_end_support_request_action(): void
    {
        config(['services.anthropic.api_key' => 'test-key']);
        $user = User::factory()->create();

        Http::fake([
            'api.anthropic.com/*' => Http::sequence()
                ->push(['stop_reason' => 'tool_use', 'content' => [[
                    'type' => 'tool_use', 'id' => 't1', 'name' => 'create_support_request',
                    'input' => ['subject' => 'Transfer stuck', 'description' => 'Pending 3 days.', 'category' => 'transfer', 'confirmed' => true],
                ]]], 200)
                ->push(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => "Done. I've sent your issue to support."]]], 200),
        ]);
        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/assistant/chat', ['message' => 'my transfer has been pending for days, contact support']);

        $res->assertOk()
            ->assertJsonPath('data.action.type', 'support_request')
            ->assertJsonPath('data.action.category', 'transfer')
            ->assertJsonPath('data.action.status', 'pending');
        $this->assertNotNull($res->json('data.action.request_id'));

        $this->assertStringNotContainsStringIgnoringCase('"pin"', $res->getContent());
        $this->assertSame(1, SupportRequest::where('user_id', $user->id)->count());
    }
}
