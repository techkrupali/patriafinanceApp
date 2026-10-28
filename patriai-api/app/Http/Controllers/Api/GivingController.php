<?php

namespace App\Http\Controllers\Api;

use App\Models\GivingPayment;
use App\Models\GivingSchedule;
use App\Models\Wallet;
use App\Services\AuditService;
use App\Services\GivingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * WAL-18 giving wallet: what's set aside, given this year, coming up, waiting
 * for a yes; adding or changing a giving date; sending or skipping a payment.
 */
class GivingController extends ApiController
{
    // GET /wallets/{wallet}/giving
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->type !== 'giving' || !$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Giving wallet not found', 404);
        }

        return $this->ok('Giving fetched', ['giving' => GivingService::make()->detail($wallet)]);
    }

    // POST /wallets/{wallet}/giving/schedules  {label, amount, saved_account_id|group_id, frequency, …}
    public function storeSchedule(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->type !== 'giving' || $wallet->user_id !== $request->user()->id) {
            return $this->fail('Giving wallet not found', 404);
        }
        $data = $request->validate([
            'label' => ['required', 'string', 'max:60'],
            'amount' => ['required', 'numeric', 'min:1'],
            'saved_account_id' => ['nullable', 'integer'],
            'group_id' => ['nullable', 'integer'],
            'frequency' => ['required', 'in:' . implode(',', GivingSchedule::FREQUENCIES)],
            'day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'week_of_month' => ['nullable', 'integer', 'between:1,4'],
            'run_on' => ['nullable', 'date'],
            'ask_first' => ['sometimes', 'boolean'],
        ]);
        $data['amount'] = $this->toKobo((string) $data['amount']);
        $data['ask_first'] = $data['ask_first'] ?? (bool) ($wallet->givingSettings()['ask_first'] ?? false);
        $schedule = GivingService::make()->addSchedule($wallet, $request->user(), $data);
        AuditService::make()->log($wallet, $request->user(), 'giving_changed', "Added a giving date: {$schedule->label}", ['schedule_id' => $schedule->id]);

        return $this->ok('Giving date added', ['giving' => GivingService::make()->detail($wallet)], 201);
    }

    // PATCH /wallets/{wallet}/giving/schedules/{schedule}  {amount?, enabled?, ask_first?}
    public function updateSchedule(Request $request, Wallet $wallet, GivingSchedule $schedule): JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id || $schedule->wallet_id !== $wallet->id) {
            return $this->fail('Giving date not found', 404);
        }
        $data = $request->validate([
            'amount' => ['sometimes', 'numeric', 'min:1'],
            'enabled' => ['sometimes', 'boolean'],
            'ask_first' => ['sometimes', 'boolean'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo((string) $data['amount']);
        }
        $schedule->update($data);
        AuditService::make()->log($wallet, $request->user(), 'giving_changed', "Changed a giving date: {$schedule->label}", ['schedule_id' => $schedule->id]);

        return $this->ok('Giving date updated', ['giving' => GivingService::make()->detail($wallet)]);
    }

    // DELETE /wallets/{wallet}/giving/schedules/{schedule}
    public function destroySchedule(Request $request, Wallet $wallet, GivingSchedule $schedule): JsonResponse
    {
        if ($wallet->user_id !== $request->user()->id || $schedule->wallet_id !== $wallet->id) {
            return $this->fail('Giving date not found', 404);
        }
        $label = $schedule->label;
        $schedule->delete();
        AuditService::make()->log($wallet, $request->user(), 'giving_changed', "Removed a giving date: {$label}");

        return $this->ok('Giving date removed', ['giving' => GivingService::make()->detail($wallet)]);
    }

    // POST /giving-payments/{payment}/confirm
    public function confirm(Request $request, GivingPayment $payment): JsonResponse
    {
        $paid = GivingService::make()->confirm($payment, $request->user());

        return $this->ok($paid->status === 'paid' ? 'Sent' : 'It did not go', ['giving' => GivingService::make()->detail($payment->wallet)]);
    }

    // POST /giving-payments/{payment}/skip
    public function skip(Request $request, GivingPayment $payment): JsonResponse
    {
        GivingService::make()->skip($payment, $request->user());

        return $this->ok('Skipped this time', ['giving' => GivingService::make()->detail($payment->wallet)]);
    }
}
