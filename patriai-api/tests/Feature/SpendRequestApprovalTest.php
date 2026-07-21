<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A request-only member raises a spend request; the wallet owner approves it;
 * the vetted approval executor then moves the money exactly once.
 */
class SpendRequestApprovalTest extends TestCase
{
    use RefreshDatabase;

    public function test_spend_request_approved_by_owner_executes_and_debits_once(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();

        $shared = Wallet::create([
            'user_id' => $owner->id,
            'type' => 'shared',
            'name' => 'Family Wallet',
            'balance' => 100_000, // ₦1,000.00
        ]);

        // Contributor without a spend grant: may REQUEST but cannot move money out.
        WalletMember::create([
            'wallet_id' => $shared->id,
            'user_id' => $member->id,
            'role' => 'contributor',
            'status' => 'active',
        ]);

        $memberMain = Wallet::create([
            'user_id' => $member->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => 0,
        ]);

        $this->assertFalse($shared->canSpend($member));
        $this->assertTrue($shared->canRequest($member));

        // 1. Member submits the spend request (no money moves yet).
        Sanctum::actingAs($member);
        $res = $this->postJson("/api/v1/wallets/{$shared->id}/spend-requests", [
            'amount' => '100', // ₦100.00 = 10,000 kobo
            'pin' => '1234',
            'description' => 'School supplies',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $memberMain->id],
        ]);

        $res->assertOk()->assertJsonPath('data.pending_approval', true);
        $approvalId = $res->json('data.approval.id');
        $this->assertNotNull($approvalId);
        $this->assertSame(100_000, $shared->refresh()->balance);
        $this->assertSame('pending', ApprovalRequest::find($approvalId)->status);

        // 2. Owner approves — the executor performs the transfer.
        Sanctum::actingAs($owner);
        $approve = $this->postJson("/api/v1/approvals/{$approvalId}/respond", ['decision' => 'approve']);
        $approve->assertOk()->assertJsonPath('data.approval.status', 'executed');

        // 3. Money moved exactly once.
        $this->assertSame(90_000, $shared->refresh()->balance);
        $this->assertSame(10_000, $memberMain->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $shared->id)->where('type', 'transfer_out')->count());
        $this->assertSame(1, Transaction::where('wallet_id', $memberMain->id)->where('type', 'transfer_in')->count());
        $this->assertSame('executed', ApprovalRequest::find($approvalId)->status);
    }
}
