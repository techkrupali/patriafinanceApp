<?php

namespace App\Http\Controllers\Api;

use App\Models\AutomationRule;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
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

        return $this->ok('Automations fetched', [
            'automations' => $rules,
            // The Rules tab lists each wallet's "when does money need a yes" rule too.
            'approval_rules' => $this->approvalRules($request->user()),
        ]);
    }

    /** Wallets this person owns or co-owns that hold spends for approval, with who decides. */
    private function approvalRules(User $user): array
    {
        $coOwned = WalletMember::where('user_id', $user->id)
            ->where('status', 'active')
            ->whereIn('role', ['owner', 'co_owner'])
            ->pluck('wallet_id');

        return Wallet::with(['owner', 'members' => fn ($q) => $q->where('status', 'active')->with('user')])
            ->where('approval_enabled', true)
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhereIn('id', $coOwned))
            ->orderBy('name')
            ->get()
            ->map(function (Wallet $wallet) {
                $approvers = collect([$wallet->owner])
                    ->concat(
                        $wallet->members
                            ->filter(fn ($m) => in_array($m->role, ['owner', 'co_owner', 'admin'], true) || $m->can_approve)
                            ->pluck('user')
                    )
                    ->filter()
                    ->unique('id')
                    ->map(fn (User $u) => $u->first_name ?: $u->fullName())
                    ->values();

                return [
                    'wallet_id' => $wallet->id,
                    'wallet_name' => $wallet->name,
                    'wallet_type' => $wallet->type,
                    'threshold' => $wallet->approval_threshold !== null ? number_format($wallet->approval_threshold / 100, 2, '.', '') : null,
                    'required_approvals' => (int) $wallet->required_approvals,
                    'approval_mode' => $wallet->approvalMode(),
                    'goal_locked' => $wallet->isGoalLocked(),
                    'approvers' => $approvers,
                ];
            })
            ->values()
            ->all();
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
            // schedule | salary (percent of each salary) | roundup (to roundup_to, swept daily)
            'trigger' => $rule->trigger,
            'percent' => $rule->percent,
            'roundup_to' => $rule->roundup_to !== null ? number_format($rule->roundup_to / 100, 2, '.', '') : null,
            'pending_amount' => number_format($rule->pending_amount / 100, 2, '.', ''),
            'retry_at' => $rule->retry_at?->toIso8601String(),
            'frequency' => $rule->frequency,
            'day_of_week' => $rule->day_of_week,
            'day_of_month' => $rule->day_of_month,
            'min_balance' => $rule->min_balance !== null ? number_format($rule->min_balance / 100, 2, '.', '') : null,
            'enabled' => (bool) $rule->enabled,
            'last_run_at' => $rule->last_run_at?->toIso8601String(),
            'next_run_on' => $rule->nextRunOn(now())?->toDateString(),
            'next_run_hint' => $this->nextRunHint($rule),
        ];
    }

    /** Human-readable schedule summary, e.g. "Every day", "Weekly on Monday", "Monthly on day 15". */
    private function nextRunHint(AutomationRule $rule): string
    {
        if (!$rule->enabled) {
            return 'Paused';
        }
        if ($rule->trigger === 'salary') {
            return 'When salary lands';
        }
        if ($rule->trigger === 'roundup') {
            return 'Every day, from spending';
        }
        if ($rule->retry_at) {
            return 'Trying again ' . $rule->retry_at->format('j M');
        }

        return match ($rule->frequency) {
            'weekly' => 'Weekly on ' . (self::DAY_NAMES[$rule->day_of_week] ?? 'the set day'),
            'monthly' => 'Monthly on day ' . ($rule->day_of_month ?? '?'),
            default => 'Every day',
        };
    }
}
