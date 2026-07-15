<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\ApprovalResponse;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Governance engine for multi-approver spends. It records intent (an
 * ApprovalRequest capturing everything needed to execute later) and, once
 * enough eligible approvers sign off, replays the spend through WalletService
 * so the real balance mutation still happens inside its row-locked transaction.
 * This service NEVER touches wallet balances directly.
 */
class ApprovalService
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    /** Human label for an action, used in notification titles. */
    private function actionLabel(string $action): string
    {
        return match ($action) {
            'withdrawal' => 'withdrawal',
            'transfer_wallet' => 'wallet transfer',
            'transfer_user' => 'transfer',
            'transfer_bank' => 'bank transfer',
            default => $action,
        };
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /**
     * Record a pending spend and fan out approval notifications.
     */
    public function create(Wallet $wallet, User $initiator, string $action, int $amountKobo, int $feeKobo, ?string $description, array $payload): ApprovalRequest
    {
        $approvers = $wallet->eligibleApprovers($initiator->id);

        // Store the wallet's configured requirement verbatim. Do NOT clamp it down
        // to the current eligible-approver count — clamping would let a required=2
        // request be satisfied by a single sign-off. (Config-time validation
        // guarantees required never exceeds the possible approver count.)
        $required = max(1, (int) $wallet->required_approvals);

        $request = ApprovalRequest::create([
            'wallet_id' => $wallet->id,
            'initiator_id' => $initiator->id,
            'action' => $action,
            'amount' => $amountKobo,
            'fee' => $feeKobo,
            'description' => $description,
            'payload' => $payload,
            'required_approvals' => $required,
            'approvals_count' => 0,
            'status' => 'pending',
            'expires_at' => now()->addHours(48),
        ]);

        $title = 'Approval needed: ₦' . $this->naira($amountKobo) . ' ' . $this->actionLabel($action);
        $data = [
            'approval_request_id' => $request->id,
            'wallet_id' => $wallet->id,
            'amount' => $this->naira($amountKobo),
        ];

        foreach ($approvers as $approverId) {
            $approver = User::find($approverId);
            if ($approver) {
                $this->notifications->push($approver, 'approval_requested', $title, "{$initiator->fullName()} requested approval on {$wallet->name}.", $data);
            }
        }

        return $request;
    }

    /**
     * Record one approver's decision. Executes the spend once the required
     * approval count is reached.
     */
    public function respond(ApprovalRequest $request, User $approver, string $decision, ?string $note): ApprovalRequest
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['approval' => 'This request is no longer pending.']);
        }
        if ($request->expires_at && $request->expires_at->isPast()) {
            $request->update(['status' => 'expired']);
            throw ValidationException::withMessages(['approval' => 'This request has expired.']);
        }
        if (!$request->wallet->canApprove($approver)) {
            throw ValidationException::withMessages(['approval' => 'You are not allowed to approve on this wallet.']);
        }
        if ($request->initiator_id === $approver->id) {
            throw ValidationException::withMessages(['approval' => 'You cannot approve your own request.']);
        }
        if ($request->responses()->where('approver_id', $approver->id)->exists()) {
            throw ValidationException::withMessages(['approval' => 'You have already responded to this request.']);
        }

        DB::transaction(function () use ($request, $approver, $decision, $note) {
            /** @var ApprovalRequest $locked */
            $locked = ApprovalRequest::whereKey($request->id)->lockForUpdate()->first();

            // Re-check under the lock (another approver may have finalised it).
            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages(['approval' => 'This request is no longer pending.']);
            }
            if ($locked->expires_at && $locked->expires_at->isPast()) {
                $locked->update(['status' => 'expired']);
                throw ValidationException::withMessages(['approval' => 'This request has expired.']);
            }
            if ($locked->responses()->where('approver_id', $approver->id)->exists()) {
                throw ValidationException::withMessages(['approval' => 'You have already responded to this request.']);
            }

            ApprovalResponse::create([
                'approval_request_id' => $locked->id,
                'approver_id' => $approver->id,
                'decision' => $decision,
                'note' => $note,
            ]);

            if ($decision === 'reject') {
                $locked->update(['status' => 'rejected']);
                $initiator = $locked->initiator;
                if ($initiator) {
                    $this->notifications->push(
                        $initiator,
                        'approval_rejected',
                        'Request rejected: ₦' . $this->naira($locked->amount) . ' ' . $this->actionLabel($locked->action),
                        "{$approver->fullName()} rejected your request on {$locked->wallet->name}." . ($note ? " Note: {$note}" : ''),
                        ['approval_request_id' => $locked->id, 'wallet_id' => $locked->wallet_id],
                    );
                }

                $request->setRawAttributes($locked->getAttributes());

                return;
            }

            // Approve.
            $locked->approvals_count += 1;

            if ($locked->approvals_count >= $locked->required_approvals) {
                $locked->status = 'approved';
                $locked->save();
                $this->execute($locked);
            } else {
                $locked->save();
            }

            $request->setRawAttributes($locked->getAttributes());
        });

        return $request->refresh();
    }

    /**
     * Replay the recorded spend through WalletService. On any money-layer
     * failure (e.g. insufficient balance now), mark the request failed rather
     * than throwing — the outer response transaction must still commit.
     */
    private function execute(ApprovalRequest $request): void
    {
        $wallet = $request->wallet;
        $initiator = $request->initiator;
        $payload = $request->payload ?? [];

        try {
            $reference = null;
            $recipient = null;

            switch ($request->action) {
                case 'withdrawal':
                case 'transfer_bank':
                    $txn = $this->wallets->withdrawToBank(
                        $wallet,
                        $initiator,
                        $request->amount,
                        $payload['bank_code'],
                        $payload['account_number'],
                        $payload['account_name'],
                        $payload['bank_name'],
                        $payload['description'] ?? $request->description,
                    );
                    $reference = $txn->reference;
                    break;

                case 'transfer_wallet':
                    $to = Wallet::find($payload['wallet_id']);
                    if (!$to) {
                        throw ValidationException::withMessages(['destination' => 'Destination wallet no longer exists.']);
                    }
                    $result = $this->wallets->transferBetweenWallets($wallet, $to, $request->amount, $initiator, $payload['description'] ?? $request->description);
                    $reference = $result['reference'];
                    break;

                case 'transfer_user':
                    $identifier = $payload['identifier'] ?? '';
                    $recipient = str_contains($identifier, '@')
                        ? User::where('email', strtolower($identifier))->first()
                        : User::where('phone', $identifier)->first();

                    if (!$recipient) {
                        throw ValidationException::withMessages(['destination' => 'Recipient no longer exists.']);
                    }
                    $to = $recipient->mainWallet();
                    if (!$to) {
                        throw ValidationException::withMessages(['destination' => 'Recipient has no active wallet.']);
                    }
                    $result = $this->wallets->transferBetweenWallets(
                        $wallet,
                        $to,
                        $request->amount,
                        $initiator,
                        $payload['description'] ?? $request->description ?? "Transfer to {$recipient->fullName()}",
                    );
                    $reference = $result['reference'];
                    break;

                default:
                    throw ValidationException::withMessages(['action' => 'Unknown approval action.']);
            }

            $request->update([
                'status' => 'executed',
                'executed_transaction_reference' => $reference,
            ]);

            if ($initiator) {
                $this->notifications->push(
                    $initiator,
                    'approval_executed',
                    'Approved & sent: ₦' . $this->naira($request->amount) . ' ' . $this->actionLabel($request->action),
                    "Your request on {$wallet->name} was approved and completed.",
                    ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id, 'reference' => $reference],
                );
            }

            if ($request->action === 'transfer_user' && $recipient) {
                $this->notifications->push(
                    $recipient,
                    'transfer_received',
                    'You received ₦' . $this->naira($request->amount),
                    ($initiator ? $initiator->fullName() : 'Someone') . ' sent you ₦' . $this->naira($request->amount) . '.',
                    ['amount' => $this->naira($request->amount), 'reference' => $reference],
                );
            }
        } catch (\Throwable $e) {
            Log::warning("Approval execution failed for request {$request->id}: {$e->getMessage()}");

            $reason = $e instanceof ValidationException
                ? implode(' ', collect($e->errors())->flatten()->all())
                : $e->getMessage();

            $request->update([
                'status' => 'failed',
                'fail_reason' => $reason,
            ]);

            if ($initiator) {
                $this->notifications->push(
                    $initiator,
                    'approval_failed',
                    'Approval could not be completed',
                    "Your ₦" . $this->naira($request->amount) . ' ' . $this->actionLabel($request->action) . " on {$wallet->name} was approved but failed: {$reason}",
                    ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id],
                );
            }
        }
    }
}
