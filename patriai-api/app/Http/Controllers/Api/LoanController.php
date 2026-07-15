<?php

namespace App\Http\Controllers\Api;

use App\Models\Loan;
use App\Services\LoanService;
use App\Services\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoanController extends ApiController
{
    // GET /loans
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $loans = Loan::where('user_id', $user->id)->latest()->get();

        $activeOutstanding = $loans
            ->whereIn('status', Loan::OWED_STATUSES)
            ->sum(fn ($l) => $l->outstanding + $l->penalty_accrued);

        // Total ever disbursed (principal) — loans that reached disbursement.
        $totalBorrowed = $loans
            ->whereIn('status', ['disbursed', 'active', 'repaid', 'defaulted'])
            ->sum('principal');

        $hasActiveLoan = $loans->whereIn('status', Loan::OPEN_STATUSES)->isNotEmpty();

        return $this->ok('Loans fetched', [
            'loans' => $loans->map(fn ($l) => $this->serializeLoan($l))->values(),
            'summary' => [
                'active_outstanding' => number_format($activeOutstanding / 100, 2, '.', ''),
                'total_borrowed' => number_format($totalBorrowed / 100, 2, '.', ''),
                'has_active_loan' => $hasActiveLoan,
            ],
        ]);
    }

    // GET /loans/eligibility
    public function eligibility(Request $request): JsonResponse
    {
        return $this->ok('Eligibility fetched', LoanService::make()->eligibility($request->user()));
    }

    // POST /loans  { category, amount, tenor_days, repayment_frequency, purpose?, disburse_wallet_id? }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', 'in:' . implode(',', Loan::CATEGORIES)],
            'amount' => ['required', 'numeric', 'min:1'],
            'tenor_days' => ['required', 'integer', 'min:7', 'max:365'],
            'repayment_frequency' => ['required', 'in:once,weekly,monthly'],
            'purpose' => ['nullable', 'string', 'max:200'],
            'disburse_wallet_id' => ['nullable', 'integer'],
        ]);

        $loan = LoanService::make()->apply(
            $request->user(),
            $data['category'],
            $this->toKobo($data['amount']),
            (int) $data['tenor_days'],
            $data['repayment_frequency'],
            $data['purpose'] ?? null,
            isset($data['disburse_wallet_id']) ? (int) $data['disburse_wallet_id'] : null,
        );

        $message = $loan->status === 'active' ? 'Loan approved and disbursed' : 'Loan application submitted';

        return $this->ok($message, [
            'loan' => $this->serializeLoan($loan),
            'repayments' => $loan->repayments()->orderBy('sequence')->get()
                ->map(fn ($r) => $this->serializeLoanRepayment($r)),
        ], 201);
    }

    // GET /loans/{loan}
    public function show(Request $request, Loan $loan): JsonResponse
    {
        if ($loan->user_id !== $request->user()->id) {
            return $this->fail('Loan not found', 404);
        }

        return $this->ok('Loan fetched', [
            'loan' => $this->serializeLoan($loan),
            'repayments' => $loan->repayments()->orderBy('sequence')->get()
                ->map(fn ($r) => $this->serializeLoanRepayment($r)),
        ]);
    }

    // POST /loans/{loan}/repay  { amount, wallet_id, pin }
    public function repay(Request $request, Loan $loan): JsonResponse
    {
        $user = $request->user();

        if ($loan->user_id !== $user->id) {
            return $this->fail('Loan not found', 404);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'wallet_id' => ['required', 'integer'],
            'pin' => ['required', 'digits:4'],
        ]);

        app(PinService::class)->verify($user, $data['pin']);

        $wallet = \App\Models\Wallet::find($data['wallet_id']);

        if (!$wallet || !$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        if (!$wallet->canSpend($user)) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }

        $result = LoanService::make()->repay($loan, $user, $wallet, $this->toKobo($data['amount']));

        return $this->ok('Repayment successful', [
            'loan' => $this->serializeLoan($result['loan']),
            'transaction' => $this->serializeTransaction($result['transaction']),
        ]);
    }

    // POST /loans/{loan}/cancel
    public function cancel(Request $request, Loan $loan): JsonResponse
    {
        if ($loan->user_id !== $request->user()->id) {
            return $this->fail('Loan not found', 404);
        }

        $loan = LoanService::make()->cancel($loan, $request->user());

        return $this->ok('Loan cancelled', ['loan' => $this->serializeLoan($loan)]);
    }
}
