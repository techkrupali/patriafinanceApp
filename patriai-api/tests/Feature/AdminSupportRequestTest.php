<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\SupportRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for the admin support-request management API (list / show / status).
 * Admin-only, reuses SupportRequest + SupportService redaction + NotificationService.
 */
class AdminSupportRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function requester(): User
    {
        return User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Lovelace']);
    }

    private function support(User $user, array $attrs = []): SupportRequest
    {
        return SupportRequest::create(array_merge([
            'user_id' => $user->id,
            'subject' => 'Transfer pending 3 days',
            'category' => 'transfer',
            'description' => 'My transfer to 1234567890 is stuck and my pin is 4321.',
            'reference' => 'PTR260811ABC',
            'status' => 'pending',
            'priority' => 'medium',
        ], $attrs));
    }

    // Admin can list requests.
    public function test_admin_can_list(): void
    {
        $admin = $this->admin();
        $this->support($this->requester());
        $this->support($this->requester(), ['subject' => 'KYC issue', 'category' => 'account']);
        Sanctum::actingAs($admin);

        $res = $this->getJson('/api/v1/admin/support-requests');

        $res->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(2, 'data.support_requests')
            ->assertJsonPath('data.pagination.total', 2);
    }

    // Admin can view a single request (full description).
    public function test_admin_can_view(): void
    {
        $admin = $this->admin();
        $sr = $this->support($this->requester());
        Sanctum::actingAs($admin);

        $res = $this->getJson("/api/v1/admin/support-requests/{$sr->id}");

        $res->assertOk()
            ->assertJsonPath('data.support_request.id', $sr->id)
            ->assertJsonPath('data.support_request.user.name', 'Ada Lovelace')
            ->assertJsonPath('data.support_request.category', 'transfer');
        $this->assertArrayHasKey('description', $res->json('data.support_request'));
    }

    // Non-admin cannot list.
    public function test_non_admin_cannot_list(): void
    {
        Sanctum::actingAs(User::factory()->create()); // role user
        $this->getJson('/api/v1/admin/support-requests')->assertStatus(403);
    }

    // Non-admin cannot view.
    public function test_non_admin_cannot_view(): void
    {
        $sr = $this->support($this->requester());
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/admin/support-requests/{$sr->id}")->assertStatus(403);
    }

    // Unauthenticated is rejected.
    public function test_unauthenticated_rejected(): void
    {
        $this->getJson('/api/v1/admin/support-requests')->assertStatus(401);
    }

    // Filter by status / category / priority.
    public function test_filters(): void
    {
        $admin = $this->admin();
        $u = $this->requester();
        $this->support($u, ['status' => 'pending', 'category' => 'transfer', 'priority' => 'medium']);
        $this->support($u, ['status' => 'resolved', 'category' => 'account', 'priority' => 'high']);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/support-requests?status=resolved')->assertJsonCount(1, 'data.support_requests');
        $this->getJson('/api/v1/admin/support-requests?category=transfer')->assertJsonCount(1, 'data.support_requests');
        $this->getJson('/api/v1/admin/support-requests?priority=high')->assertJsonCount(1, 'data.support_requests');
    }

    // Search by id / subject / user name / reference.
    public function test_search(): void
    {
        $admin = $this->admin();
        $sr = $this->support($this->requester(), ['subject' => 'Weird balance']);
        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/admin/support-requests?search={$sr->id}")->assertJsonCount(1, 'data.support_requests');
        $this->getJson('/api/v1/admin/support-requests?search=Weird')->assertJsonCount(1, 'data.support_requests');
        $this->getJson('/api/v1/admin/support-requests?search=Ada')->assertJsonCount(1, 'data.support_requests');
        $this->getJson('/api/v1/admin/support-requests?search=PTR260811ABC')->assertJsonCount(1, 'data.support_requests');
    }

    // Admin can advance status (forward transitions) and the user is notified.
    public function test_admin_can_update_status_and_user_notified(): void
    {
        $admin = $this->admin();
        $user = $this->requester();
        $sr = $this->support($user);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'in_review'])
            ->assertOk()
            ->assertJsonPath('data.support_request.status', 'in_review');
        $this->assertSame('in_review', $sr->refresh()->status);

        // Requesting user gets a notification.
        $this->assertSame(1, AppNotification::where('user_id', $user->id)->where('type', 'support_request_updated')->count());

        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'resolved'])->assertOk();
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'closed'])->assertOk();
        $this->assertSame('closed', $sr->refresh()->status);
    }

    // Invalid backward / skipping transitions are rejected.
    public function test_invalid_transition_rejected(): void
    {
        $admin = $this->admin();
        $sr = $this->support($this->requester());
        Sanctum::actingAs($admin);

        // pending → resolved (skips in_review) is invalid.
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'resolved'])->assertStatus(422);
        // pending → pending (no-op) is invalid.
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'pending'])->assertStatus(422);

        $sr->update(['status' => 'resolved']);
        // resolved → in_review (backwards) is invalid.
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'in_review'])->assertStatus(422);
        $this->assertSame('resolved', $sr->refresh()->status);
    }

    // Non-admin cannot update status.
    public function test_non_admin_cannot_update_status(): void
    {
        $sr = $this->support($this->requester());
        Sanctum::actingAs(User::factory()->create());
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'in_review'])->assertStatus(403);
        $this->assertSame('pending', $sr->refresh()->status);
    }

    // An unknown status value is rejected by validation.
    public function test_unknown_status_rejected(): void
    {
        $admin = $this->admin();
        $sr = $this->support($this->requester());
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/support-requests/{$sr->id}/status", ['status' => 'archived'])->assertStatus(422);
    }

    // Secrets stay redacted and the full account number is never exposed in admin output.
    public function test_secrets_redacted_and_account_masked_in_admin_output(): void
    {
        $admin = $this->admin();
        // A row whose raw text still contains a secret (defensive re-redaction on read).
        $sr = $this->support($this->requester(), [
            'subject' => 'Problem with 1234567890',
            'description' => 'my pin is 4321 and account 1234567890 failed',
        ]);
        Sanctum::actingAs($admin);

        $detail = $this->getJson("/api/v1/admin/support-requests/{$sr->id}");
        $raw = $detail->getContent();
        $sub = $detail->json('data.support_request.subject');
        $desc = $detail->json('data.support_request.description');

        $this->assertStringNotContainsString('1234567890', $raw);  // full account never exposed
        $this->assertStringContainsString('••••••7890', $sub);     // masked instead (decoded)
        $this->assertStringContainsString('••••••7890', $desc);
        $this->assertStringNotContainsString('4321', $raw);        // pin value never exposed

        // List view also masks.
        $list = $this->getJson('/api/v1/admin/support-requests');
        $this->assertStringNotContainsString('1234567890', $list->getContent());
        $this->assertStringContainsString('••••••7890', $list->json('data.support_requests.0.subject'));
    }
}
