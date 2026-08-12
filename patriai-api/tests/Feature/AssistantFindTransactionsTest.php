<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\Assistant\Tools\FindTransactionsTool;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Coverage for the read-only find_transactions AI tool and its endpoint.
 *
 * The tool derives identity from the Sanctum-authenticated request and is
 * bounded by the user's accessible wallets (owner ∪ active member) — it can
 * never reach another user's data, accepts no user_id, and never writes.
 */
class AssistantFindTransactionsTest extends TestCase
{
    use RefreshDatabase;

    private function wallet(User $user, string $type = 'main', string $name = 'Main Wallet'): Wallet
    {
        return Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => $name,
            'balance' => 0,
        ]);
    }

    private function txn(Wallet $wallet, array $attrs = []): Transaction
    {
        // created_at isn't mass-assignable; set it directly after create.
        $createdAt = $attrs['created_at'] ?? null;
        unset($attrs['created_at']);

        $t = Transaction::create(array_merge([
            'reference' => Transaction::generateReference(),
            'wallet_id' => $wallet->id,
            'user_id' => $wallet->user_id,
            'type' => 'transfer_out',
            'direction' => 'debit',
            'amount' => 10_000,
            'status' => 'successful',
            'description' => 'Test txn',
        ], $attrs));

        if ($createdAt !== null) {
            $t->created_at = $createdAt;
            $t->save();
        }

        return $t;
    }

    /** Build a Request authenticated as $user (mirrors Sanctum resolution). */
    private function requestAs(User $user): Request
    {
        $req = Request::create('/api/v1/assistant/chat', 'POST');
        $req->setUserResolver(fn () => $user);

        return $req;
    }

    // 1. Authenticated user can retrieve their own transactions.
    public function test_returns_the_users_own_transactions(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w);
        $this->txn($w);

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), []);

        $this->assertSame(2, $out['count']);
        $this->assertSame(2, $out['total']);
        $this->assertCount(2, $out['transactions']);
    }

    // 2. Unauthenticated request returns 401.
    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/assistant/chat', ['message' => 'show my transactions'])
            ->assertStatus(401);
    }

    // 3. The tool cannot accept a user_id — it is not in the schema, and an
    //    AI-supplied user_id in the input is ignored (identity stays the caller).
    public function test_schema_has_no_user_id_and_supplied_user_id_is_ignored(): void
    {
        $schema = (new FindTransactionsTool())->inputSchema();
        $this->assertArrayNotHasKey('user_id', $schema['properties']);
        $this->assertFalse($schema['additionalProperties']);

        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->txn($this->wallet($alice));
        $this->txn($this->wallet($bob, 'savings', 'Bob Savings'));

        // Alice calls with Bob's id smuggled into the input.
        $out = (new FindTransactionsTool())->handle($this->requestAs($alice), ['user_id' => $bob->id]);

        $this->assertSame(1, $out['total']); // only Alice's — user_id had no effect
    }

    // 4. A user cannot retrieve another user's transactions (incl. via wallet_id).
    public function test_cannot_reach_another_users_transactions(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->txn($this->wallet($alice));
        $bobWallet = $this->wallet($bob, 'savings', 'Bob Savings');
        $this->txn($bobWallet);

        // Baseline: Alice sees only her own.
        $out = (new FindTransactionsTool())->handle($this->requestAs($alice), []);
        $this->assertSame(1, $out['total']);

        // Even naming Bob's wallet_id yields nothing (never leaks).
        $out = (new FindTransactionsTool())->handle($this->requestAs($alice), ['wallet_id' => $bobWallet->id]);
        $this->assertSame(0, $out['total']);
    }

    // 4b. Active membership on another owner's wallet IS in scope (reused rule).
    public function test_active_member_sees_shared_wallet_transactions(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $shared = $this->wallet($owner, 'shared', 'Family Pot');
        WalletMember::create([
            'wallet_id' => $shared->id,
            'user_id' => $member->id,
            'role' => 'contributor',
            'status' => 'active',
        ]);
        $this->txn($shared);

        $out = (new FindTransactionsTool())->handle($this->requestAs($member), []);
        $this->assertSame(1, $out['total']);
    }

    // 5. Date filtering works.
    public function test_date_filtering(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['created_at' => now()->subDays(2)]);   // within last 7 days
        $this->txn($w, ['created_at' => now()->subDays(20)]);  // outside

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), [
            'date_from' => now()->subDays(7)->toDateString(),
            'date_to' => now()->toDateString(),
        ]);

        $this->assertSame(1, $out['total']);
    }

    // 6. Wallet filtering works.
    public function test_wallet_filtering(): void
    {
        $user = User::factory()->create();
        $main = $this->wallet($user, 'main', 'Main Wallet');
        $savings = $this->wallet($user, 'savings', 'Savings');
        $this->txn($main);
        $this->txn($savings);

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), ['wallet_id' => $main->id]);

        $this->assertSame(1, $out['total']);
        $this->assertSame('Main Wallet', $out['transactions'][0]['wallet']);
    }

    // 7. Transaction type filtering works.
    public function test_type_filtering(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w, ['type' => 'withdrawal']);
        $this->txn($w, ['type' => 'transfer_out']);

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), ['type' => 'withdrawal']);

        $this->assertSame(1, $out['total']);
        $this->assertSame('withdrawal', $out['transactions'][0]['type']);
    }

    // 8. Pagination is respected (page size capped, has_more surfaced).
    public function test_pagination_is_respected(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        foreach (range(1, 5) as $i) {
            $this->txn($w);
        }

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), ['per_page' => 2, 'page' => 1]);

        $this->assertSame(2, $out['count']);
        $this->assertSame(5, $out['total']);
        $this->assertSame(2, $out['per_page']);
        $this->assertTrue($out['has_more']);
    }

    // 8b. per_page cannot exceed the existing cap of 100.
    public function test_per_page_is_capped_at_100(): void
    {
        $user = User::factory()->create();
        $this->wallet($user);

        $out = (new FindTransactionsTool())->handle($this->requestAs($user), ['per_page' => 5000]);

        $this->assertSame(100, $out['per_page']);
    }

    // 9. No write operation is possible through this tool.
    public function test_tool_never_writes(): void
    {
        $user = User::factory()->create();
        $w = $this->wallet($user);
        $this->txn($w);

        $before = Transaction::count();
        (new FindTransactionsTool())->handle($this->requestAs($user), ['search' => 'anything']);

        $this->assertSame($before, Transaction::count());
    }
}
