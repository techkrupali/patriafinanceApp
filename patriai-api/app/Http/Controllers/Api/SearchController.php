<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\InsightsService;
use App\Services\RuleBuilderService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * HOM-05 Search Patriai: one box for wallets, money in and out (with requests
 * still waiting) and rules — only what this person can already see.
 */
class SearchController extends ApiController
{
    private const WALLET_LABEL = [
        'main' => 'Main', 'goal' => 'Goal', 'savings' => 'Savings', 'spending' => 'Spending', 'emergency' => 'Emergency',
        'giving' => 'Giving', 'joint' => 'Joint', 'child' => 'Child', 'project' => 'Project', 'shared' => 'Shared', 'ajo' => 'Ajo',
    ];

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /** "Today", "Yesterday", "12 Sep", "12 Sep 2025". */
    private function day(?Carbon $at): ?string
    {
        if (!$at) {
            return null;
        }
        $d = $at->copy()->setTimezone('Africa/Lagos');
        $now = now('Africa/Lagos');

        return match (true) {
            $d->isSameDay($now) => 'Today',
            $d->isSameDay($now->copy()->subDay()) => 'Yesterday',
            $d->year === $now->year => $d->format('j M'),
            default => $d->format('j M Y'),
        };
    }

    /** LOWER(counterparty.$key), on MySQL and SQLite alike. */
    private function jsonText(string $key): string
    {
        return DB::getDriverName() === 'sqlite'
            ? "LOWER(json_extract(counterparty, '$.{$key}'))"
            : "LOWER(JSON_UNQUOTE(JSON_EXTRACT(counterparty, '$.{$key}')))";
    }

    // GET /search?q=school
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:60']]);
        $user = $request->user();
        $q = trim($data['q']);
        $like = '%' . mb_strtolower($q) . '%';
        $digits = preg_replace('/[^\d]/', '', $q);
        $wallets = InsightsService::make()->wallets($user)->keyBy('id');
        $ids = $wallets->keys()->all();

        return $this->ok('Search', [
            'q' => $q,
            'wallets' => $this->wallets($user, $wallets, $q),
            'transactions' => $this->transactions($user, $wallets, $ids, $like, $digits),
            'rules' => $this->rules($user, $like),
        ]);
    }

    private function wallets(User $user, Collection $wallets, string $q): array
    {
        $needle = mb_strtolower($q);

        return $wallets->filter(fn (Wallet $w) => str_contains(mb_strtolower($w->name), $needle) || ($w->virtual_account && str_contains($w->virtual_account, $q)))
            ->take(5)
            ->map(function (Wallet $w) use ($user) {
                $shared = $w->user_id !== $user->id || $w->members()->where('status', 'active')->where('user_id', '!=', $w->user_id)->exists();
                $pct = $w->target_amount > 0 ? (int) min(100, floor($w->balance * 100 / $w->target_amount)) : null;

                return [
                    'id' => $w->id,
                    'name' => $w->name,
                    'type' => $w->type,
                    // "Goal · Shared · 80%"
                    'line' => collect([self::WALLET_LABEL[$w->type] ?? ucfirst($w->type), $shared ? 'Shared' : null, $pct !== null ? "{$pct}%" : null, $w->status === 'closed' ? 'Closed' : null])->filter()->join(' · '),
                    'percent' => $pct,
                    'balance' => $this->naira((int) $w->balance),
                ];
            })->values()->all();
    }

    private function transactions(User $user, Collection $wallets, array $ids, string $like, string $digits): array
    {
        if (!$ids) {
            return [];
        }
        // Requests still waiting for a yes: "Tolu: school trip · Request · Today · Waiting".
        $requests = ApprovalRequest::with(['initiator', 'wallet'])
            ->whereIn('wallet_id', $ids)->where('status', 'pending')
            ->where(fn ($w) => $w->whereRaw('LOWER(COALESCE(description, \'\')) LIKE ?', [$like])
                ->orWhereHas('initiator', fn ($u) => $u->whereRaw('LOWER(first_name) LIKE ?', [$like])))
            ->latest('id')->limit(3)->get()
            ->map(fn (ApprovalRequest $r) => [
                'kind' => 'request',
                'id' => $r->id,
                'title' => trim(($r->initiator?->id === $user->id ? 'You' : $r->initiator?->first_name) . ': ' . ($r->description ?: 'a payment'), ': '),
                'line' => "Request · {$this->day($r->created_at)}",
                'amount' => $this->naira((int) $r->amount),
                'direction' => 'debit',
                'status' => 'waiting',
                'at' => $r->created_at?->toIso8601String(),
            ]);

        $txns = Transaction::with('user:id,first_name,last_name')
            ->whereIn('wallet_id', $ids)->whereIn('status', ['successful', 'pending'])
            ->where(function ($w) use ($like, $digits) {
                $w->whereRaw('LOWER(COALESCE(description, \'\')) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(reference) LIKE ?', [$like]);
                // Names in the counterparty ("GREENFIELD SCHOOL"), not its keys.
                foreach (['name', 'account_name', 'source_name', 'wallet_name'] as $key) {
                    $w->orWhereRaw($this->jsonText($key) . ' LIKE ?', [$like]);
                }
                $w
                    ->orWhereHas('user', fn ($u) => $u->whereRaw('LOWER(first_name) LIKE ?', [$like]));
                // "15000" or "15,000": the amount itself.
                if (strlen($digits) >= 3) {
                    $w->orWhere('amount', (int) $digits * 100);
                }
            })
            ->latest('id')->limit(12)->get()
            ->map(function (Transaction $t) use ($user, $wallets) {
                $wallet = $wallets[$t->wallet_id] ?? null;
                $cp = $t->counterparty ?? [];
                $credit = $t->direction === 'credit';
                $who = $t->user && $t->user->id !== $user->id ? $t->user->first_name : ($cp['source_name'] ?? null);
                $title = match (true) {
                    $credit && $t->user && $t->user->id !== $user->id && in_array($t->type, ['transfer_in', 'fund'], true) => "{$t->user->first_name} added money",
                    $credit && !$t->description && $who => "From {$who}",
                    !$credit && !$t->description && ($cp['kind'] ?? null) === 'wallet' => 'To ' . ($cp['wallet_name'] ?? 'a wallet'),
                    !$credit && !$t->description => $cp['account_name'] ?? $cp['name'] ?? 'Payment',
                    default => preg_replace('/^Automation: /', '', (string) $t->description),
                };

                return [
                    'kind' => 'transaction',
                    'id' => $t->id,
                    'title' => $title,
                    // "School fees 2027 · Today"
                    'line' => collect([$wallet?->name, $this->day($t->created_at)])->filter()->join(' · '),
                    'amount' => $this->naira((int) $t->amount + ($credit ? 0 : (int) $t->fee)),
                    'direction' => $t->direction,
                    'status' => $t->status === 'pending' ? 'pending' : null,
                    'at' => $t->created_at?->toIso8601String(),
                ];
            });

        return $requests->concat($txns)->take(10)->values()->all();
    }

    private function rules(User $user, string $like): array
    {
        $builder = RuleBuilderService::make();

        return AutomationRule::with(['toWallet:id,name', 'fromWallet:id,name'])
            ->where('user_id', $user->id)
            ->where(fn ($w) => $w->whereRaw('LOWER(name) LIKE ?', [$like])
                ->orWhereHas('toWallet', fn ($x) => $x->whereRaw('LOWER(name) LIKE ?', [$like]))
                ->orWhereHas('fromWallet', fn ($x) => $x->whereRaw('LOWER(name) LIKE ?', [$like])))
            ->latest('id')->limit(5)->get()
            ->map(function (AutomationRule $r) use ($builder) {
                $then = (string) ($builder->words($r)['then'] ?? '');

                return [
                    'id' => $r->id,
                    'name' => $r->name,
                    // "Moves 10% to School fees 2027"
                    'line' => preg_replace('/^move /i', 'Moves ', $then) ?: $then,
                    'enabled' => (bool) $r->enabled,
                ];
            })->values()->all();
    }
}
