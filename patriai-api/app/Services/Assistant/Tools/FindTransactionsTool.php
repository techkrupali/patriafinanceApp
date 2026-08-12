<?php

namespace App\Services\Assistant\Tools;

use App\Models\Transaction;
use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\Assistant\TransactionQueryService;
use Illuminate\Http\Request;

/**
 * Read-only: search the authenticated user's transactions across the wallets
 * they own or are an active member of.
 *
 * Scoping/authorization is delegated to TransactionQueryService, which bounds
 * every query by the user's accessible wallet IDs (the same rule as
 * Wallet::isAccessibleBy). The tool accepts no user_id — it always acts for
 * $request->user() — and returns only fields the existing transaction API
 * already exposes. Nothing is written.
 */
class FindTransactionsTool implements AssistantTool
{
    /** Default page size when the model doesn't specify one. */
    private const DEFAULT_PER_PAGE = 20;

    public function name(): string
    {
        return 'find_transactions';
    }

    public function description(): string
    {
        return 'Search the current user\'s transactions across all their wallets. '
            .'Use it for requests like "show my transactions", "transactions from '
            .'the last 7 days", "withdrawals from last month", "transfers last week", '
            .'"transactions for Main Wallet", "transactions to account 1234567890", '
            .'or "transactions involving John". '
            .'All filters are optional and combine with AND. For relative time '
            .'ranges (last 24 hours / 7 days / month / 3 months), compute explicit '
            .'date_from and date_to (YYYY-MM-DD) from today before calling — do not '
            .'pass phrases. To filter by a wallet, first call get_wallets to resolve '
            .'the wallet name to its id, then pass wallet_id. Results are paginated; '
            .'if has_more is true, tell the user more exist and offer the next page. '
            .'Read-only.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'wallet_id' => [
                    'type' => 'integer',
                    'description' => 'Restrict to one wallet the user can access (resolve via get_wallets).',
                ],
                'type' => [
                    'type' => 'string',
                    'enum' => ['transfer_in', 'transfer_out', 'withdrawal', 'deposit', 'funding', 'refund', 'reversal', 'fee'],
                    'description' => 'Transaction type. Use "withdrawal" for withdrawals; "transfer_out"/"transfer_in" for transfers.',
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
                'date_from' => [
                    'type' => 'string',
                    'description' => 'Inclusive start date, YYYY-MM-DD.',
                ],
                'date_to' => [
                    'type' => 'string',
                    'description' => 'Inclusive end date, YYYY-MM-DD.',
                ],
                'search' => [
                    'type' => 'string',
                    'description' => 'Free text matched against the description, reference, and recipient/account details (e.g. an account number or a person\'s name).',
                ],
                'page' => [
                    'type' => 'integer',
                    'description' => 'Page number (default 1).',
                ],
                'per_page' => [
                    'type' => 'integer',
                    'description' => 'Results per page (default 20, max 100).',
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $paginator = TransactionQueryService::make()->forUser($request->user(), [
            'wallet_id' => $input['wallet_id'] ?? null,
            'type' => $input['type'] ?? null,
            'direction' => $input['direction'] ?? null,
            'status' => $input['status'] ?? null,
            'date_from' => $input['date_from'] ?? null,
            'date_to' => $input['date_to'] ?? null,
            'search' => $input['search'] ?? null,
            'page' => $input['page'] ?? 1,
            'per_page' => $input['per_page'] ?? self::DEFAULT_PER_PAGE,
        ]);

        $transactions = array_map(
            fn (Transaction $t) => TransactionQueryService::serializeRow($t),
            $paginator->items()
        );

        // Aggregate of ONLY the returned (authorized) transactions, summed in kobo
        // for precision — safe to show alongside the list.
        $totalKobo = array_reduce($paginator->items(), fn (int $carry, Transaction $t) => $carry + (int) $t->amount, 0);

        return [
            'count' => count($transactions),
            'total' => $paginator->total(),
            'total_amount' => number_format($totalKobo / 100, 2, '.', ''),
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'has_more' => $paginator->hasMorePages(),
            'transactions' => $transactions,
        ];
    }
}
