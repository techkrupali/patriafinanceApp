<?php

namespace App\Http\Controllers\Api;

use App\Models\AjoCircle;
use App\Models\AjoMember;
use App\Models\AjoSwap;
use App\Models\User;
use App\Models\Wallet;
use App\Services\AjoService;
use App\Services\PinService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Ajo circles (AJO-01…04, INV-J1, WPV-06): start one, invite people or let them
 * join with a code, set the order and start, pay a round, swap turns, remind
 * and replace members. Circles are addressed by their pot wallet's id.
 */
class AjoController extends ApiController
{
    private function circle(Request $request, Wallet $wallet): ?AjoCircle
    {
        $circle = AjoService::make()->forWallet($wallet);

        return $circle && $wallet->isAccessibleBy($request->user()) ? $circle : null;
    }

    private function detail(AjoCircle $circle, Request $request, string $message = 'Circle fetched', int $status = 200): JsonResponse
    {
        return $this->ok($message, ['ajo' => AjoService::make()->detail($circle->refresh(), $request->user())], $status);
    }

    // POST /ajo  {name, contribution, size, frequency, starts_on, late_fee?, late_after_days?}
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'contribution' => ['required', 'numeric', 'min:1'],
            'size' => ['required', 'integer'],
            'frequency' => ['required', 'in:' . implode(',', AjoCircle::FREQUENCIES)],
            'starts_on' => ['required', 'date'],
            'late_fee' => ['nullable', 'numeric', 'min:0'],
            'late_after_days' => ['nullable', 'integer'],
            'allow_swaps' => ['sometimes', 'boolean'],
        ]);
        $data['contribution'] = $this->toKobo((string) $data['contribution']);
        $data['late_fee'] = $this->toKobo((string) ($data['late_fee'] ?? 0));
        $data['late_after_days'] ??= 3;
        $circle = AjoService::make()->create($request->user(), $data);

        return $this->detail($circle, $request, 'Circle created', 201);
    }

    // GET /ajo/{wallet}
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        $circle = $this->circle($request, $wallet);

        return $circle ? $this->detail($circle, $request) : $this->fail('Circle not found', 404);
    }

    // PATCH /ajo/{wallet}  "Edit rules"
    public function update(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'contribution' => ['sometimes', 'nullable', 'numeric', 'min:1'],
            'size' => ['sometimes', 'nullable', 'integer'],
            'frequency' => ['sometimes', 'nullable', 'in:' . implode(',', AjoCircle::FREQUENCIES)],
            'starts_on' => ['sometimes', 'nullable', 'date'],
            'late_fee' => ['sometimes', 'numeric', 'min:0'],
            'late_after_days' => ['sometimes', 'integer'],
            'allow_swaps' => ['sometimes', 'boolean'],
        ]);
        foreach (['contribution', 'late_fee'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = $this->toKobo((string) $data[$k]);
            }
        }
        AjoService::make()->updateRules($circle, $request->user(), $data);

        return $this->detail($circle, $request, 'Rules saved');
    }

    // POST /ajo/{wallet}/invite  {invitee_user_id | identifier}
    public function invite(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        [$invitee, $identifier] = $this->invitee($request);
        AjoService::make()->invite($circle, $request->user(), $invitee, $identifier);

        return $this->detail($circle, $request, 'Invitation sent', 201);
    }

    // POST /ajo/{wallet}/start  {order_mode, order?, allow_swaps}
    public function start(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $data = $request->validate([
            'order_mode' => ['required', 'in:random,agreed'],
            'order' => ['nullable', 'array'],
            'order.*' => ['integer'],
            'allow_swaps' => ['sometimes', 'boolean'],
        ]);
        AjoService::make()->start($circle, $request->user(), $data['order_mode'], $data['order'] ?? null, (bool) ($data['allow_swaps'] ?? true));

        return $this->detail($circle, $request, 'The circle has started');
    }

    // POST /ajo/{wallet}/cancel
    public function cancel(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        AjoService::make()->cancel($circle, $request->user());

        return $this->detail($circle, $request, 'Circle cancelled');
    }

    // POST /ajo/{wallet}/pay  {pin, contribution_id?, from_wallet_id?}
    public function pay(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $data = $request->validate([
            'pin' => ['required', self::TXN_PIN],
            'contribution_id' => ['nullable', 'integer'],
            'from_wallet_id' => ['nullable', 'integer'],
        ]);
        app(PinService::class)->verify($request->user(), $data['pin']);
        $k = AjoService::make()->payNow($circle, $request->user(), $data['contribution_id'] ?? null, $data['from_wallet_id'] ?? null);

        return $this->ok('Paid', [
            'paid' => ['amount' => number_format($k->total() / 100, 2, '.', ''), 'round' => $k->round, 'reference' => $k->reference],
            'ajo' => AjoService::make()->detail($circle->refresh(), $request->user()),
        ]);
    }

    // PATCH /ajo/{wallet}/me  {auto_pay}
    public function me(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $data = $request->validate(['auto_pay' => ['required', 'boolean']]);
        AjoService::make()->setAutoPay($circle, $request->user(), $data['auto_pay']);

        return $this->detail($circle, $request, $data['auto_pay'] ? 'Pays automatically' : 'You pay yourself');
    }

    // POST /ajo/{wallet}/remind  "Remind all"
    public function remind(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $sent = AjoService::make()->remindAll($circle, $request->user());

        return $this->ok($sent ? "Reminded {$sent}" : 'Everyone has paid', ['sent' => $sent]);
    }

    // POST /ajo/{wallet}/swaps  {member_id}  "Ask to swap"
    public function swap(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        $data = $request->validate(['member_id' => ['required', 'integer']]);
        AjoService::make()->requestSwap($circle, $request->user(), (int) $data['member_id']);

        return $this->detail($circle, $request, 'Swap asked', 201);
    }

    // POST /ajo-swaps/{swap}/respond  {accept}
    public function respondSwap(Request $request, AjoSwap $swap): JsonResponse
    {
        $data = $request->validate(['accept' => ['required', 'boolean']]);
        $swap = AjoService::make()->respondSwap($swap, $request->user(), $data['accept']);
        $circle = AjoCircle::findOrFail($swap->circle_id);

        return $this->detail($circle, $request, $data['accept'] ? 'Turns swapped' : 'You kept your turn');
    }

    // POST /ajo/{wallet}/members/{member}/replace  {invitee_user_id | identifier}
    public function replace(Request $request, Wallet $wallet, AjoMember $member): JsonResponse
    {
        if (!$circle = $this->circle($request, $wallet)) {
            return $this->fail('Circle not found', 404);
        }
        [$invitee, $identifier] = $this->invitee($request);
        AjoService::make()->replace($circle, $request->user(), $member, $invitee, $identifier);

        return $this->detail($circle, $request, 'Invitation sent', 201);
    }

    // GET /ajo-codes/{code}  what joining means (INV-J1)
    public function preview(Request $request, string $code): JsonResponse
    {
        $circle = AjoService::make()->byCode($code);

        return $this->ok('Circle found', ['ajo' => AjoService::make()->preview($circle, $request->user())]);
    }

    // POST /ajo-codes/{code}/join  {auto_pay}
    public function joinByCode(Request $request, string $code): JsonResponse
    {
        $data = $request->validate(['auto_pay' => ['sometimes', 'boolean']]);
        $service = AjoService::make();
        $circle = $service->byCode($code);
        $service->join($circle, $request->user(), (bool) ($data['auto_pay'] ?? true));

        return $this->detail($circle, $request, "You've joined", 201);
    }

    /** @return array{0: ?User, 1: string} */
    private function invitee(Request $request): array
    {
        $data = $request->validate([
            'invitee_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'identifier' => ['required_without:invitee_user_id', 'nullable', 'string', 'max:150'],
        ]);
        $invitee = !empty($data['invitee_user_id']) ? User::find($data['invitee_user_id']) : null;

        return [$invitee, trim((string) ($data['identifier'] ?? ''))];
    }
}
