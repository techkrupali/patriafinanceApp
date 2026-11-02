<?php

namespace App\Http\Controllers\Api;

use App\Models\SavedAccount;
use App\Models\SavedAccountGroup;
use App\Models\SupportMessage;
use App\Models\SupportRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\Dispute;
use App\Services\AccountService;
use App\Services\DisputeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Money in and out across wallets: the Send hub (SND-01: fee, recent people,
 * saved accounts), every transaction in one list (TXN-01), one transaction
 * (TXN-02/03) and "Report a problem" (TXN-04).
 */
class PaymentsController extends ApiController
{
    /** TXN-04 "What's wrong?" */
    public const PROBLEMS = [
        'not_arrived' => 'Money left but didn\'t arrive',
        'not_received' => 'They say they didn\'t get it',
        'charged_twice' => 'I was charged twice',
        'not_me' => 'I didn\'t make this payment',
        'wrong_amount' => 'Wrong amount',
        'goods' => 'Problem with what I paid for',
    ];

    // GET /send/options — SND-01.
    public function options(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->ok('Send options', [
            'bank_fee' => number_format((int) config('services.matrix.transfer_fee_kobo', 2000) / 100, 2, '.', ''),
            'saved_count' => SavedAccount::where('user_id', $user->id)->where('listed', true)->count(),
            'group_count' => SavedAccountGroup::where('user_id', $user->id)->count(),
            'recent' => $this->recent($user),
        ]);
    }

    // GET /transactions?wallet_id=&from=&to=&category=&direction=&page= — TXN-01 "Transactions · All wallets".
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'wallet_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'category' => ['nullable', 'integer'],
            'direction' => ['nullable', 'in:credit,debit'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $wallets = $this->visibleWallets($user);
        $ids = isset($data['wallet_id']) ? $wallets->where('id', (int) $data['wallet_id'])->pluck('id') : $wallets->pluck('id');

        $query = Transaction::with(['wallet:id,name,type,user_id', 'user:id,first_name,last_name,name', 'budgetCategory:id,name'])
            ->whereIn('wallet_id', $ids)
            ->when($data['direction'] ?? null, fn ($q, $d) => $q->where('direction', $d))
            ->when($data['category'] ?? null, fn ($q, $c) => $q->where('budget_category_id', $c))
            ->when($data['from'] ?? null, fn ($q, $d) => $q->where('created_at', '>=', Carbon::parse($d, 'Africa/Lagos')->startOfDay()->utc()))
            ->when($data['to'] ?? null, fn ($q, $d) => $q->where('created_at', '<=', Carbon::parse($d, 'Africa/Lagos')->endOfDay()->utc()))
            // A move between someone's own wallets shows once, from the side it left.
            ->where(fn ($q) => $q->where('type', '!=', 'transfer_in')->orWhereNull('meta->pair_reference')->orWhereNotIn('counterparty->wallet_id', $ids->all()));
        // Newest first by when it happened (rows can be dated earlier than they were stored).
        $page = (clone $query)->orderByDesc('created_at')->orderByDesc('id')->paginate((int) ($data['per_page'] ?? 30), ['*'], 'page', (int) ($data['page'] ?? 1));

        // TXN-01 "Tolu: school trip · Needs Emeka · Waiting": requests still waiting for a yes.
        $waiting = ((int) ($data['page'] ?? 1) === 1 && empty($data['from']) && empty($data['category']) && ($data['direction'] ?? 'debit') === 'debit')
            ? \App\Models\ApprovalRequest::with(['wallet', 'initiator'])->whereIn('wallet_id', $ids)->where('status', 'pending')
                ->whereIn('action', ['withdrawal', 'transfer_bank', 'transfer_wallet', 'transfer_user', 'transfer_group', 'transfer_request'])->latest()->limit(10)->get()
                ->map(fn ($r) => [
                    'approval_id' => $r->id,
                    'title' => $r->description ?: ('To ' . ($r->payload['to_name'] ?? $r->payload['account_name'] ?? $r->payload['identifier'] ?? 'someone')),
                    'amount' => number_format($r->amount / 100, 2, '.', ''),
                    'wallet' => $r->wallet ? ['id' => $r->wallet->id, 'name' => $r->wallet->name, 'type' => $r->wallet->type] : null,
                    'waiting_on' => $this->serializeApprovalRequest($r, $user)['waiting_on'],
                    'by' => $r->initiator?->first_name,
                    'created_at' => $r->created_at?->toIso8601String(),
                ])->values()
            : [];

        return $this->ok('Transactions', [
            'waiting' => $waiting,
            'transactions' => collect($page->items())->map(fn (Transaction $t) => $this->row($t, $user)),
            'week' => $this->week($ids),
            'pagination' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    // GET /transactions/{transaction} — TXN-02 detail, TXN-03 receipt.
    public function show(Request $request, Transaction $transaction): JsonResponse
    {
        $user = $request->user();
        if (!$this->visibleWallets($user)->contains('id', $transaction->wallet_id)) {
            return $this->fail('Transaction not found', 404);
        }
        $transaction->load(['wallet', 'user', 'budgetCategory']);
        $approval = \App\Models\ApprovalRequest::with('responses.approver')->where('executed_transaction_reference', $transaction->reference)->first();
        // TXN-04 a problem reported: the open dispute it started (DSP-05).
        $dispute = Dispute::where('reference', $transaction->reference)->where('user_id', $user->id)->whereIn('status', Dispute::ACTIVE)->latest('id')->first();
        $reported = $dispute !== null || SupportRequest::where('reference', $transaction->reference)->where('user_id', $user->id)->whereIn('status', ['pending', 'in_review'])->exists();

        return $this->ok('Transaction', [
            'transaction' => $this->row($transaction, $user) + [
                'balance_after' => $transaction->balance_after !== null ? number_format($transaction->balance_after / 100, 2, '.', '') : null,
                'by' => $transaction->user?->fullName(),
                // SND-12 "Approved by Ngozi, Emeka".
                'approval' => $approval ? ['by' => collect([$approval->initiator?->first_name])->merge($approval->responses->where('decision', 'approve')->map(fn ($v) => $v->approver?->first_name))->filter()->unique()->values()] : null,
                'reported' => $reported,
                'dispute_id' => $dispute?->id,
                'problems' => collect(self::PROBLEMS)->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
            ],
        ]);
    }

    // POST /transactions/{transaction}/receipt-link → a 10-minute PDF link (TXN-03 "Download PDF").
    public function receiptLink(Request $request, Transaction $transaction): JsonResponse
    {
        $user = $request->user();
        if (!$this->visibleWallets($user)->contains('id', $transaction->wallet_id)) {
            return $this->fail('Transaction not found', 404);
        }

        return $this->ok('Receipt ready', ['url' => \Illuminate\Support\Facades\URL::temporarySignedRoute('transaction.receipt', now()->addMinutes(10), ['transaction' => $transaction->id, 'user' => $user->id])]);
    }

    // GET /receipts/{transaction}?signature=… (web, signed)
    public function receipt(Request $request, Transaction $transaction): \Illuminate\Http\Response
    {
        $user = User::find((int) $request->query('user'));
        if (!$user || !$this->visibleWallets($user)->contains('id', $transaction->wallet_id)) {
            abort(404);
        }
        $transaction->load(['wallet.owner', 'user']);
        $row = $this->row($transaction, $user);
        $pdf = new \App\Support\SimplePdf();
        $pdf->text('Patriai · Payment receipt', 16, true);
        $pdf->gap(8);
        $lines = [
            'Amount' => '₦' . number_format($transaction->amount / 100, 2),
            'Status' => ucfirst($transaction->status === 'successful' ? 'successful' : $transaction->status),
            'From' => trim(($transaction->wallet?->owner?->fullName() ?? '') . ' · ' . ($transaction->wallet?->name ?? '')),
            $transaction->direction === 'credit' ? 'From' : 'To' => $row['counterparty_name'] ?? '—',
            'Date' => $transaction->created_at?->setTimezone('Africa/Lagos')->format('j M Y, g:i a'),
            'Fee' => '₦' . number_format($transaction->fee / 100, 2),
            'Reference' => $transaction->reference,
            'Note' => $transaction->description ?: '—',
        ];
        foreach ($lines as $label => $value) {
            $pdf->columns([$label, (string) $value], [140, 360], 11);
        }
        $pdf->gap(12);
        $pdf->rule();
        $pdf->text('Licensed by our partner bank · Patriai Technologies', 9);

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="patriai-receipt-' . $transaction->reference . '.pdf"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    // POST /transactions/{transaction}/report  {problem, details?} — TXN-04.
    public function report(Request $request, Transaction $transaction): JsonResponse
    {
        $user = $request->user();
        if (!$this->visibleWallets($user)->contains('id', $transaction->wallet_id)) {
            return $this->fail('Transaction not found', 404);
        }
        $data = $request->validate([
            'problem' => ['required', 'in:' . implode(',', array_keys(self::PROBLEMS))],
            'details' => ['nullable', 'string', 'max:1000'],
        ]);
        $label = self::PROBLEMS[$data['problem']];
        $credit = $transaction->direction === 'credit';
        $who = $transaction->counterparty['name'] ?? null;
        // "Continue" opens a dispute Patriai looks at (DSP-05); "Problem with what I paid for" too.
        $dispute = DisputeService::make()->open($user, [
            'kind' => $credit ? 'payment_received' : 'payment_made',
            'subject' => $label . ' · ₦' . number_format($transaction->amount / 100) . ($who ? ($credit ? " from {$who}" : " to {$who}") : ''),
            'category' => 'transaction',
            'reference' => $transaction->reference,
            'reason' => ['not_arrived' => 'not_delivered', 'not_received' => 'not_delivered', 'charged_twice' => 'overcharged', 'wrong_amount' => 'overcharged', 'goods' => 'not_as_agreed'][$data['problem']] ?? 'other',
            'remedy' => ['charged_twice' => 'partial_refund', 'wrong_amount' => 'partial_refund', 'not_arrived' => 'full_refund', 'not_me' => 'full_refund'][$data['problem']] ?? null,
            'description' => trim(($data['details'] ?? '') ?: $label),
        ]);
        $support = SupportRequest::create([
            'user_id' => $user->id,
            'subject' => "{$label}: ₦" . number_format($transaction->amount / 100) . ' · ' . $transaction->reference,
            'category' => 'transaction',
            'description' => trim(($data['details'] ?? '') . "\n\nReported on {$transaction->reference} ({$transaction->type}, " . $transaction->created_at?->format('j M Y g:i a') . ').'),
            'reference' => $transaction->reference,
            'status' => 'pending',
            'priority' => in_array($data['problem'], ['not_me', 'charged_twice'], true) ? 'high' : 'medium',
        ]);
        SupportMessage::create(['support_request_id' => $support->id, 'sender_id' => $user->id, 'from' => 'user', 'body' => trim("{$label}. " . ($data['details'] ?? ''))]);

        // "I didn't make this payment — we'll freeze the wallet right away."
        if ($data['problem'] === 'not_me' && !$user->isFrozen()) {
            AccountService::make()->freeze($user, 'report', $request->user()->currentAccessToken()?->id);
        }

        return $this->ok('Reported', ['support_request_id' => $support->id, 'dispute_id' => $dispute->id, 'frozen' => $data['problem'] === 'not_me']);
    }

    /** One line on the list: who, what, from where, signed amount. */
    private function row(Transaction $t, User $viewer): array
    {
        $cp = (array) ($t->counterparty ?? []);
        $who = match ($cp['kind'] ?? null) {
            'bank' => $cp['account_name'] ?? null,
            'wallet' => ($cp['owner'] ?? null) && ($cp['owner'] !== $t->wallet?->owner?->fullName()) ? $cp['owner'] : ($cp['wallet_name'] ?? null),
            default => $cp['source_name'] ?? $cp['name'] ?? null,
        };
        $title = $t->direction === 'credit'
            ? (in_array($t->type, ['fund', 'funding'], true) ? 'Money added' . ($who ? " from {$who}" : '') : ($who ? "From {$who}" : 'Money in'))
            : ($who ? "To {$who}" : ($t->description ?: 'Money out'));

        return $this->serializeTransaction($t) + [
            'title' => $title,
            'counterparty_name' => $who,
            'wallet' => $t->wallet ? ['id' => $t->wallet->id, 'name' => $t->wallet->name, 'type' => $t->wallet->type] : null,
            'category' => $t->budgetCategory?->name,
            'by_me' => $t->user_id === $viewer->id,
        ];
    }

    /** "Out in the last 7 days ₦161,500 · 8% less than last week", with a bar per day. */
    private function week(Collection $walletIds): array
    {
        $today = now('Africa/Lagos')->startOfDay();
        // Money that left: payments and withdrawals, not moves between these wallets.
        $out = fn (Carbon $from, Carbon $to) => (int) Transaction::whereIn('wallet_id', $walletIds)->where('direction', 'debit')->where('status', 'successful')
            ->where(fn ($q) => $q->where('type', '!=', 'transfer_out')->orWhereNotIn('counterparty->wallet_id', $walletIds->all()))
            ->whereBetween('created_at', [$from->copy()->utc(), $to->copy()->utc()])->sum('amount');
        $days = collect(range(6, 0))->map(fn ($ago) => [
            'day' => $today->copy()->subDays($ago)->format('D'),
            'out' => number_format($out($today->copy()->subDays($ago), $today->copy()->subDays($ago)->endOfDay()) / 100, 2, '.', ''),
        ]);
        $this7 = $out($today->copy()->subDays(6), $today->copy()->endOfDay());
        $last7 = $out($today->copy()->subDays(13), $today->copy()->subDays(7)->endOfDay());

        return [
            'out' => number_format($this7 / 100, 2, '.', ''),
            'change_percent' => $last7 > 0 ? (int) round(($this7 - $last7) * 100 / $last7) : null,
            'days' => $days,
        ];
    }

    /** People paid lately, newest first (SND-01 "Recent"): Patriai users and bank accounts. */
    private function recent(User $user): array
    {
        $own = Wallet::where('user_id', $user->id)->pluck('id');

        return Transaction::whereIn('wallet_id', $own)->where('direction', 'debit')->whereIn('type', ['transfer_out', 'withdrawal'])
            ->latest('id')->limit(60)->get()
            ->map(function (Transaction $t) use ($user) {
                $cp = (array) ($t->counterparty ?? []);
                if (($cp['kind'] ?? null) === 'bank' && !empty($cp['account_number'])) {
                    return ['key' => 'bank:' . $cp['account_number'], 'kind' => 'bank', 'name' => $cp['account_name'] ?? 'Bank account', 'bank_code' => $cp['bank_code'] ?? null, 'bank_name' => $cp['bank_name'] ?? null, 'account_number' => $cp['account_number']];
                }
                if (($cp['kind'] ?? null) === 'wallet' && !empty($cp['wallet_id'])) {
                    $to = Wallet::with('owner')->find($cp['wallet_id']);
                    if ($to && $to->type === 'main' && $to->user_id !== $user->id && $to->owner) {
                        return ['key' => 'user:' . $to->user_id, 'kind' => 'user', 'name' => $to->owner->fullName(), 'username' => $to->owner->username, 'identifier' => $to->owner->username ? '@' . $to->owner->username : $to->owner->phone];
                    }
                }

                return null;
            })->filter()->unique('key')->take(8)->values()->all();
    }

    /** Wallets this person can see: their own and the ones they're an active member of. */
    private function visibleWallets(User $user): Collection
    {
        return Wallet::where('user_id', $user->id)
            ->orWhereHas('members', fn ($q) => $q->where('user_id', $user->id)->where('status', 'active'))
            ->get(['id', 'name', 'type', 'user_id']);
    }
}
