<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\ApprovalResponse;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\ApproveWithdrawalTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for the approve_withdrawal ACTION tool.
 *
 * The tool reuses ApprovalController (index/show/respond) + ApprovalService, so
 * all authorization (canApprove, not-initiator, pending, not-expired, not-already-
 * responded) and the row-locked, idempotent execution stay in the existing
 * backend. The tool adds only a confirmation gate; it never accepts a PIN or an
 * identity field, and the acting approver is always the Sanctum user.
 */
class AssistantApproveWithdrawalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake([
            '*' => Http::response(['status' => true, 'data' => ['reference' => 'BANKREF']], 200),
        ]);
    }

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function wallet(User $owner, int $required = 2, int $balanceKobo = 0): Wallet
    {
        return Wallet::create([
            'user_id' => $owner->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => $balanceKobo,
            'status' => 'active',
            'approval_enabled' => true,
            'required_approvals' => $required,
        ]);
    }

    private function pendingWithdrawal(Wallet $wallet, User $requester, string $status = 'pending', int $required = 2): ApprovalRequest
    {
        return ApprovalRequest::create([
            'wallet_id' => $wallet->id,
            'initiator_id' => $requester->id,
            'action' => 'withdrawal',
            'amount' => 5_000_000, // ₦50,000
            'fee' => 2000,
            'description' => 'Rent',
            'payload' => [
                'bank_code' => '000',
                'account_number' => '0123456789',
                'account_name' => 'John Doe',
                'bank_name' => 'Test Bank',
            ],
            'required_approvals' => $required,
            'approvals_count' => 0,
            'status' => $status,
            'expires_at' => now()->addHours(48),
        ]);
    }

    /** owner (approver), requester "John", wallet, pending withdrawal. */
    private function scenario(int $required = 2, int $balanceKobo = 0): array
    {
        $owner = User::factory()->create();
        $john = User::factory()->create(['first_name' => 'John', 'last_name' => 'Doe']);
        $wallet = $this->wallet($owner, $required, $balanceKobo);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $john->id, 'role' => 'contributor', 'status' => 'active']);
        $req = $this->pendingWithdrawal($wallet, $john, 'pending', $required);

        return [$owner, $john, $wallet, $req];
    }

    // 1. Authorized approver can approve an eligible pending withdrawal.
    public function test_authorized_user_can_approve(): void
    {
        [$owner, , , $req] = $this->scenario(required: 2); // 2 needed → records, doesn't execute

        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), [
            'approval_request_id' => $req->id,
            'confirmed' => true,
        ]);

        $this->assertTrue($out['approved']);
        $this->assertTrue(
            ApprovalResponse::where('approval_request_id', $req->id)
                ->where('approver_id', $owner->id)
                ->where('decision', 'approve')
                ->exists()
        );
        $this->assertSame(1, $req->refresh()->approvals_count);
        $this->assertSame('pending', $req->status);      // still needs the 2nd approval
        $this->assertSame(0, Transaction::count());       // no money moved yet
    }

    // 2. An unauthorized member (viewer) cannot approve.
    public function test_unauthorized_member_cannot_approve(): void
    {
        [, , $wallet, $req] = $this->scenario();
        $viewer = User::factory()->create();
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $viewer->id, 'role' => 'viewer', 'status' => 'active']);

        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($viewer), [
            'approval_request_id' => $req->id,
            'confirmed' => true,
        ]);

        $this->assertFalse($out['approved']);
        $this->assertStringContainsStringIgnoringCase('approve', $out['error']);
        $this->assertSame(0, ApprovalResponse::count());
    }

    // 3. Another user's withdrawal cannot be accessed.
    public function test_cannot_access_another_users_withdrawal(): void
    {
        [, , , $req] = $this->scenario();
        $stranger = User::factory()->create();

        // Direct id → not accessible.
        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($stranger), [
            'approval_request_id' => $req->id,
            'confirmed' => true,
        ]);
        $this->assertFalse($out['approved']);
        $this->assertSame(0, ApprovalResponse::count());

        // Discovery → not listed for the stranger.
        $list = (new ApproveWithdrawalTool())->handle($this->requestAs($stranger), []);
        $this->assertSame([], $list['pending_withdrawals']);
    }

    // 4. An already-approved request cannot be approved again.
    public function test_already_approved_cannot_be_reapproved(): void
    {
        [$owner, $john, $wallet] = $this->scenario();
        $req = $this->pendingWithdrawal($wallet, $john, 'approved');

        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), [
            'approval_request_id' => $req->id,
            'confirmed' => true,
        ]);

        $this->assertFalse($out['approved']);
        $this->assertStringContainsStringIgnoringCase('no longer pending', $out['error']);
        $this->assertSame(0, ApprovalResponse::count());
    }

    // 5. Rejected / cancelled requests cannot be approved.
    public function test_rejected_or_cancelled_cannot_be_approved(): void
    {
        [$owner, $john, $wallet] = $this->scenario();

        foreach (['rejected', 'cancelled', 'expired'] as $status) {
            $req = $this->pendingWithdrawal($wallet, $john, $status);
            $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), [
                'approval_request_id' => $req->id,
                'confirmed' => true,
            ]);
            $this->assertFalse($out['approved'], "status {$status} must not be approvable");
        }
        $this->assertSame(0, ApprovalResponse::count());
    }

    // 6 & 7. Confirmation is required; confirmed=false performs no write.
    public function test_confirmation_is_required(): void
    {
        [$owner, , , $req] = $this->scenario();

        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), [
            'approval_request_id' => $req->id,
            'confirmed' => false,
        ]);
        $this->assertFalse($out['approved']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame('John Doe', $out['withdrawal']['requester']);
        $this->assertSame('50000.00', $out['withdrawal']['amount']);
        $this->assertSame(0, ApprovalResponse::count());

        // Omitted confirmed → also no write.
        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), ['approval_request_id' => $req->id]);
        $this->assertFalse($out['approved']);
        $this->assertSame(0, ApprovalResponse::count());
    }

    // 8 & 9. No PIN/OTP and no identity fields in the schema.
    public function test_schema_has_no_pin_or_identity_fields(): void
    {
        $props = (new ApproveWithdrawalTool())->inputSchema()['properties'];
        foreach (['pin', 'password', 'otp', 'transaction_pin', 'user_id', 'owner_id', 'approver_id'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $props, "{$forbidden} must not be in the schema");
        }
        $this->assertFalse((new ApproveWithdrawalTool())->inputSchema()['additionalProperties']);
    }

    // 10. Retry does not cause a duplicate approval or duplicate money movement.
    public function test_retry_is_idempotent(): void
    {
        // required=1 so the first approval executes the payout.
        [$owner, $john, $wallet] = $this->scenario(required: 1, balanceKobo: 6_000_000);
        $req = $this->pendingWithdrawal($wallet, $john, 'pending', required: 1);

        $tool = new ApproveWithdrawalTool();
        $first = $tool->handle($this->requestAs($owner), ['approval_request_id' => $req->id, 'confirmed' => true]);
        $this->assertTrue($first['approved']);

        $withdrawals = Transaction::where('type', 'withdrawal')->count();
        $responses = ApprovalResponse::count();

        // Retry the same confirmed approval.
        $second = $tool->handle($this->requestAs($owner), ['approval_request_id' => $req->id, 'confirmed' => true]);
        $this->assertFalse($second['approved']);
        $this->assertStringContainsStringIgnoringCase('no longer pending', $second['error']);

        // No second response, no second withdrawal.
        $this->assertSame($responses, ApprovalResponse::count());
        $this->assertSame($withdrawals, Transaction::where('type', 'withdrawal')->count());
        $this->assertSame(1, $withdrawals);
    }

    // 10b. Same approver approving twice while still pending → "already responded".
    public function test_same_approver_cannot_respond_twice(): void
    {
        // required=3 so one approval keeps it pending (no execution).
        [$owner, $john, $wallet] = $this->scenario();
        $req = $this->pendingWithdrawal($wallet, $john, 'pending', required: 3);
        $tool = new ApproveWithdrawalTool();

        $tool->handle($this->requestAs($owner), ['approval_request_id' => $req->id, 'confirmed' => true]);
        $out = $tool->handle($this->requestAs($owner), ['approval_request_id' => $req->id, 'confirmed' => true]);

        $this->assertFalse($out['approved']);
        $this->assertStringContainsStringIgnoringCase('already responded', $out['error']);
        $this->assertSame(1, ApprovalResponse::where('approval_request_id', $req->id)->count());
    }

    // 11. The existing approval endpoint remains unchanged and still works.
    public function test_existing_approval_endpoint_still_works(): void
    {
        [$owner, , , $req] = $this->scenario();
        Sanctum::actingAs($owner);

        $this->postJson("/api/v1/approvals/{$req->id}/respond", ['decision' => 'approve'])
            ->assertOk()
            ->assertJsonPath('status', true);

        $this->assertTrue(
            ApprovalResponse::where('approval_request_id', $req->id)->where('approver_id', $owner->id)->exists()
        );
    }

    // Discovery finds the pending withdrawal so the AI can match "John's ₦50,000".
    public function test_discovery_lists_pending_withdrawals(): void
    {
        [$owner, , , ] = $this->scenario();

        $out = (new ApproveWithdrawalTool())->handle($this->requestAs($owner), []);

        $this->assertCount(1, $out['pending_withdrawals']);
        $this->assertSame('John Doe', $out['pending_withdrawals'][0]['requester']);
        $this->assertSame('50000.00', $out['pending_withdrawals'][0]['amount']);
        $this->assertSame('Main Wallet', $out['pending_withdrawals'][0]['wallet']);
    }
}
