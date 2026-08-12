<?php

namespace Tests\Feature;

use App\Models\Dispute;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\FlagTransactionTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Coverage for the flag_transaction ACTION tool.
 *
 * Flagging reuses the Dispute Center (DisputeController::store). The transaction
 * is located with find_transactions scoping (accessible wallets only), so a user
 * can only flag transactions they can see. The tool adds a confirmation gate and
 * a scoped duplicate guard; it accepts no user_id and no PIN.
 */
class AssistantFlagTransactionTest extends TestCase
{
    use RefreshDatabase;

    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    private function wallet(User $user, string $name = 'Main Wallet'): Wallet
    {
        return Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => $name, 'balance' => 0, 'status' => 'active']);
    }

    private function txn(Wallet $wallet, array $attrs = []): Transaction
    {
        return Transaction::create(array_merge([
            'reference' => Transaction::generateReference(),
            'wallet_id' => $wallet->id,
            'user_id' => $wallet->user_id,
            'type' => 'transfer_out',
            'direction' => 'debit',
            'amount' => 2_500_000, // ₦25,000
            'status' => 'successful',
            'description' => 'Payment',
            'counterparty' => ['kind' => 'wallet', 'wallet_name' => 'Johns Wallet', 'owner' => 'John Doe'],
        ], $attrs));
    }

    private function payload(string $reference, array $extra = []): array
    {
        return array_merge([
            'transaction_reference' => $reference,
            'reason' => 'I did not authorize this',
            'confirmed' => true,
        ], $extra);
    }

    // 1. Authorized user can flag an eligible transaction.
    public function test_authorized_user_can_flag(): void
    {
        $user = User::factory()->create();
        $t = $this->txn($this->wallet($user));

        $out = (new FlagTransactionTool())->handle($this->requestAs($user), $this->payload($t->reference));

        $this->assertTrue($out['flagged']);
        $this->assertSame(1, Dispute::where('user_id', $user->id)->where('reference', $t->reference)->count());
        $d = Dispute::first();
        $this->assertSame('transaction', $d->category);
        $this->assertSame('I did not authorize this', $d->description);
        $this->assertSame('open', $d->status);
    }

    // 2. Another user's transaction cannot be flagged.
    public function test_cannot_flag_another_users_transaction(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $bobTxn = $this->txn($this->wallet($bob, 'Bob Main'));

        $out = (new FlagTransactionTool())->handle($this->requestAs($alice), $this->payload($bobTxn->reference));

        $this->assertFalse($out['flagged']);
        $this->assertStringContainsStringIgnoringCase("couldn't find", $out['error']);
        $this->assertSame(0, Dispute::count());
    }

    // 3. A transaction in a wallet the user cannot access cannot be flagged (viewer sees, others don't).
    public function test_inaccessible_wallet_transaction_cannot_be_flagged(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $shared = $this->wallet($owner, 'Family Pot');
        $t = $this->txn($shared);
        // stranger is NOT a member → cannot see it.

        $out = (new FlagTransactionTool())->handle($this->requestAs($stranger), $this->payload($t->reference));

        $this->assertFalse($out['flagged']);
        $this->assertSame(0, Dispute::count());
    }

    // 3b. An active member CAN flag a shared-wallet transaction they can see.
    public function test_active_member_can_flag_shared_wallet_transaction(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $shared = $this->wallet($owner, 'Family Pot');
        WalletMember::create(['wallet_id' => $shared->id, 'user_id' => $member->id, 'role' => 'contributor', 'status' => 'active']);
        $t = $this->txn($shared);

        $out = (new FlagTransactionTool())->handle($this->requestAs($member), $this->payload($t->reference));

        $this->assertTrue($out['flagged']);
        $this->assertSame($member->id, Dispute::first()->user_id); // filed by the member
    }

    // 4 & 5. Confirmation is required; confirmed=false performs no write.
    public function test_confirmation_is_required(): void
    {
        $user = User::factory()->create();
        $t = $this->txn($this->wallet($user));

        $out = (new FlagTransactionTool())->handle($this->requestAs($user), $this->payload($t->reference, ['confirmed' => false]));
        $this->assertFalse($out['flagged']);
        $this->assertTrue($out['needs_confirmation']);
        $this->assertSame('25000.00', $out['transaction']['amount']);
        $this->assertSame(0, Dispute::count());

        // Omitted confirmed → still no write.
        $p = $this->payload($t->reference);
        unset($p['confirmed']);
        $out = (new FlagTransactionTool())->handle($this->requestAs($user), $p);
        $this->assertFalse($out['flagged']);
        $this->assertSame(0, Dispute::count());
    }

    // 6. Multiple similar transactions are flagged by their unique reference (only one).
    public function test_only_the_referenced_transaction_is_flagged(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $t1 = $this->txn($w); // both ₦25,000 to "John"
        $t2 = $this->txn($w);

        (new FlagTransactionTool())->handle($this->requestAs($user), $this->payload($t1->reference));

        $this->assertSame(1, Dispute::count());
        $this->assertSame($t1->reference, Dispute::first()->reference);
        $this->assertNotSame($t2->reference, Dispute::first()->reference);
    }

    // 7 & 11. Already-flagged transaction is handled safely; retry creates no duplicate.
    public function test_retry_does_not_create_duplicate_flag(): void
    {
        $user = User::factory()->create();
        $t = $this->txn($this->wallet($user));
        $tool = new FlagTransactionTool();

        $first = $tool->handle($this->requestAs($user), $this->payload($t->reference));
        $this->assertTrue($first['flagged']);

        $second = $tool->handle($this->requestAs($user), $this->payload($t->reference));
        $this->assertFalse($second['flagged']);
        $this->assertTrue($second['already_flagged']);

        $this->assertSame(1, Dispute::where('reference', $t->reference)->count());
    }

    // 8. Unauthorized (unauthenticated) request is rejected at the endpoint.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'flag a transaction'])
            ->assertStatus(401);
    }

    // 9 & 10. No identity fields and no PIN/OTP in the schema.
    public function test_schema_has_no_identity_or_secret_fields(): void
    {
        $props = (new FlagTransactionTool())->inputSchema()['properties'];
        foreach (['user_id', 'owner_id', 'pin', 'password', 'otp', 'transaction_pin'] as $forbidden) {
            $this->assertArrayNotHasKey($forbidden, $props, "{$forbidden} must not be in the schema");
        }
        $this->assertFalse((new FlagTransactionTool())->inputSchema()['additionalProperties']);
    }

    // 12. The existing dispute endpoint continues to work unchanged.
    public function test_existing_dispute_endpoint_still_works(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/disputes', [
            'subject' => 'Test dispute',
            'category' => 'transaction',
            'reference' => 'PTRXYZ',
            'description' => 'Something looks wrong.',
        ])->assertStatus(201)->assertJsonPath('status', true);

        $this->assertSame(1, Dispute::where('user_id', $user->id)->count());
    }

    // A missing reason is rejected before any write.
    public function test_missing_reason_is_rejected(): void
    {
        $user = User::factory()->create();
        $t = $this->txn($this->wallet($user));

        $out = (new FlagTransactionTool())->handle($this->requestAs($user), [
            'transaction_reference' => $t->reference,
            'reason' => '',
            'confirmed' => true,
        ]);

        $this->assertFalse($out['flagged']);
        $this->assertStringContainsStringIgnoringCase('reason', $out['error']);
        $this->assertSame(0, Dispute::count());
    }
}
