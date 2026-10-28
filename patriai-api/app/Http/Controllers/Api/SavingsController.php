<?php

namespace App\Http\Controllers\Api;

use App\Models\SavingsMilestone;
use App\Models\SavingsPlan;
use App\Models\Wallet;
use App\Services\SavingsInsights;
use App\Services\SavingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Savings Goals: the shared plan, milestones and each saver's own auto-save.
 * The wallet itself (target, contributors, first plan) is created by POST /wallets.
 */
class SavingsController extends ApiController
{
    private function savingsWallet(Request $request, Wallet $wallet): ?Wallet
    {
        if (!in_array($wallet->type, SavingsService::TYPES, true) || !$wallet->canView($request->user())) {
            return null;
        }

        return $wallet;
    }

    private function detail(Request $request, Wallet $wallet, string $message, int $code = 200): JsonResponse
    {
        $wallet->unsetRelation('savingsPlan');
        $wallet->unsetRelation('savingsMilestones');

        return $this->ok($message, ['savings' => SavingsService::make()->detail($wallet->refresh(), $request->user())], $code);
    }

    private function termRules(): array
    {
        return [
            'amount' => ['sometimes', 'numeric', 'min:1'],
            'frequency' => ['sometimes', 'in:' . implode(',', SavingsPlan::FREQUENCIES)],
            'day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'day_of_month' => ['nullable', 'integer', 'between:1,28'],
        ];
    }

    // GET /savings/insights — SAV-03: the usual salary and round-up estimates from Main
    public function insights(Request $request): JsonResponse
    {
        $i = SavingsInsights::make()->forUser($request->user());
        $naira = fn (int $kobo) => number_format($kobo / 100, 2, '.', '');

        return $this->ok('Savings insights fetched', [
            'main_wallet' => $i['main'] ? [
                'id' => $i['main']->id,
                'name' => $i['main']->name,
                'balance' => $i['main']->balanceNaira(),
                'account_number' => $i['main']->virtual_account,
            ] : null,
            'months' => $i['months'],
            'salary' => $i['salary'] ? [
                'amount' => $naira($i['salary']['amount']),
                'day' => $i['salary']['day'],
                'from' => $i['salary']['from'],
            ] : null,
            'roundups' => collect($i['roundups'])->mapWithKeys(fn ($kobo, $step) => [(string) intdiv($step, 100) => $naira($kobo)]),
            'monthly_spending' => $naira($i['spending']),
            // wallet id => typical monthly deposits from banks
            'monthly_deposits' => collect($i['deposits'])->mapWithKeys(fn ($kobo, $id) => [(string) $id => $naira($kobo)]),
        ]);
    }

    // GET /wallets/{wallet}/savings
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        return $this->detail($request, $wallet, 'Savings plan fetched');
    }

    // PATCH /wallets/{wallet}/savings — owner: plan for everyone + target (creates the plan if missing)
    public function update(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate($this->termRules() + [
            'auto_save' => ['sometimes', 'boolean'],
            'allow_contributor_edit' => ['sometimes', 'boolean'],
            'salary_percent' => ['sometimes', 'integer', 'between:1,50'],
            'missed_policy' => ['sometimes', 'in:' . implode(',', SavingsPlan::MISSED_POLICIES)],
            'notify_others_on_miss' => ['sometimes', 'boolean'],
            'notify_sms' => ['sometimes', 'boolean'],
            'target_amount' => ['sometimes', 'nullable', 'numeric', 'min:1'],
            'target_date' => ['sometimes', 'nullable', 'date', 'after:today'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo((string) $data['amount']);
        }
        if (array_key_exists('target_amount', $data) && $data['target_amount'] !== null) {
            $data['target_amount'] = $this->toKobo((string) $data['target_amount']);
        }

        SavingsService::make()->updatePlan($wallet, $request->user(), $data);

        return $this->detail($request, $wallet, 'Savings plan updated');
    }

    // POST /wallets/{wallet}/savings/contribution — start my auto-save { source_wallet_id, amount?, frequency?, ... }
    public function startContribution(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate($this->termRules() + ['source_wallet_id' => ['required', 'integer']]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo((string) $data['amount']);
        }

        SavingsService::make()->startContribution($wallet, $request->user(), (int) $data['source_wallet_id'], $data);

        return $this->detail($request, $wallet, 'Auto-save started', 201);
    }

    // PATCH /wallets/{wallet}/savings/contribution — change my auto-save
    public function updateContribution(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate($this->termRules() + [
            'source_wallet_id' => ['sometimes', 'integer'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo((string) $data['amount']);
        }

        SavingsService::make()->updateMyContribution($wallet, $request->user(), $data);

        return $this->detail($request, $wallet, 'Auto-save updated');
    }

    // POST /wallets/{wallet}/savings/milestones  { title, amount, due_date? } — owner
    public function addMilestone(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:100'],
            'amount' => ['required', 'numeric', 'min:1'],
            'due_date' => ['nullable', 'date'],
        ]);
        $data['amount'] = $this->toKobo((string) $data['amount']);

        SavingsService::make()->addMilestone($wallet, $request->user(), $data);

        return $this->detail($request, $wallet, 'Milestone added', 201);
    }

    // DELETE /wallets/{wallet}/savings/milestones/{milestone} — owner
    public function removeMilestone(Request $request, Wallet $wallet, SavingsMilestone $milestone): JsonResponse
    {
        if (!$this->savingsWallet($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        SavingsService::make()->removeMilestone($wallet, $request->user(), $milestone);

        return $this->detail($request, $wallet, 'Milestone removed');
    }
}
