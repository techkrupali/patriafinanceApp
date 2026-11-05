<?php

namespace App\Http\Controllers\Api;

use App\Models\Plan;
use App\Models\SystemSetting;
use App\Models\Wallet;
use App\Services\PinService;
use App\Services\PlanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * PLN-01 Free vs Pro, PLN-02 Upgrade and pay, PLN-03 Manage subscription.
 * Everything shown — plans, prices, the trial, the comparison rows — comes
 * from admin.
 */
class PlanController extends ApiController
{
    private function plans(): PlanService
    {
        return PlanService::make();
    }

    // GET /plans
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $svc = $this->plans();
        $current = $svc->planFor($user);
        $sub = $svc->coveringSubscription($user);
        $plans = $svc->plans()->filter(fn (Plan $p) => $p->is_free || $p->active || $p->id === $current->id)->values();
        $slugs = $plans->pluck('slug')->all();

        return $this->ok('Plans', [
            'plans' => $plans->map(fn ($p) => $svc->serializePlan($p))->values(),
            'features' => collect((array) SystemSetting::get('plan_features'))
                ->map(fn ($row) => ['label' => (string) ($row['label'] ?? ''), 'values' => collect($slugs)->mapWithKeys(fn ($s) => [$s => (string) (($row['values'] ?? [])[$s] ?? '—')])->all()])
                ->filter(fn ($row) => $row['label'] !== '')->values(),
            'current' => $current->slug,
            'subscription' => $sub ? $svc->serializeSubscription($sub, $user) : null,
            'trial_available' => !$svc->hadTrial($user),
            'family' => ['name' => $svc->homeCircle($user)?->name, 'count' => $svc->family($user)->count()],
            'wallets' => $svc->payableWallets($user)->map(fn (Wallet $w) => ['id' => $w->id, 'name' => $w->name, 'type' => $w->type, 'balance' => number_format($w->balance / 100, 2, '.', '')])->values(),
            'email' => $user->email,
        ]);
    }

    // POST /subscription {plan, interval, wallet_id, pin} — PLN-02 "Start free trial"
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan' => ['required', 'string', 'max:30'],
            'interval' => ['required', 'in:' . implode(',', Plan::INTERVALS)],
            'wallet_id' => ['required', 'integer'],
            'pin' => ['required', 'string'],
        ]);
        $user = $request->user();
        app(PinService::class)->verify($user, $data['pin']);
        $plan = Plan::where('slug', $data['plan'])->first();
        $wallet = Wallet::find($data['wallet_id']);
        if (!$plan || !$wallet) {
            return $this->fail($plan ? 'Choose one of your own wallets to pay from.' : 'Plan not found', $plan ? 422 : 404);
        }
        $sub = $this->plans()->start($user, $plan, $data['interval'], $wallet);

        return $this->ok($sub->status === 'trialing' ? 'Free trial started' : 'Welcome to ' . $plan->name, ['subscription' => $this->plans()->serializeSubscription($sub, $user)], 201);
    }

    // GET /subscription — PLN-03
    public function show(Request $request): JsonResponse
    {
        $sub = $this->plans()->coveringSubscription($request->user());

        return $this->ok('Subscription', ['subscription' => $sub ? $this->plans()->serializeSubscription($sub, $request->user()) : null]);
    }

    private function ownOrFail(Request $request)
    {
        $sub = $this->plans()->ownSubscription($request->user());
        if (!$sub) {
            abort(response()->json(['status' => false, 'message' => 'Only the person who pays can change the subscription.'], 403));
        }

        return $sub;
    }

    // PATCH /subscription {interval?, wallet_id?} — "Switch to monthly", "Paid from · Edit"
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'interval' => ['sometimes', 'in:' . implode(',', Plan::INTERVALS)],
            'wallet_id' => ['sometimes', 'integer'],
        ]);
        $sub = $this->ownOrFail($request);
        if (isset($data['interval'])) {
            $sub = $this->plans()->switchInterval($sub, $data['interval']);
        }
        if (isset($data['wallet_id'])) {
            $wallet = Wallet::find($data['wallet_id']);
            if (!$wallet) {
                return $this->fail('Choose one of your own wallets to pay from.', 422);
            }
            $sub = $this->plans()->payFrom($sub, $wallet);
        }

        return $this->ok('Subscription updated', ['subscription' => $this->plans()->serializeSubscription($sub, $request->user())]);
    }

    // POST /subscription/cancel — "Keep Pro until 24 Nov, then go back to Free"
    public function cancel(Request $request): JsonResponse
    {
        $sub = $this->plans()->cancel($this->ownOrFail($request));

        return $this->ok('Subscription cancelled', ['subscription' => $this->plans()->serializeSubscription($sub, $request->user())]);
    }

    // POST /subscription/resume
    public function resume(Request $request): JsonResponse
    {
        $sub = $this->plans()->resume($this->ownOrFail($request));

        return $this->ok('Subscription kept', ['subscription' => $this->plans()->serializeSubscription($sub, $request->user())]);
    }
}
