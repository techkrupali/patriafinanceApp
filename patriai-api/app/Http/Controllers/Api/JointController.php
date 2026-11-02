<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\JointService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Joint wallets after setup (JNT-03/05): changing the rules waits for the other
 * partner's yes, leaving gives notice, and closing needs both PINs.
 */
class JointController extends ApiController
{
    // POST /wallets/{wallet}/joint/changes  {pin, changes: {mine?, partner?, day?, per_payment?, per_day?, expiry_hours?, big_amount?, split?, notice_days?}}
    public function propose(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->partner($request, $wallet)) {
            return $this->fail('Joint wallet not found', 404);
        }
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]] + $this->changeRules());
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);

        $result = JointService::make()->propose($wallet, $request->user(), $this->changesInKobo($data['changes']));

        return $this->ok($result['applied'] ? 'Rules changed' : 'Sent to your partner to confirm', [
            'applied' => $result['applied'],
            'wallet' => $this->serializeWallet($wallet->refresh()),
        ]);
    }

    // POST /wallets/{wallet}/joint/changes/answer  {pin, agree}
    public function answer(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->partner($request, $wallet)) {
            return $this->fail('Joint wallet not found', 404);
        }
        $data = $request->validate(['pin' => ['required', self::TXN_PIN], 'agree' => ['required', 'boolean']]);
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        JointService::make()->answer($wallet, $request->user(), (bool) $data['agree']);

        return $this->ok($data['agree'] ? 'Rules changed' : 'Change declined', ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // POST /wallets/{wallet}/joint/leave  {pin}
    public function leave(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->partner($request, $wallet)) {
            return $this->fail('Joint wallet not found', 404);
        }
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        $ends = JointService::make()->leave($wallet, $request->user());

        return $this->ok("You leave on {$ends->format('j M')}", ['wallet' => $this->serializeWallet($wallet->refresh())]);
    }

    // POST /wallets/{wallet}/joint/close  {pin, shares?: [{user_id, amount}]}
    public function close(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->partner($request, $wallet)) {
            return $this->fail('Joint wallet not found', 404);
        }
        $data = $request->validate([
            'pin' => ['required', self::TXN_PIN],
            'shares' => ['nullable', 'array', 'max:2'],
            'shares.*.user_id' => ['required', 'integer'],
            'shares.*.amount' => ['required', 'numeric', 'min:0'],
        ]);
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        $shares = isset($data['shares'])
            ? collect($data['shares'])->mapWithKeys(fn ($s) => [(int) $s['user_id'] => $this->toKobo((string) $s['amount'])])->all()
            : null;

        $closed = JointService::make()->close($wallet, $request->user(), $shares);

        return $this->ok($closed ? 'Joint wallet closed' : 'Waiting for your partner to confirm with their PIN', [
            'closed' => $closed,
            'wallet' => $this->serializeWallet($wallet->refresh()),
        ]);
    }

    // POST /invitations/{invitation}/joint/suggest  {changes} — INV-O1 "Suggest a change", before accepting
    public function suggest(Request $request, \App\Models\WalletInvitation $invitation): JsonResponse
    {
        $user = $request->user();
        if ($invitation->invitee_user_id !== $user->id || !$invitation->wallet || $invitation->wallet->type !== 'joint') {
            return $this->fail('Invitation not found', 404);
        }
        $data = $request->validate($this->changeRules());
        JointService::make()->suggest($invitation->wallet, $user, $invitation, $this->changesInKobo($data['changes']));

        return $this->ok('Sent to ' . ($invitation->wallet->owner?->first_name ?? 'them') . ' to agree', [
            'joint' => JointService::make()->summary($invitation->wallet->refresh()),
        ]);
    }

    private function changeRules(): array
    {
        return [
            'changes' => ['required', 'array'],
            'changes.mine' => ['nullable', 'numeric', 'min:0'],
            'changes.partner' => ['nullable', 'numeric', 'min:0'],
            'changes.day' => ['nullable', 'integer', 'between:1,28'],
            'changes.per_payment' => ['nullable', 'numeric', 'min:1'],
            'changes.per_day' => ['nullable', 'numeric', 'min:1'],
            'changes.expiry_hours' => ['nullable', 'integer', 'in:' . implode(',', Wallet::APPROVAL_EXPIRY_HOURS)],
            'changes.big_amount' => ['nullable', 'numeric', 'min:1'],
            'changes.split' => ['nullable', 'in:' . implode(',', JointService::SPLITS)],
            'changes.notice_days' => ['nullable', 'integer', 'in:' . implode(',', JointService::NOTICE_DAYS)],
        ];
    }

    private function changesInKobo(array $changes): array
    {
        foreach (['mine', 'partner', 'per_payment', 'per_day', 'big_amount'] as $k) {
            if (isset($changes[$k])) {
                $changes[$k] = $this->toKobo((string) $changes[$k]);
            }
        }

        return $changes;
    }

    /** Only the two partners act on a joint wallet. */
    private function partner(Request $request, Wallet $wallet): bool
    {
        return $wallet->type === 'joint' && in_array($wallet->roleOf($request->user()), ['owner', 'co_owner'], true);
    }
}
