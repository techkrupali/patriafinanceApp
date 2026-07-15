<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalController extends ApiController
{
    /** Wallet ids on which this user may act as an approver. */
    private function approvableWalletIds(User $user): \Illuminate\Support\Collection
    {
        $owned = Wallet::where('user_id', $user->id)->pluck('id');

        $member = \App\Models\WalletMember::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('role', '!=', 'viewer')
            ->where(function ($q) {
                $q->whereIn('role', ['owner', 'co_owner', 'admin'])->orWhere('can_approve', true);
            })
            ->pluck('wallet_id');

        return $owned->concat($member)->unique()->values();
    }

    // GET /approvals?status=&scope=to_me|mine
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $scope = $request->query('scope', 'to_me');
        $status = $request->query('status');

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

        $items = $query->latest()->get()->map(fn ($r) => $this->serializeApprovalRequest($r, $user));

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
            'approver' => $r->approver?->fullName(),
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
