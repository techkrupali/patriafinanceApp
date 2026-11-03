<?php

namespace App\Http\Controllers\Api;

use App\Models\SavedAccountGroup;
use App\Models\ScheduledPayment;
use App\Models\Wallet;
use App\Services\PinService;
use App\Services\ScheduledPaymentService;
use App\Services\SecurityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** SND-14 schedule or repeat a payment; SND-15 what goes out on a date. */
class ScheduledPaymentController extends ApiController
{
    // GET /scheduled-payments
    public function index(Request $request): JsonResponse
    {
        $o = ScheduledPaymentService::make()->overview($request->user());

        return $this->ok('Scheduled payments', [
            'next_30_days' => $this->naira($o['next_30_days']),
            'short_count' => $o['short_count'],
            'items' => array_map(fn ($r) => [
                'id' => $r['id'],
                'kind' => $r['kind'],
                'title' => $r['title'],
                'when' => $r['when'],
                'from' => $r['from'],
                'amount' => $this->naira($r['amount']),
                'next_on' => $r['next_on']?->toIso8601String(),
                'paused' => $r['paused'],
                'short' => $r['short'] === null ? null : $this->naira($r['short']),
                'approval' => $r['approval'],
                'wallet_id' => $r['wallet_id'] ?? null,
                'last_result' => $r['last_result'],
                'last_reason' => $r['last_reason'],
            ], $o['items']),
        ]);
    }

    /**
     * POST /scheduled-payments
     * { from_wallet_id, amount, note?, budget_category_id?, skip_if_over?, destination, frequency, starts_at, ends_after?, pin, two_factor_code? }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_wallet_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'note' => ['nullable', 'string', 'max:200'],
            'budget_category_id' => ['nullable', 'integer'],
            'skip_if_over' => ['nullable', 'boolean'],
            'destination.kind' => ['required', 'in:user,bank,group'],
            'destination.identifier' => ['required_if:destination.kind,user', 'nullable', 'string'],
            'destination.group_id' => ['required_if:destination.kind,group', 'nullable', 'integer'],
            'destination.bank_code' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.account_number' => ['required_if:destination.kind,bank', 'nullable', 'digits:10'],
            'destination.account_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.bank_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            // As the person knows them ("Bisi", "Mama Okafor"); the destination still has to be real.
            'to_name' => ['nullable', 'string', 'max:160'],
            'frequency' => ['required', 'in:' . implode(',', ScheduledPayment::FREQUENCIES)],
            'starts_at' => ['required', 'date'],
            'ends_after' => ['nullable', 'integer', 'min:1', 'max:520'],
            // RUL-02…05: a name, "first Sunday of the month", an end date, ask first, if short.
            'name' => ['nullable', 'string', 'max:80'],
            'week_of_month' => ['nullable', 'integer', 'between:1,5'],
            'weekday' => ['nullable', 'integer', 'between:1,7', 'required_with:week_of_month'],
            'ends_on' => ['nullable', 'date'],
            'confirm' => ['nullable', 'array'],
            'confirm.user_ids' => ['required_with:confirm', 'array', 'min:1', 'max:6'],
            'confirm.user_ids.*' => ['integer'],
            'confirm.mode' => ['nullable', 'in:any,all'],
            'short_policy' => ['nullable', 'array'],
            'short_policy.check_days' => ['nullable', 'integer', 'between:1,7'],
            'short_policy.remind_day_before' => ['nullable', 'boolean'],
            'short_policy.on_day' => ['required_with:short_policy', 'in:topup_main,pay_what_there,skip,cancel'],
            'pin' => ['required', self::TXN_PIN],
            'two_factor_code' => ['nullable', 'string'],
        ]);
        $user = $request->user();
        app(PinService::class)->verify($user, $data['pin']);
        $amount = $this->toKobo($data['amount']);
        // ME-08: a big repeat payment is authorised with two-step once, now.
        if ($user->hasTwoFactor() && $amount > SecurityService::TWO_FACTOR_OVER) {
            if (empty($data['two_factor_code'])) {
                if ($user->two_factor_method !== 'authenticator') {
                    SecurityService::make()->sendTwoFactorCode($user);
                }

                return response()->json(['status' => false, 'message' => 'Enter your two-step code to schedule over ₦500,000.', 'data' => ['code' => 'two_factor_required', 'method' => $user->two_factor_method]], 422);
            }
            SecurityService::make()->verifyTwoFactorCode($user, $data['two_factor_code']);
        }

        $from = Wallet::find($data['from_wallet_id']);
        if (!$from || !$from->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        $dest = $data['destination'];
        $toName = match ($dest['kind']) {
            'user' => ($payee = $this->findPayee((string) $dest['identifier'])) && $payee->id !== $user->id ? $payee->fullName() : null,
            'group' => SavedAccountGroup::where('user_id', $user->id)->find((int) $dest['group_id'])?->name,
            default => $dest['account_name'],
        };
        if (!$toName) {
            return $this->fail('Recipient not found', 404);
        }
        $destination = array_filter(array_intersect_key($dest, array_flip(['kind', 'identifier', 'group_id', 'bank_code', 'account_number', 'account_name', 'bank_name'])), fn ($v) => $v !== null);

        $payment = ScheduledPaymentService::make()->create($user, [
            'from' => $from,
            'amount' => $amount,
            'note' => $data['note'] ?? null,
            'budget_category_id' => $data['budget_category_id'] ?? null,
            'skip_if_over' => (bool) ($data['skip_if_over'] ?? false),
            'destination' => $destination,
            'to_name' => trim((string) ($data['to_name'] ?? '')) ?: $toName,
            'frequency' => $data['frequency'],
            'starts_at' => Carbon::parse($data['starts_at'])->utc(),
            'ends_after' => $data['ends_after'] ?? null,
        ]);
        // Confirmers must share the wallet it pays from (or be you).
        $confirm = null;
        if (!empty($data['confirm']['user_ids'])) {
            $allowed = $from->members()->where('status', 'active')->pluck('user_id')->push($from->user_id)->push($user->id)->unique();
            $ids = array_values(array_filter(array_map('intval', $data['confirm']['user_ids']), fn ($id) => $allowed->contains($id)));
            $confirm = $ids ? ['user_ids' => $ids, 'mode' => $data['confirm']['mode'] ?? 'any'] : null;
        }
        $extra = array_filter([
            'name' => isset($data['name']) ? trim($data['name']) : null,
            'week_of_month' => $data['week_of_month'] ?? null,
            'weekday' => $data['weekday'] ?? null,
            'ends_on' => $data['ends_on'] ?? null,
            'confirm' => $confirm,
            'short_policy' => isset($data['short_policy']) ? [
                'check_days' => (int) ($data['short_policy']['check_days'] ?? 3),
                'remind_day_before' => (bool) ($data['short_policy']['remind_day_before'] ?? true),
                'on_day' => $data['short_policy']['on_day'],
            ] : null,
        ], fn ($v) => $v !== null && $v !== '');
        if ($extra) {
            $payment->update($extra);
            // "First Sunday of the month": the first date follows the weekday rule.
            if (isset($extra['week_of_month'])) {
                $payment->update(['next_run_at' => $payment->fresh()->occurrence(0)]);
            }
        }

        return $this->ok('Scheduled', $this->serialize($payment->fresh()->load('fromWallet')), 201);
    }

    // GET /scheduled-payments/{id}
    public function show(Request $request, int $id): JsonResponse
    {
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->find($id);

        return $p ? $this->ok('Scheduled payment', $this->serialize($p)) : $this->fail('Not found', 404);
    }

    // PATCH /scheduled-payments/{id}  { status: active|paused }
    public function update(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:active,paused']]);
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->whereIn('status', ['active', 'paused'])->find($id);
        if (!$p) {
            return $this->fail('Not found', 404);
        }
        // Resuming: the next date from now on (none missed are paid).
        $next = $p->next_run_at;
        if ($data['status'] === 'active') {
            $n = $p->runs;
            while (($at = $p->occurrence($n)) && $at->lt(now())) {
                $n++;
            }
            if (!$at || ($p->ends_after !== null && $n >= $p->ends_after)) {
                $p->update(['status' => 'done', 'next_run_at' => null]);

                return $this->ok('Finished', $this->serialize($p));
            }
            $p->runs = $n;
            $next = $at;
        }
        $p->update(['status' => $data['status'], 'next_run_at' => $next]);

        return $this->ok($data['status'] === 'paused' ? 'Paused' : 'Back on', $this->serialize($p));
    }

    // DELETE /scheduled-payments/{id}
    public function destroy(Request $request, int $id): JsonResponse
    {
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->whereIn('status', ['active', 'paused'])->find($id);
        if (!$p) {
            return $this->fail('Not found', 404);
        }
        $p->update(['status' => 'cancelled', 'next_run_at' => null]);

        return $this->ok('Cancelled', $this->serialize($p));
    }

    private function serialize(ScheduledPayment $p): array
    {
        return [
            'id' => $p->id,
            'to_name' => $p->to_name,
            'destination' => $p->destination,
            'amount' => $this->naira($p->amount),
            'note' => $p->note,
            'from' => ['id' => $p->from_wallet_id, 'name' => $p->fromWallet?->name],
            'frequency' => $p->frequency,
            'when' => $p->when(),
            'starts_at' => $p->starts_at->toIso8601String(),
            'ends_after' => $p->ends_after,
            'runs' => $p->runs,
            'next_run_at' => $p->next_run_at?->toIso8601String(),
            'status' => $p->status,
            'skip_if_over' => $p->skip_if_over,
            'last_run_at' => $p->last_run_at?->toIso8601String(),
            'last_result' => $p->last_result,
            'last_reason' => $p->last_reason,
            'name' => $p->name,
            'week_of_month' => $p->week_of_month,
            'weekday' => $p->weekday,
            'ends_on' => $p->ends_on?->toDateString(),
            'confirm' => $p->confirm,
            'confirmed' => ScheduledPaymentService::make()->confirmed($p),
            'short_policy' => $p->short_policy,
            // RUL-08 "Warned you Thu 29 Oct and Sat 31 Oct".
            'warned_on' => collect($p->warned ?? [])->filter(fn ($w) => str_contains($w, ':on:'))->map(fn ($w) => substr($w, strrpos($w, ':') + 1))->values()->all(),
        ];
    }

    // POST /scheduled-payments/{id}/confirm — RUL-04 "Ask before each payment".
    public function confirm(Request $request, int $id): JsonResponse
    {
        $p = ScheduledPayment::with('fromWallet')->where('status', 'active')->find($id);
        if (!$p) {
            return $this->fail('Not found', 404);
        }

        return $this->ok('Confirmed', $this->serialize(ScheduledPaymentService::make()->confirm($p, $request->user())->load('fromWallet')));
    }

    // GET /scheduled-payments/{id}/shortfall — RUL-07.
    public function shortfall(Request $request, int $id): JsonResponse
    {
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->where('status', 'active')->find($id);

        return $p ? $this->ok('Shortfall', ScheduledPaymentService::make()->shortfall($p) + ['payment' => $this->serialize($p)]) : $this->fail('Not found', 404);
    }

    // POST /scheduled-payments/{id}/send-now { pin, amount? } — RUL-07 "Pay ₦28,400 now" / RUL-08 "Send it now instead".
    public function sendNow(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['pin' => ['required', self::TXN_PIN], 'amount' => ['nullable', 'numeric', 'min:1']]);
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->whereIn('status', ['active', 'paused', 'done'])->find($id);
        if (!$p) {
            return $this->fail('Not found', 404);
        }
        app(PinService::class)->verify($request->user(), $d['pin']);
        $amount = isset($d['amount']) ? min($this->toKobo($d['amount']), $p->amount) : null;
        $r = ScheduledPaymentService::make()->sendNow($p, $amount);
        if (in_array($r['result'], ['failed', 'skipped'], true)) {
            return $this->fail($r['reason'] ?? 'It did not go through.', 422);
        }

        return $this->ok($r['result'] === 'sent' ? 'Sent' : 'On its way', $r + ['payment' => $this->serialize($p->fresh()->load('fromWallet'))]);
    }

    // POST /scheduled-payments/{id}/cancel-next — RUL-07 "Cancel this payment — the rule stays on for next month".
    public function cancelNext(Request $request, int $id): JsonResponse
    {
        $p = ScheduledPayment::with('fromWallet')->where('user_id', $request->user()->id)->where('status', 'active')->find($id);
        if (!$p) {
            return $this->fail('Not found', 404);
        }
        ScheduledPaymentService::make()->passOver($p, $p->next_run_at ?? now(), 'cancelled', 'You cancelled this one. Nothing was sent.');

        return $this->ok('Cancelled', $this->serialize($p->fresh()->load('fromWallet')));
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }
}
