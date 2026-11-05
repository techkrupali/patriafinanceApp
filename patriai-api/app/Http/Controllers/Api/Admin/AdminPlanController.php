<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SystemSetting;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * PLN-01…04 from the admin side: each plan's price, trial and limits, the
 * "Free · Pro" rows people compare, whether Free's limits hold, and who pays.
 */
class AdminPlanController extends ApiController
{
    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    // GET /admin/plans
    public function index(Request $request): JsonResponse
    {
        $svc = PlanService::make();
        $live = Subscription::whereIn('status', Subscription::LIVE);
        $mrr = (clone $live)->where('status', '!=', 'trialing')->get(['price', 'interval'])->sum(fn ($s) => $s->interval === 'yearly' ? intdiv($s->price, 12) : $s->price);

        return $this->ok('Plans', [
            'plans' => $svc->plans()->map(fn (Plan $p) => $svc->serializePlan($p) + [
                'id' => $p->id,
                'families' => Subscription::where('plan_id', $p->id)->whereIn('status', Subscription::LIVE)->count(),
            ])->values(),
            'features' => array_values((array) SystemSetting::get('plan_features')),
            'enforce' => $svc->enforced(),
            'summary' => [
                'paying' => (clone $live)->whereIn('status', ['active', 'past_due'])->count(),
                'trials' => (clone $live)->where('status', 'trialing')->count(),
                'cancelling' => (clone $live)->where('cancel_at_period_end', true)->count(),
                'past_due' => (clone $live)->where('status', 'past_due')->count(),
                'mrr' => $this->naira($mrr),
                'paid_30d' => $this->naira((int) SubscriptionPayment::where('status', 'paid')->where('created_at', '>=', now()->subDays(30))->sum('amount')),
            ],
            'subscriptions' => Subscription::with(['user', 'plan', 'payWallet'])->latest('id')->limit(100)->get()->map(fn (Subscription $s) => [
                'id' => $s->id,
                'user' => ['id' => $s->user_id, 'name' => $s->user?->fullName(), 'phone' => $s->user?->phone],
                'family' => $svc->family($s->user)->count(),
                'plan' => $s->plan?->name,
                'interval' => $s->interval,
                'status' => $s->status,
                'cancelling' => $s->cancel_at_period_end,
                'price' => $this->naira($s->price),
                'next_at' => in_array($s->status, Subscription::LIVE, true) ? $s->current_period_end?->toIso8601String() : null,
                'paid_from' => $s->payWallet?->name,
                'failure' => $s->status === 'past_due' ? $s->failure : null,
                'started_at' => $s->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    // PATCH /admin/plans/{plan}
    public function update(Request $request, Plan $plan): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'covers' => ['sometimes', 'nullable', 'string', 'max:80'],
            'monthly_price' => ['sometimes', 'numeric', 'min:0', 'max:100000000'],
            'yearly_price' => ['sometimes', 'numeric', 'min:0', 'max:1000000000'],
            'trial_days' => ['sometimes', 'integer', 'between:0,90'],
            'active' => ['sometimes', 'boolean'],
            'limits' => ['sometimes', 'array'],
            'limits.*' => ['nullable', 'integer', 'between:0,1000'],
        ]);
        foreach (['monthly_price', 'yearly_price'] as $k) {
            if (array_key_exists($k, $data)) {
                $data[$k] = $plan->is_free ? 0 : $this->toKobo((string) $data[$k]);
            }
        }
        if (isset($data['limits'])) {
            $data['limits'] = collect(Plan::LIMITS)->mapWithKeys(fn ($k) => [$k => array_key_exists($k, $data['limits']) ? $data['limits'][$k] : $plan->limit($k)])->all();
        }
        if ($plan->is_free) {
            unset($data['trial_days']);
            $data['active'] = true;
        }
        $next = $plan->fill($data);
        if (!$next->is_free && $next->active && ($next->monthly_price <= 0 || $next->yearly_price <= 0)) {
            return $this->fail('Set both prices before turning this plan on.', 422);
        }
        $plan->save();

        return $this->ok('Plan saved', ['plan' => PlanService::make()->serializePlan($plan->refresh()) + ['id' => $plan->id]]);
    }

    // PUT /admin/plans/features {rows: [{label, values: {free, pro}}]}
    public function features(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rows' => ['present', 'array', 'max:20'],
            'rows.*.label' => ['required', 'string', 'max:40'],
            'rows.*.values' => ['present', 'array'],
            'rows.*.values.*' => ['nullable', 'string', 'max:60'],
        ]);
        $slugs = Plan::pluck('slug')->all();
        $rows = collect($data['rows'])->map(fn ($r) => [
            'label' => trim($r['label']),
            'values' => collect($slugs)->mapWithKeys(fn ($s) => [$s => trim((string) ($r['values'][$s] ?? ''))])->all(),
        ])->values()->all();
        SystemSetting::put('plan_features', $rows, $request->user()->id);

        return $this->ok('Comparison saved', ['features' => $rows]);
    }

    // PATCH /admin/plans/settings {enforce}
    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate(['enforce' => ['required', 'boolean']]);
        SystemSetting::put('plans_enforce', (bool) $data['enforce'], $request->user()->id);

        return $this->ok($data['enforce'] ? 'Free limits are on' : 'Free limits are off', ['enforce' => (bool) $data['enforce']]);
    }
}
