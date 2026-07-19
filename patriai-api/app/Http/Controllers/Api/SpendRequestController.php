<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SpendRequestController extends ApiController
{
    /**
     * POST /wallets/{wallet}/spend-requests
     *
     * A member who may REQUEST spends but cannot move money out directly (e.g. a
     * child/contributor with canRequest=true but canSpend/canWithdraw=false)
     * submits a spend request against a wallet. It is recorded as a pending
     * ApprovalRequest routed to the wallet's owner/co-owners, who sign off through
     * the EXISTING approvals flow — which then executes the transfer through the
     * vetted WalletService engine. This controller writes NO money-movement code;
     * it only calls ApprovalService::create(), mirroring TransferController's
     * destination/payload shapes so the existing executor understands them.
     */
    public function store(Request $request, Wallet $wallet): JsonResponse
    {
        $user = $request->user();

        // Only members with visibility on the wallet may interact with it; a
        // non-member (or inactive member) must not learn the wallet exists.
        if (!$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }

        // The requester must hold the Request grant. Owners/co_owners can spend
        // directly so they normally wouldn't use this, but they are not hard-blocked
        // (canRequest returns true for them).
        if (!$wallet->canRequest($user)) {
            return $this->fail('You do not have permission to request spends on this wallet', 403);
        }

        // Same destination schema as TransferController::store; `from` is the route
        // {wallet}, so there is no from_wallet_id here.
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'pin' => ['required', 'digits:4'],
            'description' => ['nullable', 'string', 'max:200'],
            'destination.kind' => ['required', 'in:wallet,user,bank'],
            'destination.wallet_id' => ['required_if:destination.kind,wallet', 'nullable', 'integer'],
            'destination.identifier' => ['required_if:destination.kind,user', 'nullable', 'string'],
            'destination.bank_code' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.account_number' => ['required_if:destination.kind,bank', 'nullable', 'digits:10'],
            'destination.account_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
            'destination.bank_name' => ['required_if:destination.kind,bank', 'nullable', 'string'],
        ]);

        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $amountKobo = $this->toKobo($data['amount']);
        $dest = $data['destination'];
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        // A frozen wallet or one currently outside its scheduled-access window can
        // never let money out, so a request that could never execute is rejected now.
        if ($wallet->isFrozen()) {
            return $this->fail('This wallet is frozen. Spending is blocked until it is unfrozen.', 422);
        }
        if (!$wallet->withinAccessWindow()) {
            return $this->fail('This wallet is outside its scheduled access window. Spending is not allowed right now.', 422);
        }

        // Fee only applies to external (bank) transfers; wallet/user moves are free.
        $spendKobo = $amountKobo + ($dest['kind'] === 'bank' ? $feeKobo : 0);

        // Cannot request more than is genuinely available: pending approvals and
        // (for project wallets) milestone reservations are subtracted here.
        if ($spendKobo > $wallet->availableToSpend()) {
            return $this->fail('Amount exceeds available balance (funds are reserved for pending approvals/milestones).', 422);
        }

        // Per-member request limit (kobo, nullable): a child/contributor may be capped
        // at how much they can request in a single spend. The owner has no member row
        // and therefore no limit.
        $member = $wallet->members()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->first();
        $requestLimit = $member?->permissions['request_limit'] ?? null;
        if ($requestLimit !== null && $amountKobo > (int) $requestLimit) {
            return $this->fail('This exceeds your request limit of ₦' . number_format(((int) $requestLimit) / 100, 2, '.', ''), 422);
        }

        // Resolve the destination and build the action + payload EXACTLY as
        // TransferController does, so the existing approval executor reads them back
        // correctly. Non-bank moves carry no fee.
        switch ($dest['kind']) {
            case 'wallet':
                $to = Wallet::find($dest['wallet_id']);
                if (!$to || !$to->isAccessibleBy($user)) {
                    return $this->fail('Destination wallet not found', 404);
                }
                $action = 'transfer_wallet';
                $feeKobo = 0;
                $payload = [
                    'wallet_id' => $to->id,
                    'description' => $data['description'] ?? null,
                ];
                break;

            case 'user':
                $recipient = str_contains($dest['identifier'], '@')
                    ? User::where('email', strtolower($dest['identifier']))->first()
                    : User::where('phone', $dest['identifier'])->first();

                if (!$recipient || $recipient->id === $user->id) {
                    return $this->fail('Recipient not found', 404);
                }
                $to = $recipient->mainWallet();
                if (!$to) {
                    return $this->fail('Recipient has no active wallet', 422);
                }
                $action = 'transfer_user';
                $feeKobo = 0;
                $payload = [
                    'identifier' => $dest['identifier'],
                    'description' => $data['description'] ?? null,
                ];
                break;

            default: // bank
                $action = 'transfer_bank';
                // $feeKobo keeps the configured external-transfer fee.
                $payload = [
                    'bank_code' => $dest['bank_code'],
                    'account_number' => $dest['account_number'],
                    'account_name' => $dest['account_name'],
                    'bank_name' => $dest['bank_name'],
                    'description' => $data['description'] ?? null,
                ];
        }

        // Record the pending approval + notify approvers. NO money moves here — the
        // existing execute-on-approval path performs the vetted transfer later. If
        // there are too few eligible approvers, create() throws ValidationException
        // and Laravel returns 422 (same as TransferController).
        $req = ApprovalService::make()->create($wallet, $user, $action, $amountKobo, $feeKobo, $data['description'] ?? null, $payload);

        return $this->ok('Spend request submitted for approval', [
            'pending_approval' => true,
            'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
        ]);
    }
}
