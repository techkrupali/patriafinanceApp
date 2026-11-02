<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Services\ApprovalService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalController extends ApiController
{
    /** Wallet ids on which this user may act as an approver. */
    // GET /approvals?status=&scope=to_me|mine|wallet&wallet_id=
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->query('scope', 'to_me');
        $status = $request->query('status');

        // WAL-03 "Requests": every request on one wallet, for anyone in it.
        if ($scope === 'wallet') {
            $wallet = \App\Models\Wallet::find((int) $request->query('wallet_id'));
            if (!$wallet || !$wallet->isAccessibleBy($user)) {
                return $this->fail('Wallet not found', 404);
            }
            $items = $wallet->approvalRequests()->with(['wallet', 'initiator'])->latest()->orderByDesc('id')->limit(50)->get()
                ->map(fn ($r) => $this->serializeApprovalRequest($r, $user));

            return $this->ok('Approvals fetched', ['approvals' => $items]);
        }

        // APR-01 "History": answered, paid, declined, expired or cancelled — asked of me, or mine.
        if ($scope === 'history') {
            $walletIds = $this->approvableWalletIds($user);
            $items = ApprovalRequest::with(['wallet', 'initiator'])
                ->where('status', '!=', 'pending')
                ->where(fn (Builder $q) => $q->where('initiator_id', $user->id)
                    ->orWhereIn('wallet_id', $walletIds)
                    ->orWhereHas('responses', fn (Builder $r) => $r->where('approver_id', $user->id)))
                ->latest()->orderByDesc('id')->limit(50)->get()
                ->filter(fn ($r) => $r->initiator_id === $user->id || !isset($r->payload['approver_ids']) || in_array($user->id, array_map('intval', (array) $r->payload['approver_ids']), true) || $r->responses()->where('approver_id', $user->id)->exists())
                ->values()
                ->map(fn ($r) => $this->serializeApprovalRequest($r, $user));

            return $this->ok('Approvals fetched', ['approvals' => $items]);
        }

        if ($scope === 'mine') {
            $query = ApprovalRequest::with(['wallet', 'initiator'])
                ->where('initiator_id', $user->id)
                ->when($status, fn (Builder $q, $s) => $q->where('status', $s));
        } else {
            // APR-09: also what someone away handed to me.
            $away = \App\Services\AwayService::make();
            $walletIds = $this->approvableWalletIds($user);
            foreach ($away->principalsFor($user) as $principal) {
                $walletIds = $walletIds->concat($this->approvableWalletIds($principal));
            }
            $query = ApprovalRequest::with(['wallet', 'initiator'])
                ->whereIn('wallet_id', $walletIds->unique()->values())
                ->where('initiator_id', '!=', $user->id)
                ->where('status', $status ?: 'pending');
        }

        $items = $query->latest()->get()
            // Named approvers, rule changes and unlocking ask particular people (WAL-08/11) — or someone away asked me.
            ->filter(function ($r) use ($scope, $user) {
                if ($scope === 'mine') {
                    return true;
                }
                $asked = (!isset($r->payload['approver_ids']) ? $r->wallet->canApprove($user) : in_array($user->id, array_map('intval', (array) $r->payload['approver_ids']), true))
                    && !$r->responses()->where('approver_id', $user->id)->exists();

                return $asked || \App\Services\AwayService::make()->actingFor($r, $user) !== null;
            })
            ->values()
            ->map(fn ($r) => $this->serializeApprovalRequest($r, $user));

        return $this->ok('Approvals fetched', ['approvals' => $items]);
    }

    // GET /approvals/{approvalRequest}
    public function show(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $user = $request->user();
        $accessible = $approvalRequest->initiator_id === $user->id
            || $approvalRequest->wallet->isAccessibleBy($user)
            // APR-09: approving for someone who's away.
            || \App\Services\AwayService::make()->actingFor($approvalRequest, $user) !== null;
        if (!$accessible) {
            return $this->fail('Approval request not found', 404);
        }

        // APR-07 "Emeka viewed it".
        ApprovalService::make()->viewed($approvalRequest, $user);
        $approvalRequest->load(['wallet', 'initiator', 'responses.approver']);

        $data = $this->serializeApprovalRequest($approvalRequest, $user);
        $data['responses'] = $approvalRequest->responses->map(fn ($r) => [
            'approver' => $r->approver ? ['id' => $r->approver->id, 'name' => $r->approver->fullName()] : null,
            'decision' => $r->decision,
            'note' => $r->note,
            'created_at' => $r->created_at?->toIso8601String(),
        ]);

        return $this->ok('Approval request fetched', ['approval' => $data]);
    }

    // POST /approvals/{approvalRequest}/respond  { decision: approve|reject, pin (to approve), note?, offer? }
    public function respond(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        // Steward's approve tool sets this server-side once the user confirmed in the chat.
        $inChat = (bool) $request->attributes->get('confirmed_in_chat');
        $data = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
            // APR-03 "Approve with PIN": a yes moves money.
            'pin' => [$inChat ? 'nullable' : 'required_if:decision,approve', 'nullable', self::TXN_PIN],
            'note' => ['nullable', 'string', 'max:200'],
            // APR-04 "Offer ₦10,000 instead".
            'offer' => ['nullable', 'numeric', 'min:1'],
        ]);
        if ($data['decision'] === 'approve' && !$inChat) {
            app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        }

        $req = ApprovalService::make()->respond($approvalRequest, $request->user(), $data['decision'], $data['note'] ?? null, isset($data['offer']) ? $this->toKobo((string) $data['offer']) : null);

        return $this->ok('Response recorded', [
            'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $request->user()),
        ]);
    }

    // POST /approvals/{approvalRequest}/cancel
    // POST /approvals/{approvalRequest}/remind — SND-10 "Remind Emeka" (once an hour).
    public function remind(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $user = $request->user();
        if ($approvalRequest->initiator_id !== $user->id) {
            return $this->fail('Only the person who asked can send a reminder', 403);
        }
        if ($approvalRequest->status !== 'pending') {
            return $this->fail('This request is no longer pending', 422);
        }
        $key = "approval:{$approvalRequest->id}:remind";
        if (!\Illuminate\Support\Facades\Cache::add($key, 1, now()->addHour())) {
            return $this->fail('You reminded them less than an hour ago.', 429);
        }
        // APR-07 "we reminded him at 2 pm".
        $approvalRequest->forceFill(['payload' => array_merge($approvalRequest->payload ?? [], ['reminded_at' => now()->toIso8601String()])])->saveQuietly();
        $approvalRequest->load('wallet');
        // Named approvers (MLS-03, WAL-08) are the only ones this request waits on.
        $asked = isset($approvalRequest->payload['approver_ids'])
            ? collect($approvalRequest->payload['approver_ids'])->map(fn ($id) => (int) $id)->reject(fn ($id) => $id === $user->id)
            : $approvalRequest->wallet->eligibleApprovers($user->id);
        $waiting = $asked->diff($approvalRequest->responses()->pluck('approver_id'));
        foreach (\App\Models\User::whereIn('id', $waiting)->get() as $approver) {
            \App\Services\NotificationService::make()->push(
                $approver,
                'approval_reminder',
                "{$user->first_name} is waiting for your yes",
                '₦' . number_format($approvalRequest->amount / 100) . ' from ' . $approvalRequest->wallet->name . ($approvalRequest->description ? " · {$approvalRequest->description}" : '') . '.',
                ['approval_request_id' => $approvalRequest->id, 'wallet_id' => $approvalRequest->wallet_id],
            );
        }

        return $this->ok('Reminder sent', ['reminded' => $waiting->count()]);
    }

    public function cancel(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        if ($approvalRequest->initiator_id !== $request->user()->id) {
            return $this->fail('Only the initiator can cancel this request', 403);
        }
        if ($approvalRequest->status !== 'pending') {
            return $this->fail('This request is no longer pending', 422);
        }
        // APR-08 "Paid another way · Wrong amount · No longer needed".
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:120']]);

        $approvalRequest = ApprovalService::make()->cancel($approvalRequest, $request->user(), $data['reason'] ?? null);

        return $this->ok('Approval request cancelled', [
            'approval' => $this->serializeApprovalRequest($approvalRequest->load(['wallet', 'initiator']), $request->user()),
        ]);
    }

    // POST /approvals/{approvalRequest}/questions  {body, pause?} — APR-05 "Ask a question"
    public function ask(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:300'], 'pause' => ['sometimes', 'boolean']]);
        $req = ApprovalService::make()->ask($approvalRequest->load('wallet'), $request->user(), trim($data['body']), (bool) ($data['pause'] ?? false));

        return $this->ok('Question sent', ['approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $request->user())]);
    }

    // POST /approvals/{approvalRequest}/answer  {body} — the person who asked answers
    public function answer(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:300']]);
        $req = ApprovalService::make()->answer($approvalRequest, $request->user(), trim($data['body']));

        return $this->ok('Answer sent', ['approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $request->user())]);
    }

    // GET /me/away — APR-09
    public function away(Request $request): JsonResponse
    {
        return $this->ok('Away mode', ['away' => \App\Services\AwayService::make()->summary($request->user())]);
    }

    // PUT /me/away  {delegate_id, from, to, max_amount?, pin}
    public function setAway(Request $request): JsonResponse
    {
        $data = $request->validate([
            'delegate_id' => ['required', 'integer'],
            'from' => ['required', 'date'],
            'to' => ['required', 'date'],
            'max_amount' => ['nullable', 'numeric', 'min:1'],
            'pin' => ['required', self::TXN_PIN],
        ]);
        app(\App\Services\PinService::class)->verify($request->user(), $data['pin']);
        if (isset($data['max_amount'])) {
            $data['max_amount'] = $this->toKobo((string) $data['max_amount']);
        }
        \App\Services\AwayService::make()->set($request->user(), $data);

        return $this->ok('Away mode on', ['away' => \App\Services\AwayService::make()->summary($request->user()->refresh())]);
    }

    // DELETE /me/away
    public function clearAway(Request $request): JsonResponse
    {
        \App\Services\AwayService::make()->off($request->user());

        return $this->ok('Away mode off', ['away' => null]);
    }
}
