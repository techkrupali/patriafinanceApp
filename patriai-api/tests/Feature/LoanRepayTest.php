<?php

namespace Tests\Feature;

use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Money-path coverage for POST /v1/loans/{loan}/repay: a double submission
 * (same idempotency key, or byte-identical retry) must reduce the outstanding
 * balance and debit the wallet exactly ONCE.
 */
class LoanRepayTest extends TestCase
{
    use RefreshDatabase;

    private function makeActiveLoan(User $user, Wallet $wallet, int $totalRepayableKobo): Loan
    {
        $loan = Loan::create([
            'reference' => Loan::generateReference(),
            'user_id' => $user->id,
            'category' => 'rent',
            'principal' => 100_000,
            'interest_bps' => 500,
            'fee' => 0,
            'total_repayable' => $totalRepayableKobo,
            'outstanding' => $totalRepayableKobo,
            'penalty_accrued' => 0,
            'tenor_days' => 30,
            'repayment_frequency' => 'once',
            'status' => 'active',
            'disbursed_wallet_id' => $wallet->id,
            'disbursed_at' => now(),
            'due_at' => now()->addDays(30),
        ]);

        LoanRepayment::create([
            'loan_id' => $loan->id,
            'sequence' => 1,
            'due_date' => now()->addDays(30)->toDateString(),
            'amount_due' => $totalRepayableKobo,
            'amount_paid' => 0,
            'status' => 'pending',
        ]);

        return $loan;
    }

    public function test_repay_reduces_outstanding_once_under_double_submission_with_idempotency_key(): void
    {
        $user = User::factory()->create();
        $wallet = Wallet::create([
            'user_id' => $user->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => 200_000, // ₦2,000.00
        ]);
        $loan = $this->makeActiveLoan($user, $wallet, 105_000); // ₦1,050.00 owed

        Sanctum::actingAs($user);

        $payload = [
            'amount' => '500', // ₦500.00 = 50,000 kobo
            'wallet_id' => $wallet->id,
            'pin' => '1234',
            'idempotency_key' => 'repay-attempt-1',
        ];

        $first = $this->postJson("/api/v1/loans/{$loan->id}/repay", $payload);
        $first->assertOk()->assertJsonPath('status', true);
        $reference = $first->json('data.transaction.reference');
        $this->assertNotEmpty($reference);

        // The duplicate submission replays the SAME stored response…
        $replay = $this->postJson("/api/v1/loans/{$loan->id}/repay", $payload);
        $replay->assertOk();
        $this->assertSame($reference, $replay->json('data.transaction.reference'));

        // …and the money moved exactly once.
        $this->assertSame(55_000, $loan->refresh()->outstanding);
        $this->assertSame(150_000, $wallet->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $wallet->id)->where('type', 'loan_repayment')->count());
    }

    public function test_repay_without_key_rejects_identical_double_submit_with_409(): void
    {
        $user = User::factory()->create();
        $wallet = Wallet::create([
            'user_id' => $user->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => 200_000,
        ]);
        $loan = $this->makeActiveLoan($user, $wallet, 105_000);

        Sanctum::actingAs($user);

        $payload = ['amount' => '500', 'wallet_id' => $wallet->id, 'pin' => '1234'];

        $this->postJson("/api/v1/loans/{$loan->id}/repay", $payload)->assertOk();
        $this->postJson("/api/v1/loans/{$loan->id}/repay", $payload)->assertStatus(409);

        $this->assertSame(55_000, $loan->refresh()->outstanding);
        $this->assertSame(150_000, $wallet->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $wallet->id)->where('type', 'loan_repayment')->count());
    }
}
