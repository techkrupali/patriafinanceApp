<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ApprovalService;
use App\Services\NotificationService;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferController extends ApiController
{
    /**
     * POST /transfers
     * {
     *   from_wallet_id, amount, pin, description?,
     *   destination: { kind: "wallet"|"user"|"bank", ... }
     * }
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from_wallet_id' => ['required', 'integer', 'exists:wallets,id'],
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

        $user = $request->user();

        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $from = Wallet::find($data['from_wallet_id']);
        if (!$from || !$from->isAccessibleBy($user)) {
            return $this->fail('Source wallet not found', 404);
        }
        if (!$from->canSpend($user)) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }

        $amountKobo = $this->toKobo($data['amount']);
        $service = WalletService::make();
        $dest = $data['destination'];
        $needsApproval = $from->approvalRequiredFor($amountKobo);
        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);

        switch ($dest['kind']) {
            case 'wallet':
                $to = Wallet::find($dest['wallet_id']);
                if (!$to || !$to->isAccessibleBy($user)) {
                    return $this->fail('Destination wallet not found', 404);
                }
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_wallet', $amountKobo, 0, $data['description'] ?? null, [
                        'wallet_id' => $to->id,
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets($from, $to, $amountKobo, $user, $data['description'] ?? null);
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
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_user', $amountKobo, 0, $data['description'] ?? null, [
                        'identifier' => $dest['identifier'],
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $result = $service->transferBetweenWallets(
                    $from,
                    $to,
                    $amountKobo,
                    $user,
                    $data['description'] ?? "Transfer to {$recipient->fullName()}",
                );
                $result['recipient'] = ['name' => $recipient->fullName(), 'email' => $recipient->email];

                NotificationService::make()->push(
                    $recipient,
                    'transfer_received',
                    'You received ₦' . number_format($amountKobo / 100, 2, '.', ''),
                    "{$user->fullName()} sent you ₦" . number_format($amountKobo / 100, 2, '.', '') . '.',
                    [
                        'amount' => number_format($amountKobo / 100, 2, '.', ''),
                        'reference' => $result['reference'],
                        'from' => $user->fullName(),
                    ],
                );
                break;

            default: // bank
                if ($needsApproval) {
                    $req = ApprovalService::make()->create($from, $user, 'transfer_bank', $amountKobo, $feeKobo, $data['description'] ?? null, [
                        'bank_code' => $dest['bank_code'],
                        'account_number' => $dest['account_number'],
                        'account_name' => $dest['account_name'],
                        'bank_name' => $dest['bank_name'],
                        'description' => $data['description'] ?? null,
                    ]);

                    return $this->pendingApproval($req, $user);
                }
                $txn = $service->withdrawToBank(
                    $from,
                    $user,
                    $amountKobo,
                    $dest['bank_code'],
                    $dest['account_number'],
                    $dest['account_name'],
                    $dest['bank_name'],
                    $data['description'] ?? null,
                );
                $result = ['reference' => $txn->reference, 'balance_after' => $txn->balance_after];
        }

        $from->refresh();

        return $this->ok('Transfer successful', [
            'reference' => $result['reference'],
            'balance' => $from->balanceNaira(),
            'recipient' => $result['recipient'] ?? null,
        ]);
    }

    private function pendingApproval(ApprovalRequest $req, User $user): JsonResponse
    {
        return $this->ok('Transfer submitted for approval', [
            'pending_approval' => true,
            'approval' => $this->serializeApprovalRequest($req->load(['wallet', 'initiator']), $user),
        ]);
    }
}
