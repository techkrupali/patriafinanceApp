<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\LoanService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Loan application → auto-approve → disbursement path, and the status gate
 * that stops a second disbursement of the same loan.
 */
class LoanApplyTest extends TestCase
{
    use RefreshDatabase;

    public function test_small_loan_auto_disburses_once_and_cannot_be_disbursed_again(): void
    {
        $user = User::factory()->create(['kyc_tier' => 3]); // loans require Tier 3
        $wallet = Wallet::create([
            'user_id' => $user->id,
            'type' => 'main',
            'name' => 'Main Wallet',
            'balance' => 0,
        ]);

        Sanctum::actingAs($user);

        $res = $this->postJson('/api/v1/loans', [
            'category' => 'rent',
            'amount' => '500', // ₦500.00 = 50,000 kobo — within the auto-approve cap
            'tenor_days' => 30,
            'repayment_frequency' => 'once',
            'disburse_wallet_id' => $wallet->id,
        ]);

        $res->assertCreated()->assertJsonPath('data.loan.status', 'active');

        // Principal credited exactly once; schedule built.
        $this->assertSame(50_000, $wallet->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $wallet->id)->where('type', 'loan_disbursement')->count());
        $this->assertCount(1, $res->json('data.repayments'));

        // A second disbursement attempt on the now-active loan must be refused
        // by the status gate (re-checked under the row lock).
        $loan = \App\Models\Loan::findOrFail($res->json('data.loan.id'));
        $this->expectException(ValidationException::class);
        LoanService::make()->approveAndDisburse($loan, null);
    }
}
