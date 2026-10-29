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
            'milestone_release' => 'milestone payout',
            'rule_change' => 'rule change',
            'unlock_wallet' => 'unlock',
            'close_wallet' => 'close',
            default => $action,
        };
    }

    /** Rule changes, unlocking and closing move no money by themselves (WAL-08/10/13). */
    public const GOVERNANCE_ACTIONS = ['rule_change', 'unlock_wallet', 'close_wallet'];

    /** "Approval needed: ₦35,000 bank transfer" · "Approval needed: Over ₦50,000 needs Ngozi and Emeka". */
    private function title(ApprovalRequest $request, string $prefix): string
    {
        return in_array($request->action, self::GOVERNANCE_ACTIONS, true)
            ? "{$prefix}: {$request->description}"
            : "{$prefix}: ₦" . $this->naira($request->amount) . ' ' . $this->actionLabel($request->action);
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

        // Store the wallet's requirement verbatim (its "who decides" rule, or the
        // fixed count). Do NOT clamp it down to the current eligible-approver count
        // — clamping would let a required=2 request be satisfied by a single sign-off.
        $required = $wallet->requiredApprovalsFor($initiator);

        // Guard against a stuck request: if fewer OTHER members can approve than the
        // requirement demands (e.g. an approver was removed after config), reject the
        // spend now instead of creating a request that can never reach its count.
        if ($approvers->count() < $required) {
            throw ValidationException::withMessages([
                'approval' => "This wallet requires {$required} approval(s), but only {$approvers->count()} other member(s) can approve. Ask the owner to add approvers or lower the requirement.",
            ]);
        }

        // WAL-08 "Named people, both": only they may answer.
        if ($wallet->approvalMode() === 'named') {
            $payload['approver_ids'] = $approvers->all();
        }

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
            'expires_at' => now()->addHours($wallet->approvalExpiryHours()),
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
     * A request every one of $approverIds must say yes to — the initiator counts as
     * the first yes (WAL-11 "You count as the first yes"). Used for rule changes,
     * unlocking and closing (owners and co-owners), and for taking money out of a
     * locked wallet (every approver).
     *
     * @param  \Illuminate\Support\Collection<int, int>  $approverIds
     */
    public function createGoverned(Wallet $wallet, User $initiator, string $action, int $amountKobo, int $feeKobo, string $description, array $payload, $approverIds): ApprovalRequest
    {
        $ids = collect($approverIds)->map(fn ($id) => (int) $id)->reject(fn ($id) => $id === $initiator->id)->unique()->values();
        if ($ids->isEmpty()) {
            throw ValidationException::withMessages(['approval' => 'Nobody else holds this wallet to say yes.']);
        }
        // One change waits at a time, so two can't undo each other.
        if (in_array($action, self::GOVERNANCE_ACTIONS, true)
            && $wallet->approvalRequests()->where('status', 'pending')->whereIn('action', self::GOVERNANCE_ACTIONS)->where('expires_at', '>', now())->exists()) {
            throw ValidationException::withMessages(['approval' => 'A change is already waiting for a yes. Answer or cancel it first.']);
        }

        $request = ApprovalRequest::create([
            'wallet_id' => $wallet->id,
            'initiator_id' => $initiator->id,
            'action' => $action,
            'amount' => $amountKobo,
            'fee' => $feeKobo,
            'description' => $description,
            'payload' => $payload + ['approver_ids' => $ids->all()],
            'required_approvals' => $ids->count(),
            'approvals_count' => 0,
            'status' => 'pending',
            'expires_at' => now()->addHours($wallet->approvalExpiryHours()),
        ]);

        $title = $this->title($request, 'Approval needed');
        foreach (User::whereIn('id', $ids)->get() as $approver) {
            $this->notifications->push($approver, 'approval_requested', $title, "{$initiator->fullName()} asked on {$wallet->name}.", [
                'approval_request_id' => $request->id,
                'wallet_id' => $wallet->id,
                'amount' => $this->naira($amountKobo),
            ]);
        }

        return $request;
    }

    /**
     * CHW-04 "Small requests can go through without you lifting a finger":
     * recorded like any request, approved at once and paid; the approvers are
     * told after.
     */
    public function autoApprove(Wallet $wallet, User $initiator, string $action, int $amountKobo, int $feeKobo, ?string $description, array $payload): ApprovalRequest
    {
        $request = ApprovalRequest::create([
            'wallet_id' => $wallet->id,
            'initiator_id' => $initiator->id,
            'action' => $action,
            'amount' => $amountKobo,
            'fee' => $feeKobo,
            'description' => $description,
            'payload' => $payload + ['auto_approved' => true],
            'required_approvals' => 1,
            'approvals_count' => 0,
            'status' => 'approved',
            'expires_at' => now()->addHours($wallet->approvalExpiryHours()),
        ]);
        $this->execute($request);

        foreach ($wallet->eligibleApprovers($initiator->id) as $approverId) {
            if ($approver = User::find($approverId)) {
                $this->notifications->push($approver, 'approval_auto', "Approved automatically: ₦{$this->naira($amountKobo)}", "{$initiator->first_name} asked for ₦{$this->naira($amountKobo)}" . ($description ? " for {$description}" : '') . " from {$wallet->name}.", ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id]);
            }
        }

        return $request->refresh();
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
        $named = $request->payload['approver_ids'] ?? null;
        if (is_array($named) ? !in_array($approver->id, array_map('intval', $named), true) : !$request->wallet->canApprove($approver)) {
            throw ValidationException::withMessages(['approval' => 'You are not allowed to approve on this wallet.']);
        }
        if ($request->initiator_id === $approver->id) {
            throw ValidationException::withMessages(['approval' => 'You cannot approve your own request.']);
        }
        if ($request->responses()->where('approver_id', $approver->id)->exists()) {
            throw ValidationException::withMessages(['approval' => 'You have already responded to this request.']);
        }

        $shouldExecute = false;

        DB::transaction(function () use ($request, $approver, $decision, $note, &$shouldExecute) {
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

                // A rejected milestone payout returns the milestone to 'submitted'
                // so the owner can address the concern and re-approve.
                if ($locked->action === 'milestone_release') {
                    $mid = $locked->payload['milestone_id'] ?? null;
                    if ($mid) {
                        \App\Models\Milestone::whereKey($mid)->where('status', 'approved')->update(['status' => 'submitted']);
                    }
                }

                $initiator = $locked->initiator;
                if ($initiator) {
                    $this->notifications->push(
                        $initiator,
                        'approval_rejected',
                        $this->title($locked, 'Request rejected'),
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
                // Commit the 'approved' flip first; the actual money movement
                // runs after this transaction commits (see below).
                $locked->status = 'approved';
                $locked->save();
                $shouldExecute = true;
            } else {
                $locked->save();
            }

            $request->setRawAttributes($locked->getAttributes());
        });

        // Execute only AFTER the decision transaction has committed. The payout
        // leg can call an external provider over HTTP; running it inside the
        // transaction held the approval + wallet row locks across the round
        // trip and demoted the ledger debit to a savepoint that could roll back
        // after real money had left. execute() never throws — it marks the
        // request failed itself — so a committed 'approved' row only ever
        // advances to 'executed' or 'failed' here. A crash in between leaves
        // status 'approved' with no executed_transaction_reference, i.e. a
        // discoverable "execution still owed" state.
        AuditService::make()->log($request->wallet, $approver, $decision === 'reject' ? 'approval_rejected' : 'approval_approved', ($decision === 'reject' ? 'Said no to ' : 'Said yes to ') . $this->subject($request), [
            'approval_request_id' => $request->id,
            'action' => $request->action,
            'amount' => $request->amount,
            'initiator_id' => $request->initiator_id,
            'note' => $note,
        ]);

        if ($shouldExecute) {
            $this->execute($request);
        }

        return $request->refresh();
    }

    /** "₦35,000 to Greenfield School" · "Over ₦50,000 needs Ngozi and Emeka". */
    private function subject(ApprovalRequest $request): string
    {
        if (in_array($request->action, self::GOVERNANCE_ACTIONS, true)) {
            return lcfirst((string) $request->description);
        }
        $to = $request->payload['account_name'] ?? null;

        return '₦' . number_format($request->amount / 100) . ($to ? " to {$to}" : '') . ($request->description ? " · {$request->description}" : '');
    }

    /**
     * Replay the recorded spend through WalletService. Runs AFTER the decision
     * transaction has committed, so WalletService's own row-locked transaction
     * is a real transaction (not a savepoint) and no locks are held across the
     * payout provider's HTTP round trip. On any money-layer failure (e.g.
     * insufficient balance now), mark the request failed rather than throwing —
     * the approval decision itself has already committed.
     */
    private function execute(ApprovalRequest $request): void
    {
        $wallet = $request->wallet;
        $initiator = $request->initiator;
        $payload = $request->payload ?? [];

        try {
            $reference = null;
            $recipient = null;

            // A request approved after its emergency wallet was locked again must not
            // slip money out past the lock.
            if ($wallet->isEmergencyLocked()) {
                throw ValidationException::withMessages(['wallet' => 'This emergency wallet is locked.']);
            }

            // Rule changes, unlocking and closing: applied once everyone said yes.
            if (in_array($request->action, self::GOVERNANCE_ACTIONS, true)) {
                $approvers = $request->responses()->where('decision', 'approve')->with('approver')->get()->pluck('approver')->filter();
                $manage = WalletManageService::make();
                match ($request->action) {
                    'rule_change' => $manage->applyRules($wallet, $initiator, (array) ($payload['changes'] ?? []), $approvers),
                    'unlock_wallet' => $manage->removeLock($wallet, $initiator, $approvers),
                    'close_wallet' => $manage->close($wallet, $initiator, $payload, $approvers),
                };
                $request->update(['status' => 'executed']);
                if ($initiator) {
                    $this->notifications->push($initiator, 'approval_executed', $this->title($request, 'Approved'), "Everyone said yes on {$wallet->name}. It's done.", ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id]);
                }

                return;
            }

            // ME-18: the person who asked froze their account since.
            if ($initiator?->isFrozen()) {
                throw ValidationException::withMessages(['wallet' => 'The account that asked is frozen.']);
            }
            // A request approved after its wallet was paused or suspended waits for it.
            if ($wallet->isFrozen()) {
                throw ValidationException::withMessages(['wallet' => $wallet->isSuspended() ? 'This wallet is suspended.' : 'This wallet is paused.']);
            }

            // Approved: limits are settled; the category must still be allowed, and
            // locked savings broken early still pay the fee.
            $rules = SpendRules::make();
            $plan = $initiator && $request->action !== 'milestone_release'
                ? $rules->plan($wallet, $initiator, $request->amount, isset($payload['budget_category_id']) ? (int) $payload['budget_category_id'] : null, approved: true)
                : null;
            $amount = $plan['net'] ?? $request->amount;

            switch ($request->action) {
                case 'withdrawal':
                case 'transfer_bank':
                    $txn = $this->wallets->withdrawToBank(
                        $wallet,
                        $initiator,
                        $amount,
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
                    $result = $this->wallets->transferBetweenWallets($wallet, $to, $amount, $initiator, $payload['description'] ?? $request->description);
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
                        $amount,
                        $initiator,
                        $payload['description'] ?? $request->description ?? "Transfer to {$recipient->fullName()}",
                    );
                    $reference = $result['reference'];
                    break;

                case 'milestone_release':
                    $milestone = \App\Models\Milestone::find($payload['milestone_id'] ?? 0);
                    if (!$milestone) {
                        throw ValidationException::withMessages(['milestone' => 'Milestone no longer exists.']);
                    }
                    // Delegate to ProjectService (row-locked, idempotent payout).
                    $released = ProjectService::make()->releaseMilestone($milestone, $initiator);
                    $reference = $released['reference'];
                    break;

                default:
                    throw ValidationException::withMessages(['action' => 'Unknown approval action.']);
            }

            $request->update([
                'status' => 'executed',
                'executed_transaction_reference' => $reference,
            ]);
            if ($plan) {
                $rules->settle($wallet, $initiator, $reference, $plan);
            }

            if ($initiator) {
                $this->notifications->push(
                    $initiator,
                    'approval_executed',
                    $this->title($request, 'Approved & sent'),
                    "Your request on {$wallet->name} was approved and completed.",
                    ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id, 'reference' => $reference],
                );
            }

            if ($request->action === 'transfer_user' && $recipient) {
                $this->notifications->push(
                    $recipient,
                    'transfer_received',
                    'You received ₦' . $this->naira($amount),
                    ($initiator ? $initiator->fullName() : 'Someone') . ' sent you ₦' . $this->naira($amount) . '.',
                    ['amount' => $this->naira($amount), 'reference' => $reference],
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
                    (in_array($request->action, self::GOVERNANCE_ACTIONS, true) ? "Your {$this->actionLabel($request->action)}" : "Your ₦" . $this->naira($request->amount) . ' ' . $this->actionLabel($request->action)) . " on {$wallet->name} was approved but failed: {$reason}",
                    ['approval_request_id' => $request->id, 'wallet_id' => $wallet->id],
                );
            }
        }
    }
}
