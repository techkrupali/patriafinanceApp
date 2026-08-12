<?php

namespace App\Services\Assistant;

use App\Models\Transaction;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Read-only, cross-wallet transaction search scoped to a single user.
 *
 * Authorization is the app's existing rule, reused verbatim: a user may see a
 * transaction only when it belongs to a wallet they own or are an ACTIVE member
 * of — exactly what Wallet::isAccessibleBy (and therefore WalletController's
 * per-wallet transactions endpoint) enforces, and the same accessible-wallet
 * scoping DashboardController already uses for its cross-wallet aggregates.
 *
 * Every query is bounded by whereIn('wallet_id', accessibleIds), so no filter
 * — including an AI-supplied wallet_id — can ever reach another user's data.
 * This service never writes.
 */
class TransactionQueryService
{
    /** Only these columns are ever filtered on (all already exposed by serializeTransaction). */
    private const ALLOWED_TYPES = [
        'transfer_in', 'transfer_out', 'withdrawal', 'deposit', 'funding', 'refund', 'reversal', 'fee',
    ];
    private const ALLOWED_DIRECTIONS = ['credit', 'debit'];
    private const ALLOWED_STATUSES = ['successful', 'pending', 'failed', 'reversed'];

    public static function make(): self
    {
        return new self();
    }

    /** IDs of every wallet the user is authorized to view (owner ∪ active member). */
    public function accessibleWalletIds(User $user): Collection
    {
        return $user->wallets()->pluck('id')
            ->concat($user->memberWallets()->pluck('wallets.id'))
            ->unique()
            ->values();
    }

    /**
     * @param  array<string,mixed>  $filters  type, direction, status, wallet_id,
     *                                         date_from, date_to, search, page, per_page
     */
    public function forUser(User $user, array $filters = []): LengthAwarePaginator
    {
        $perPage = min(max((int) ($filters['per_page'] ?? 20), 1), 100);
        $page = max((int) ($filters['page'] ?? 1), 1);

        return $this->buildQuery($user, $filters)
            ->with('wallet:id,name,currency')
            ->latest()
            ->paginate($perPage, ['*'], 'page', $page);
    }

    /**
     * Authorized aggregate over ALL transactions matching the SAME scope + filters
     * (not just one page). Reuses buildQuery, so scoping/authorization/filtering are
     * identical to forUser — there is no second query engine. Amounts are summed in
     * kobo for precision. The count/totals therefore represent the true grand total
     * of the authorized matching transactions.
     *
     * @return array{transaction_count:int,total_amount:string,total_incoming:string,
     *               total_outgoing:string,average_amount:string,currency:string,
     *               first_transaction:?string,latest_transaction:?string}
     */
    public function aggregateForUser(User $user, array $filters = []): array
    {
        $base = $this->buildQuery($user, $filters);

        $count = (clone $base)->count();
        $totalKobo = (int) (clone $base)->sum('amount');
        $inKobo = (int) (clone $base)->where('direction', 'credit')->sum('amount');
        $outKobo = (int) (clone $base)->where('direction', 'debit')->sum('amount');
        $first = (clone $base)->min('created_at');
        $latest = (clone $base)->max('created_at');
        $avgKobo = $count > 0 ? (int) round($totalKobo / $count) : 0;

        return [
            'transaction_count' => $count,
            'total_amount' => $this->naira($totalKobo),
            'total_incoming' => $this->naira($inKobo),
            'total_outgoing' => $this->naira($outKobo),
            'average_amount' => $this->naira($avgKobo),
            'currency' => 'NGN',
            'first_transaction' => $first ? Carbon::parse($first)->toIso8601String() : null,
            'latest_transaction' => $latest ? Carbon::parse($latest)->toIso8601String() : null,
        ];
    }

    /**
     * The single source of truth for scoping + filtering. Both forUser (paginate)
     * and aggregateForUser (aggregate) build from this, so authorization and every
     * filter behave identically. Bounded by the user's accessible wallet IDs.
     */
    private function buildQuery(User $user, array $filters): Builder
    {
        $walletIds = $this->accessibleWalletIds($user);

        $query = Transaction::query()
            ->whereIn('wallet_id', $walletIds);      // <-- the authorization boundary

        // wallet_id: honoured only when it is one of the user's accessible wallets;
        // otherwise it silently narrows to nothing (never leaks another user's data).
        if (($wid = $filters['wallet_id'] ?? null) !== null) {
            $query->where('wallet_id', $walletIds->contains((int) $wid) ? (int) $wid : -1);
        }

        if (($type = $filters['type'] ?? null) && in_array($type, self::ALLOWED_TYPES, true)) {
            $query->where('type', $type);
        }

        if (($dir = $filters['direction'] ?? null) && in_array($dir, self::ALLOWED_DIRECTIONS, true)) {
            $query->where('direction', $dir);
        }

        if (($status = $filters['status'] ?? null) && in_array($status, self::ALLOWED_STATUSES, true)) {
            $query->where('status', $status);
        }

        if ($from = $this->parseDate($filters['date_from'] ?? null)) {
            $query->where('created_at', '>=', $from->startOfDay());
        }

        if ($to = $this->parseDate($filters['date_to'] ?? null)) {
            $query->where('created_at', '<=', $to->endOfDay());
        }

        if (($search = trim((string) ($filters['search'] ?? ''))) !== '') {
            $this->applySearch($query, $search);
        }

        return $query;
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /**
     * Canonical compact serialization of a transaction row for the assistant.
     * Shared by find_transactions and group_transactions so the row shape is
     * defined once. Exposes only already-safe fields (no counterparty/secret).
     */
    public static function serializeRow(Transaction $t): array
    {
        return [
            'id' => $t->id,
            'reference' => $t->reference,
            'date' => $t->created_at?->toIso8601String(),
            'type' => $t->type,
            'direction' => $t->direction,
            'amount' => number_format($t->amount / 100, 2, '.', ''),
            'currency' => $t->wallet?->currency ?? 'NGN',
            'status' => $t->status,
            'description' => $t->description,
            'wallet' => $t->wallet?->name,
            'recipient' => self::recipient($t),
        ];
    }

    /** Human-readable counterparty, derived from already-exposed transaction data. */
    public static function recipient(Transaction $t): ?string
    {
        $cp = $t->counterparty;
        if (!is_array($cp)) {
            return null;
        }

        return match ($cp['kind'] ?? null) {
            // Mask the account number — never show the full number in a display string.
            'bank' => trim(($cp['account_name'] ?? '').' · '.self::maskAccount((string) ($cp['account_number'] ?? '')), ' ·') ?: null,
            'wallet' => $cp['wallet_name'] ?? ($cp['owner'] ?? null),
            'user' => $cp['name'] ?? null,
            default => $cp['account_name'] ?? $cp['wallet_name'] ?? $cp['name'] ?? null,
        };
    }

    /** Mask all but the last 4 characters, e.g. 1234567890 → ••••••7890. */
    public static function maskAccount(string $value): string
    {
        if ($value === '') {
            return '';
        }
        $last4 = substr($value, -4);

        return str_repeat('•', max(0, strlen($value) - 4)).$last4;
    }

    /** Case-insensitive substring match over description, reference, and counterparty. */
    private function applySearch(Builder $query, string $search): void
    {
        $like = '%'.$search.'%';
        $pg = $query->getConnection()->getDriverName() === 'pgsql';

        $query->where(function (Builder $w) use ($like, $pg) {
            if ($pg) {
                $w->where('description', 'ilike', $like)
                    ->orWhere('reference', 'ilike', $like)
                    ->orWhereRaw('counterparty::text ilike ?', [$like]);
            } else {
                // SQLite / MySQL store jsonb as text; LIKE is ASCII-case-insensitive.
                $w->where('description', 'like', $like)
                    ->orWhere('reference', 'like', $like)
                    ->orWhere('counterparty', 'like', $like);
            }
        });
    }

    private function parseDate(mixed $value): ?Carbon
    {
        if (!$value) {
            return null;
        }
        try {
            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            return null;
        }
    }
}
