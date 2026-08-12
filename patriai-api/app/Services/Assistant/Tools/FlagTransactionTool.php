<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\DisputeController;
use App\Models\Dispute;
use App\Models\Transaction;
use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\Assistant\TransactionQueryService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * ACTION tool: flag / dispute a transaction the user can see.
 *
 * "Flagging" reuses the existing Dispute Center: it files a Dispute (via
 * DisputeController::store) referencing the transaction, with the user's reason
 * as the description. Filing a dispute needs no PIN/OTP in the backend, so this
 * tool collects no secret.
 *
 * The transaction is located with the SAME scoping as find_transactions
 * (TransactionQueryService, bounded to the user's accessible wallets), so a user
 * can only flag a transaction they are authorized to see — never another user's
 * or an inaccessible wallet's. Identity is always $request->user(); the tool
 * accepts no user_id/owner_id.
 *
 * The AI should first use find_transactions to locate the transaction and
 * disambiguate when several match, then call this with the chosen reference.
 *
 * Duplicate safety: the existing backend has no dispute dedupe, so before filing
 * this tool checks (scoped to the user) whether an OPEN dispute already exists for
 * the same transaction reference and, if so, returns it instead of creating a
 * second — making retries safe.
 */
class FlagTransactionTool implements AssistantTool
{
    public function name(): string
    {
        return 'flag_transaction';
    }

    public function description(): string
    {
        return 'Flag (dispute) one of the user\'s transactions — e.g. "flag the '
            .'₦25,000 transaction to John". '
            ."\n\nHOW TO USE:\n"
            .'1. Use find_transactions first to locate the transaction and get its '
            .'reference. If several match, show them and ask the user which one.\n'
            .'2. Ask the user for a reason (required).\n'
            .'3. Show a summary (amount, recipient, date, reference, reason) and ask '
            .'them to confirm.\n'
            .'4. ONLY after they clearly say yes, call this tool with the '
            .'transaction_reference, the reason, and confirmed=true. If they cancel, '
            .'do not.\n\n'
            .'Flagging needs no PIN — never ask for one. Calling with confirmed=false '
            .'(or omitted) never files anything. If the transaction is already '
            .'flagged, this returns the existing dispute instead of creating another.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'transaction_reference' => [
                    'type' => 'string',
                    'description' => 'The reference of the transaction to flag (get it from find_transactions).',
                ],
                'reason' => [
                    'type' => 'string',
                    'description' => 'Why the user is flagging this transaction (becomes the dispute details).',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to actually file the flag. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => ['transaction_reference', 'reason', 'confirmed'],
            'additionalProperties' => false,
            // NOTE: no user_id / owner_id / pin / password / otp field.
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $user = $request->user();
        $reference = trim((string) ($input['transaction_reference'] ?? ''));
        $reason = trim((string) ($input['reason'] ?? ''));

        if ($reference === '') {
            return ['flagged' => false, 'error' => 'Which transaction should I flag? Use find_transactions to get its reference.'];
        }
        if ($reason === '') {
            return ['flagged' => false, 'error' => 'Please tell me the reason for flagging this transaction.'];
        }

        // Locate the transaction within the user's accessible scope (same engine
        // and scoping as find_transactions). Not found here == not theirs to flag.
        $txn = $this->findAccessible($user, $reference);
        if (!$txn) {
            return ['flagged' => false, 'error' => 'I couldn\'t find that transaction in your accounts.'];
        }

        $summary = $this->summary($txn, $reason);

        // Duplicate safety: an already-open dispute for this reference is returned
        // as-is instead of filing a second (retries are safe).
        $existing = $this->existingOpenDispute($user, $txn->reference);
        if ($existing) {
            return [
                'flagged' => false,
                'already_flagged' => true,
                'message' => 'This transaction already has an open flag.',
                'dispute' => ['id' => $existing->id, 'status' => $existing->status],
                'transaction' => $summary,
            ];
        }

        // Confirmation gate — never file without an explicit confirmed=true.
        if (($input['confirmed'] ?? false) !== true) {
            return [
                'flagged' => false,
                'needs_confirmation' => true,
                'message' => 'Show the user this transaction and ask them to confirm '
                    .'flagging it. Call flag_transaction again with confirmed=true '
                    .'only after they say yes.',
                'transaction' => $summary,
            ];
        }

        // File the dispute via the existing endpoint, under the SAME authenticated user.
        try {
            $sub = Request::create('/api/v1/disputes', 'POST', [
                'subject' => $this->subject($txn),
                'category' => $txn->type === 'withdrawal' ? 'withdrawal' : 'transaction',
                'reference' => $txn->reference,
                'description' => $reason,
            ]);
            $sub->setUserResolver(fn () => $user);

            $response = app(DisputeController::class)->store($sub);
            $dispute = $response->getData(true)['data']['dispute'] ?? [];

            return [
                'flagged' => true,
                'dispute' => ['id' => $dispute['id'] ?? null, 'status' => $dispute['status'] ?? null],
                'transaction' => $summary,
            ];
        } catch (ValidationException $e) {
            $first = collect($e->errors())->flatten()->first() ?? 'The transaction could not be flagged.';

            return ['flagged' => false, 'error' => $first];
        } catch (\Throwable $e) {
            report($e);

            return ['flagged' => false, 'error' => 'Sorry, I couldn\'t flag that transaction right now.'];
        }
    }

    /** Exact-reference lookup scoped to the user's accessible wallets (reuses find_transactions scoping). */
    private function findAccessible(\App\Models\User $user, string $reference): ?Transaction
    {
        $page = TransactionQueryService::make()->forUser($user, ['search' => $reference, 'per_page' => 100]);

        foreach ($page->items() as $t) {
            if ($t->reference === $reference) {
                return $t;
            }
        }

        return null;
    }

    /** An open/under-review dispute the user already filed for this reference, if any. */
    private function existingOpenDispute(\App\Models\User $user, string $reference): ?Dispute
    {
        // Scoped to the authenticated user exactly as DisputeController::index is.
        return Dispute::where('user_id', $user->id)
            ->where('reference', $reference)
            ->whereIn('status', ['open', 'under_review'])
            ->latest()
            ->first();
    }

    private function subject(Transaction $t): string
    {
        return 'Flagged transaction: ₦'.number_format($t->amount / 100, 2, '.', '');
    }

    private function summary(Transaction $t, string $reason): array
    {
        return [
            'reference' => $t->reference,
            'amount' => number_format($t->amount / 100, 2, '.', ''),
            'currency' => $t->wallet?->currency ?? 'NGN',
            'type' => $t->type,
            'direction' => $t->direction,
            'date' => $t->created_at?->toIso8601String(),
            'wallet' => $t->wallet?->name,
            'recipient' => $this->recipient($t),
            'reason' => $reason,
        ];
    }

    /** Human-readable counterparty (already-exposed transaction data only). */
    private function recipient(Transaction $t): ?string
    {
        $cp = $t->counterparty;
        if (!is_array($cp)) {
            return null;
        }

        return match ($cp['kind'] ?? null) {
            'bank' => trim(($cp['account_name'] ?? '').' · '.($cp['account_number'] ?? ''), ' ·') ?: null,
            'wallet' => $cp['wallet_name'] ?? ($cp['owner'] ?? null),
            'user' => $cp['name'] ?? null,
            default => $cp['account_name'] ?? $cp['wallet_name'] ?? $cp['name'] ?? null,
        };
    }
}
