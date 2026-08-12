<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\ApprovalController;
use App\Models\ApprovalRequest;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * ACTION tool: approve an existing PENDING withdrawal approval request.
 *
 * Reuses the existing approval stack verbatim — discovery via
 * ApprovalController::index / show and the approval itself via
 * ApprovalController::respond → ApprovalService::respond, which stays the sole
 * authority (canApprove permission, not-the-initiator, not-already-responded,
 * pending + not-expired, row-locked execution). The tool adds only a confirmation
 * gate and never accepts a user_id/approver_id — the acting approver is always
 * $request->user().
 *
 * NO SECURE PIN HAND-OFF: unlike initiating a transfer, approving a withdrawal
 * requires no PIN/OTP in the existing backend — an eligible approver simply signs
 * off. So this tool approves directly (after confirmation); there is no secret to
 * collect. It never accepts a PIN and never moves money itself — reaching the
 * wallet's required approval count triggers the SAME ApprovalService execution
 * path the app's "Approve" button uses.
 *
 * Two calling modes:
 *   - Without approval_request_id: returns the pending withdrawals the user may
 *     approve, so the assistant can find the one the user means. (read-only)
 *   - With approval_request_id but confirmed != true: returns that request's
 *     summary for the user to confirm. (read-only)
 *   - With approval_request_id + confirmed = true: records the approval.
 */
class ApproveWithdrawalTool implements AssistantTool
{
    public function name(): string
    {
        return 'approve_withdrawal';
    }

    public function description(): string
    {
        return 'Approve a pending withdrawal that is awaiting the current user\'s '
            .'approval (e.g. "approve John\'s ₦50,000 withdrawal"). '
            ."\n\nHOW TO USE:\n"
            .'1. Call it with NO approval_request_id to list the pending withdrawals '
            .'the user is allowed to approve, then match the one the user means '
            .'(by requester, amount, or wallet).\n'
            .'2. Show the user a summary — requester, wallet, amount, date, status — '
            .'and ask them to confirm.\n'
            .'3. ONLY after they clearly say yes, call it again with that '
            .'approval_request_id and confirmed=true. If they cancel, do not.\n\n'
            .'Approving a withdrawal needs no PIN. You must never ask for a PIN, '
            .'password, or OTP. The backend decides whether the user may approve; '
            .'once the wallet\'s required number of approvals is reached, the '
            .'withdrawal is executed automatically by the backend. Calling with '
            .'confirmed=false (or omitted) never approves anything.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'approval_request_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the pending withdrawal approval request to approve. Omit to list the withdrawals awaiting the user\'s approval.',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to record the approval. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => [],
            'additionalProperties' => false,
            // NOTE: no pin / password / otp / user_id / approver_id field.
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $id = isset($input['approval_request_id']) ? (int) $input['approval_request_id'] : null;
        $confirmed = ($input['confirmed'] ?? false) === true;

        // Mode 1 — discovery: pending withdrawals the user may approve.
        if ($id === null) {
            return ['pending_withdrawals' => $this->pendingWithdrawals($request)];
        }

        // Fetch the request, scoped to what the user can access (reuses show()).
        $model = ApprovalRequest::find($id);
        if (!$model) {
            return ['approved' => false, 'error' => 'I couldn\'t find that withdrawal request.'];
        }

        $summaryResponse = app(ApprovalController::class)->show($request, $model);
        if ($summaryResponse->getStatusCode() >= 400) {
            return ['approved' => false, 'error' => 'I couldn\'t find that withdrawal request in your approvals.'];
        }
        $approval = $summaryResponse->getData(true)['data']['approval'] ?? null;

        if (($approval['action'] ?? null) !== 'withdrawal') {
            return ['approved' => false, 'error' => 'That request isn\'t a withdrawal.'];
        }

        // Mode 2 — confirmation gate. Never approve without an explicit confirmed=true.
        if (!$confirmed) {
            return [
                'approved' => false,
                'needs_confirmation' => true,
                'message' => 'Show the user this withdrawal and ask them to confirm. '
                    .'Call approve_withdrawal again with confirmed=true only after they say yes.',
                'withdrawal' => $this->summary($approval),
            ];
        }

        // Mode 3 — approve via the existing endpoint under the SAME authenticated
        // user. ApprovalService enforces every rule; we never bypass it.
        try {
            $sub = Request::create('/api/v1/approvals/'.$model->id.'/respond', 'POST', ['decision' => 'approve']);
            $sub->setUserResolver(fn () => $request->user());

            $response = app(ApprovalController::class)->respond($sub, $model);
            $result = $response->getData(true)['data']['approval'] ?? [];

            return [
                'approved' => true,
                'withdrawal' => $this->summary($result),
            ];
        } catch (ValidationException $e) {
            // Backend messages are already user-safe (e.g. "no longer pending",
            // "already responded", "not allowed to approve", "expired", "your own
            // request"). Surface the first; never a stack trace.
            $first = collect($e->errors())->flatten()->first() ?? 'The withdrawal could not be approved.';

            return ['approved' => false, 'error' => $first];
        } catch (\Throwable $e) {
            report($e);

            return ['approved' => false, 'error' => 'Sorry, I couldn\'t approve that withdrawal right now.'];
        }
    }

    /** Pending withdrawal approvals the user is authorized to act on (reuses index()). */
    private function pendingWithdrawals(Request $request): array
    {
        $sub = Request::create('/api/v1/approvals', 'GET', ['scope' => 'to_me', 'status' => 'pending']);
        $sub->setUserResolver(fn () => $request->user());

        $list = app(ApprovalController::class)->index($sub)->getData(true)['data']['approvals'] ?? [];

        return collect($list)
            ->filter(fn ($a) => ($a['action'] ?? null) === 'withdrawal')
            ->map(fn ($a) => $this->summary($a))
            ->values()
            ->all();
    }

    /** Compact, model-friendly view of an approval request (already-exposed fields only). */
    private function summary(array $a): array
    {
        return [
            'id' => $a['id'] ?? null,
            'requester' => $a['initiator']['name'] ?? null,
            'wallet' => $a['wallet']['name'] ?? null,
            'amount' => $a['amount'] ?? null,
            'currency' => 'NGN',
            'date' => $a['created_at'] ?? null,
            'reason' => $a['description'] ?? null,
            'reference' => $a['executed_transaction_reference'] ?? null,
            'status' => $a['status'] ?? null,
            'approvals' => isset($a['approvals_count'], $a['required_approvals'])
                ? $a['approvals_count'].' of '.$a['required_approvals']
                : null,
        ];
    }
}
