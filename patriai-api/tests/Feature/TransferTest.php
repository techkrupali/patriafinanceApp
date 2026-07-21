<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Money-path coverage for POST /v1/transfers: happy path, overdraft guard,
 * double-submit fingerprint dedupe, idempotency-key replay and the frozen-
 * wallet spend block. All amounts are kobo in the DB, naira over the wire.
 */
class TransferTest extends TestCase
{
    use RefreshDatabase;

    private function makeWallet(User $user, string $type, int $balanceKobo): Wallet
    {
        return Wallet::create([
            'user_id' => $user->id,
            'type' => $type,
            'name' => ucfirst($type) . ' Wallet',
            'balance' => $balanceKobo,
        ]);
    }

    private function transferPayload(Wallet $from, Wallet $to, string $amountNaira, array $extra = []): array
    {
        return array_merge([
            'from_wallet_id' => $from->id,
            'amount' => $amountNaira,
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $to->id],
        ], $extra);
    }

    public function test_wallet_to_wallet_transfer_happy_path(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 100_000);     // ₦1,000.00
        $savings = $this->makeWallet($user, 'savings', 0);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/transfers', $this->transferPayload($main, $savings, '100'));

        $res->assertOk()->assertJsonPath('status', true);
        $this->assertNotEmpty($res->json('data.reference'));

        $this->assertSame(90_000, $main->refresh()->balance);
        $this->assertSame(10_000, $savings->refresh()->balance);

        $this->assertSame(1, Transaction::where('wallet_id', $main->id)->where('type', 'transfer_out')->count());
        $this->assertSame(1, Transaction::where('wallet_id', $savings->id)->where('type', 'transfer_in')->count());
    }

    public function test_transfer_fails_on_insufficient_balance(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 5_000);       // ₦50.00
        $savings = $this->makeWallet($user, 'savings', 0);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/transfers', $this->transferPayload($main, $savings, '100'));

        $res->assertStatus(422)->assertJsonPath('status', false);
        $this->assertSame(5_000, $main->refresh()->balance);
        $this->assertSame(0, Transaction::where('wallet_id', $main->id)->count());
    }

    public function test_identical_double_submit_without_key_is_rejected_with_409(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 100_000);
        $savings = $this->makeWallet($user, 'savings', 0);

        Sanctum::actingAs($user);

        $payload = $this->transferPayload($main, $savings, '100');

        $this->postJson('/api/v1/transfers', $payload)->assertOk();
        // The byte-identical retry inside the short dedupe window must be refused…
        $this->postJson('/api/v1/transfers', $payload)->assertStatus(409);

        // …and only ONE debit may have happened.
        $this->assertSame(90_000, $main->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $main->id)->where('type', 'transfer_out')->count());
    }

    public function test_idempotency_key_replays_same_reference_without_double_debit(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 100_000);
        $savings = $this->makeWallet($user, 'savings', 0);

        Sanctum::actingAs($user);

        $payload = $this->transferPayload($main, $savings, '100', ['idempotency_key' => 'txn-abc-123']);

        $first = $this->postJson('/api/v1/transfers', $payload);
        $first->assertOk();
        $reference = $first->json('data.reference');

        $replay = $this->postJson('/api/v1/transfers', $payload);
        $replay->assertOk();

        // Same stored response, same reference — and the money moved exactly once.
        $this->assertSame($reference, $replay->json('data.reference'));
        $this->assertSame(90_000, $main->refresh()->balance);
        $this->assertSame(10_000, $savings->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $main->id)->where('type', 'transfer_out')->count());
    }

    public function test_frozen_wallet_blocks_transfer(): void
    {
        $user = User::factory()->create();
        $frozen = $this->makeWallet($user, 'savings', 100_000);
        $frozen->update(['status' => 'frozen']);
        $main = $this->makeWallet($user, 'main', 0);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/transfers', $this->transferPayload($frozen, $main, '100'));

        // canSpend() is false on a frozen wallet — spend is refused before any money code runs.
        $res->assertStatus(403)->assertJsonPath('status', false);
        $this->assertSame(100_000, $frozen->refresh()->balance);
        $this->assertSame(0, Transaction::where('wallet_id', $frozen->id)->count());
    }
}
