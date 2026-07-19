<?php

namespace App\Http\Controllers\Api;

use App\Models\AutomationRule;
use App\Services\AutomationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AutomationController extends ApiController
{
    private const DAY_NAMES = [1 => 'Monday', 2 => 'Tuesday', 3 => 'Wednesday', 4 => 'Thursday', 5 => 'Friday', 6 => 'Saturday', 7 => 'Sunday'];

    // GET /automations
    public function index(Request $request): JsonResponse
    {
        $rules = AutomationRule::where('user_id', $request->user()->id)
            ->with(['fromWallet:id,name', 'toWallet:id,name'])
            ->latest()
            ->get()
            ->map(fn (AutomationRule $r) => $this->serializeRule($r));

        return $this->ok('Automations fetched', ['automations' => $rules]);
    }

    // POST /automations
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request, creating: true);

        $payload = [
            'name' => $data['name'],
            'from_wallet_id' => $data['from_wallet_id'],
            'to_wallet_id' => $data['to_wallet_id'],
            'amount' => $this->toKobo($data['amount']),
            'frequency' => $data['frequency'],
            'day_of_week' => $data['frequency'] === 'weekly' ? ($data['day_of_week'] ?? null) : null,
            'day_of_month' => $data['frequency'] === 'monthly' ? ($data['day_of_month'] ?? null) : null,
            'min_balance' => isset($data['min_balance']) ? $this->toKobo($data['min_balance']) : null,
            'enabled' => $data['enabled'] ?? true,
        ];

        $rule = AutomationService::make()->createRule($request->user(), $payload);

        return $this->ok('Automation created', ['automation' => $this->serializeRule($rule->load(['fromWallet:id,name', 'toWallet:id,name']))], 201);
    }

    // GET /automations/{automationRule}
    public function show(Request $request, AutomationRule $automationRule): JsonResponse
    {
        if ($automationRule->user_id !== $request->user()->id) {
            return $this->fail('Automation not found', 404);
        }

        return $this->ok('Automation fetched', ['automation' => $this->serializeRule($automationRule->load(['fromWallet:id,name', 'toWallet:id,name']))]);
    }

    // PATCH /automations/{automationRule}
    public function update(Request $request, AutomationRule $automationRule): JsonResponse
    {
        if ($automationRule->user_id !== $request->user()->id) {
            return $this->fail('Automation not found', 404);
        }

        $data = $this->validatePayload($request, creating: false);

        $update = [];
        foreach (['name', 'from_wallet_id', 'to_wallet_id', 'frequency', 'day_of_week', 'day_of_month', 'enabled'] as $field) {
            if ($request->exists($field)) {
                $update[$field] = $data[$field] ?? null;
            }
        }
        if ($request->exists('amount')) {
            $update['amount'] = $this->toKobo($data['amount']);
        }
        if ($request->exists('min_balance')) {
            $update['min_balance'] = $data['min_balance'] !== null ? $this->toKobo($data['min_balance']) : null;
        }

        // Keep the day fields consistent with the resulting frequency: a weekly
        // rule carries only day_of_week, a monthly rule only day_of_month.
        $resultingFrequency = $update['frequency'] ?? $automationRule->frequency;
        if ($resultingFrequency !== 'weekly') {
            $update['day_of_week'] = null;
        }
        if ($resultingFrequency !== 'monthly') {
            $update['day_of_month'] = null;
        }

        $rule = AutomationService::make()->updateRule($automationRule, $request->user(), $update);

        return $this->ok('Automation updated', ['automation' => $this->serializeRule($rule->load(['fromWallet:id,name', 'toWallet:id,name']))]);
    }

    // DELETE /automations/{automationRule}
    public function destroy(Request $request, AutomationRule $automationRule): JsonResponse
    {
        if ($automationRule->user_id !== $request->user()->id) {
            return $this->fail('Automation not found', 404);
        }

        AutomationService::make()->deleteRule($automationRule, $request->user());

        return $this->ok('Automation deleted');
    }

    // POST /automations/{automationRule}/run  — manual "run now" (force=true), owner-only
    public function run(Request $request, AutomationRule $automationRule): JsonResponse
    {
        if ($automationRule->user_id !== $request->user()->id) {
            return $this->fail('Automation not found', 404);
        }

        $result = AutomationService::make()->runRule($automationRule, now(), force: true);

        if (($result['status'] ?? null) !== 'ran') {
            return $this->fail($result['reason'] ?? 'Automation did not run', 422);
        }

        return $this->ok('Automation ran', [
            'result' => $result,
            'automation' => $this->serializeRule($automationRule->refresh()->load(['fromWallet:id,name', 'toWallet:id,name'])),
        ]);
    }

    /** Shared validation for store (creating=true, fields required) and update (all optional). */
    private function validatePayload(Request $request, bool $creating): array
    {
        $req = fn (string $rule) => $creating ? ['required', $rule] : ['sometimes', $rule];

        return $request->validate([
            'name' => $creating ? ['required', 'string', 'max:100'] : ['sometimes', 'string', 'max:100'],
            'from_wallet_id' => $req('integer'),
            'to_wallet_id' => $req('integer'),
            'amount' => $creating ? ['required', 'numeric', 'min:0.01'] : ['sometimes', 'numeric', 'min:0.01'],
            'frequency' => $req('in:daily,weekly,monthly'),
            'day_of_week' => ['nullable', 'integer', 'between:1,7'],
            'day_of_month' => ['nullable', 'integer', 'between:1,28'],
            'min_balance' => ['nullable', 'numeric', 'min:0'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
    }

    private function serializeRule(AutomationRule $rule): array
    {
        return [
            'id' => $rule->id,
            'name' => $rule->name,
            'from_wallet' => $rule->fromWallet ? ['id' => $rule->fromWallet->id, 'name' => $rule->fromWallet->name] : null,
            'to_wallet' => $rule->toWallet ? ['id' => $rule->toWallet->id, 'name' => $rule->toWallet->name] : null,
            'amount' => number_format($rule->amount / 100, 2, '.', ''),
            'frequency' => $rule->frequency,
            'day_of_week' => $rule->day_of_week,
            'day_of_month' => $rule->day_of_month,
            'min_balance' => $rule->min_balance !== null ? number_format($rule->min_balance / 100, 2, '.', '') : null,
            'enabled' => (bool) $rule->enabled,
            'last_run_at' => $rule->last_run_at?->toIso8601String(),
            'next_run_hint' => $this->nextRunHint($rule),
        ];
    }

    /** Human-readable schedule summary, e.g. "Every day", "Weekly on Monday", "Monthly on day 15". */
    private function nextRunHint(AutomationRule $rule): string
    {
        if (!$rule->enabled) {
            return 'Paused';
        }

        return match ($rule->frequency) {
            'weekly' => 'Weekly on ' . (self::DAY_NAMES[$rule->day_of_week] ?? 'the set day'),
            'monthly' => 'Monthly on day ' . ($rule->day_of_month ?? '?'),
            default => 'Every day',
        };
    }
}
