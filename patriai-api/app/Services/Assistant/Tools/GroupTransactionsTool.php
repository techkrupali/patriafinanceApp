<?php

namespace App\Services\Assistant\Tools;

use App\Models\Transaction;
use App\Models\Wallet;
use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\Assistant\TransactionQueryService;
use Illuminate\Http\Request;

/**
 * Read-only: group & aggregate the authenticated user's transactions for ONE
 * target — a specific wallet, a bank account number, or a recipient — with an
 * authorized grand-total summary plus a paginated list.
 *
 * Reuses TransactionQueryService entirely:
 *   - forUser()          → the paginated rows (same scoping/filters as find_transactions)
 *   - aggregateForUser() → the true grand total over ALL matching authorized rows
 *   - serializeRow()     → the shared transaction row shape (not duplicated)
 *
 * There is no second query engine and no new authorization: every query is bounded
 * by the user's accessible wallets. The tool accepts no user_id — it always acts
 * for $request->user() — and exposes no secrets.
 */
class GroupTransactionsTool implements AssistantTool
{
    private const DEFAULT_PER_PAGE = 10;
    private const AMBIGUITY_PROBE = 100;

    public function name(): string
    {
        return 'group_transactions';
    }

    public function description(): string
    {
        return 'Summarise and total the user\'s transactions for ONE target: a '
            .'specific wallet, a bank account number, or a recipient. Use it for '
            .'"how much have I sent to account 1234567890?", "how many times have I '
            .'paid John?", "show all transactions from my Main Wallet and total '
            .'them", "how much did I send to Savings this month?". '
            ."\n\nProvide exactly ONE target:\n"
            .'- wallet_id (resolve the wallet name with get_wallets first), or\n'
            .'- account_number (a bank account number), or\n'
            .'- recipient (a person/counterparty name).\n'
            .'Combine with optional direction, status, type, date_from and date_to '
            .'(compute explicit YYYY-MM-DD dates for ranges like "this month"). '
            .'The result includes a grand-total summary (count, total, first/latest '
            .'date) computed over ALL matching authorised transactions, plus a '
            .'paginated list; for "show more" call again with the next page. If it '
            .'reports needs_disambiguation, ask the user which recipient they mean '
            .'and call again with a more specific recipient. Read-only.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'wallet_id' => [
                    'type' => 'integer',
                    'description' => 'Group by a wallet the user can access (resolve via get_wallets).',
                ],
                'account_number' => [
                    'type' => 'string',
                    'description' => 'Group by a bank account number the user has transacted with.',
                ],
                'recipient' => [
                    'type' => 'string',
                    'description' => 'Group by a recipient/counterparty name (e.g. "John").',
                ],
                'direction' => [
                    'type' => 'string',
                    'enum' => ['credit', 'debit'],
                    'description' => 'credit = money in, debit = money out.',
                ],
                'status' => [
                    'type' => 'string',
                    'enum' => ['successful', 'pending', 'failed', 'reversed'],
                ],
                'type' => [
                    'type' => 'string',
                    'enum' => ['transfer_in', 'transfer_out', 'withdrawal', 'deposit', 'funding', 'refund', 'reversal', 'fee'],
                ],
                'date_from' => ['type' => 'string', 'description' => 'Inclusive start date, YYYY-MM-DD.'],
                'date_to' => ['type' => 'string', 'description' => 'Inclusive end date, YYYY-MM-DD.'],
                'page' => ['type' => 'integer', 'description' => 'Page number (default 1).'],
                'per_page' => ['type' => 'integer', 'description' => 'Rows per page (default 10, max 50).'],
            ],
            'required' => [],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $user = $request->user();
        $service = TransactionQueryService::make();

        // Determine the single target and the search/filter it maps to.
        [$target, $searchFilter, $error] = $this->resolveTarget($user, $service, $input);
        if ($error !== null) {
            return ['grouped' => false, 'error' => $error];
        }

        // Common filters (reused as-is by the query engine).
        $filters = array_merge($searchFilter, [
            'direction' => $input['direction'] ?? null,
            'status' => $input['status'] ?? null,
            'type' => $input['type'] ?? null,
            'date_from' => $input['date_from'] ?? null,
            'date_to' => $input['date_to'] ?? null,
        ]);

        // Ambiguous recipient: multiple distinct people match → ask, don't guess.
        if (($target['type'] ?? null) === 'recipient') {
            $candidates = $this->distinctRecipients($service, $user, $filters);
            if (count($candidates) > 1) {
                return [
                    'grouped' => false,
                    'needs_disambiguation' => true,
                    'message' => 'Multiple recipients match. Ask the user which one they mean, then call again with a more specific recipient.',
                    'candidates' => $candidates,
                ];
            }
        }

        // Authorized grand-total aggregate (ALL matching), then a page of rows.
        $summary = $service->aggregateForUser($user, $filters);

        $perPage = min(max((int) ($input['per_page'] ?? self::DEFAULT_PER_PAGE), 1), 50);
        $page = max((int) ($input['page'] ?? 1), 1);
        $paginator = $service->forUser($user, $filters + ['per_page' => $perPage, 'page' => $page]);
        $rows = array_map(fn (Transaction $t) => TransactionQueryService::serializeRow($t), $paginator->items());

        return [
            'grouped' => true,
            'is_group' => true,
            'title' => $this->title($target),
            'target' => $target,
            'summary' => $summary,
            'transactions' => $rows,
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'has_more' => $paginator->hasMorePages(),
        ];
    }

    /**
     * @return array{0:?array,1:array,2:?string} [target, searchFilter, error]
     */
    private function resolveTarget($user, TransactionQueryService $service, array $input): array
    {
        $walletId = isset($input['wallet_id']) ? (int) $input['wallet_id'] : null;
        $account = trim((string) ($input['account_number'] ?? ''));
        $recipient = trim((string) ($input['recipient'] ?? ''));

        if ($walletId) {
            if (!$service->accessibleWalletIds($user)->contains($walletId)) {
                return [null, [], 'I couldn\'t find that wallet in your account.'];
            }
            $wallet = Wallet::find($walletId);

            return [[
                'type' => 'wallet',
                'wallet_id' => $walletId,
                'wallet_name' => $wallet?->name,
            ], ['wallet_id' => $walletId], null];
        }

        if ($account !== '') {
            return [[
                'type' => 'bank_account',
                'display' => TransactionQueryService::maskAccount($account),
            ], ['search' => $account], null];
        }

        if ($recipient !== '') {
            return [[
                'type' => 'recipient',
                'display' => $recipient,
            ], ['search' => $recipient], null];
        }

        return [null, [], 'Tell me which wallet, bank account number, or recipient to summarise.'];
    }

    /** Distinct recipient display strings among a bounded set of matching rows. */
    private function distinctRecipients(TransactionQueryService $service, $user, array $filters): array
    {
        $probe = $service->forUser($user, $filters + ['per_page' => self::AMBIGUITY_PROBE, 'page' => 1]);

        return collect($probe->items())
            ->map(fn (Transaction $t) => TransactionQueryService::recipient($t))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function title(array $target): string
    {
        return match ($target['type']) {
            'wallet' => 'Transactions involving '.($target['wallet_name'] ?? 'wallet'),
            'bank_account' => 'Transactions to '.$target['display'],
            'recipient' => 'Transactions involving '.$target['display'],
            default => 'Transactions',
        };
    }
}
