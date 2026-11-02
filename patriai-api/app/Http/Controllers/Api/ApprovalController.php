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

        if ($scope === 'mine') {
            $query = ApprovalRequest::with(['wallet', 'initiator'])
                ->where('initiator_id', $user->id)
                ->when($status, fn (Builder $q, $s) => $q->where('status', $s));
        } else {
            $walletIds = $this->approvableWalletIds($user);
            $query = ApprovalRequest::with(['wallet', 'initiator'])
                ->whereIn('wallet_id', $walletIds)
                ->where('initiator_id', '!=', $user->id)
                ->where('status', $status ?: 'pending')
                ->whereDoesntHave('responses', fn (Builder $q) => $q->where('approver_id', $user->id));
        }

        $items = $query->latest()->get()
            // Named approvers, rule changes and unlocking ask particular people (WAL-08/11).
            ->filter(fn ($r) => $scope === 'mine' || !isset($r->payload['approver_ids']) || in_array($user->id, array_map('intval', (array) $r->payload['approver_ids']), true))
            ->values()
            ->map(fn ($r) => $this->serializeApprovalRequest($r, $user));

        return $this->ok('Approvals fetched', ['approvals' => $items]);
    }

    // GET /approvals/{approvalRequest}
    public function show(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $user = $request->user();
        $accessible = $approvalRequest->initiator_id === $user->id
            || $approvalRequest->wallet->isAccessibleBy($user);
        if (!$accessible) {
            return $this->fail('Approval request not found', 404);
        }

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

    // POST /approvals/{approvalRequest}/respond  { decision: approve|reject, note? }
    public function respond(Request $request, ApprovalRequest $approvalRequest): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);

        $req = ApprovalService::make()->respond($approvalRequest, $request->user(), $data['decision'], $data['note'] ?? null);

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

        $approvalRequest->update(['status' => 'cancelled']);

        return $this->ok('Approval request cancelled', [
            'approval' => $this->serializeApprovalRequest($approvalRequest->load(['wallet', 'initiator']), $request->user()),
        ]);
    }
}
