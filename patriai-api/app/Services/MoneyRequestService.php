<?php

namespace App\Services;

use App\Models\MoneyRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Request money and split a bill (REQ-01…03, SPL-01): ask someone for an
 * amount into one of your wallets; they pay all or part from theirs (through
 * POST /transfers, so the PIN, limits and approvals all apply) or decline; a
 * reminder goes the day before it's due. Someone without the app pays by bank
 * transfer into the wallet's account with the code in the narration.
 */
class MoneyRequestService
{
    public function __construct(private readonly NotificationService $notifications, private readonly WalletService $wallets) {}

    public static function make(): self
    {
        return app(self::class);
    }

    /**
     * $payer: a Patriai user, or ['name' => …, 'contact' => phone|email] for someone not on Patriai.
     */
    public function ask(User $requester, Wallet $into, User|array $payer, int $kobo, ?string $note, ?Carbon $due, ?array $split = null): MoneyRequest
    {
        if ($kobo < 100) {
            throw ValidationException::withMessages(['amount' => 'Ask for at least ₦1.']);
        }
        if (!$into->isAccessibleBy($requester) || !in_array($into->status ?? 'active', ['active', 'frozen'], true)) {
            throw ValidationException::withMessages(['wallet_id' => 'Choose one of your wallets to be paid into.']);
        }
        if ($payer instanceof User && $payer->id === $requester->id) {
            throw ValidationException::withMessages(['identifier' => 'You can\'t ask yourself.']);
        }
        $request = MoneyRequest::create([
            'code' => MoneyRequest::newCode(),
            'requester_id' => $requester->id,
            'wallet_id' => $into->id,
            'payer_user_id' => $payer instanceof User ? $payer->id : null,
            'payer_name' => $payer instanceof User ? null : ($payer['name'] ?? null),
            'payer_contact' => $payer instanceof User ? null : ($payer['contact'] ?? null),
            'amount' => $kobo,
            'note' => $note,
            'due_on' => $due?->toDateString(),
            'split_key' => $split['key'] ?? null,
            'split_title' => $split['title'] ?? null,
            'split_total' => $split['total'] ?? null,
            'split_place' => $split['place'] ?? null,
            'split_method' => $split['method'] ?? null,
        ]);
        $this->tell($request, false);

        return $request;
    }

    /** Remind whoever hasn't paid yet (SPL-01 "Remind Chidi and Amaka"). */
    public function remind(MoneyRequest $request): void
    {
        if ($request->status !== 'pending') {
            return;
        }
        $this->tell($request, true);
        $request->update(['reminded_at' => now()]);
    }

    /** Throws when $payer can't pay this request (any more). */
    public function assertPayable(MoneyRequest $request, User $payer): void
    {
        if ($request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => match ($request->status) {
                'paid' => 'This request is already paid.',
                'declined' => 'This request was declined.',
                default => 'This request was cancelled.',
            }]);
        }
        if ($payer->id === $request->requester_id) {
            throw ValidationException::withMessages(['request' => 'You can\'t pay your own request.']);
        }
        if ($request->payer_user_id !== null && $request->payer_user_id !== $payer->id) {
            throw ValidationException::withMessages(['request' => 'This request was sent to someone else.']);
        }
    }

    /**
     * Pay all or part (REQ-03) from $from into the request's wallet. Called by
     * the transfer (after the PIN, limits and wallet rules) or by an approval.
     *
     * @return array{reference: string, balance_after: int, request: MoneyRequest}
     */
    public function settle(MoneyRequest $request, User $payer, Wallet $from, int $kobo): array
    {
        return DB::transaction(function () use ($request, $payer, $from, $kobo) {
            $locked = MoneyRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            $this->assertPayable($locked, $payer);
            $kobo = min($kobo, $locked->left());
            if ($kobo <= 0) {
                throw ValidationException::withMessages(['amount' => 'Enter how much to pay.']);
            }
            $result = $this->wallets->transferBetweenWallets($from, $locked->wallet, $kobo, $payer, $this->label($locked));
            $this->record($locked, $kobo, $payer);

            return $result + ['request' => $locked->fresh()];
        });
    }

    /** A bank deposit into the request's wallet with its code in the narration counts toward it. */
    public function matchDeposit(Wallet $wallet, Transaction $txn, ?string $narration): ?MoneyRequest
    {
        if (!$narration || !preg_match_all('/\b([A-Z2-9]{4})\b/', strtoupper($narration), $m)) {
            return null;
        }

        return DB::transaction(function () use ($wallet, $txn, $m) {
            $request = MoneyRequest::where('wallet_id', $wallet->id)->where('status', 'pending')->whereIn('code', $m[1])->lockForUpdate()->first();
            if (!$request) {
                return null;
            }
            $this->record($request, min($txn->amount, $request->left()), null, $txn->counterparty['source_name'] ?? null);

            return $request;
        });
    }

    public function decline(MoneyRequest $request, User $payer, ?string $reason): MoneyRequest
    {
        if ($request->status !== 'pending' || $request->payer_user_id !== $payer->id) {
            throw ValidationException::withMessages(['request' => 'This request is no longer open.']);
        }
        $request->update(['status' => 'declined', 'decline_reason' => $reason]);
        $this->notifications->push($request->requester, 'money_request_declined', "{$payer->first_name} declined your request", $this->naira($request->amount) . ($request->note ? " for {$request->note}" : '') . ($reason ? " · \"{$reason}\"" : '') . '.', ['money_request_code' => $request->code]);

        return $request;
    }

    public function cancel(MoneyRequest $request, User $requester): MoneyRequest
    {
        if ($request->status !== 'pending' || $request->requester_id !== $requester->id) {
            throw ValidationException::withMessages(['request' => 'This request is no longer open.']);
        }
        $request->update(['status' => 'cancelled']);
        if ($request->payer) {
            $this->notifications->push($request->payer, 'money_request_cancelled', "{$requester->first_name} cancelled a request", $this->naira($request->amount) . ($request->note ? " for {$request->note}" : '') . '. Nothing to pay.', ['money_request_code' => $request->code]);
        }

        return $request;
    }

    /** "We'll remind him on Thursday": the day before it's due, once. */
    public function remindDue(?Carbon $today = null): int
    {
        $today ??= now('Africa/Lagos')->startOfDay();
        $count = 0;
        MoneyRequest::with(['requester', 'payer', 'wallet'])->where('status', 'pending')->whereNull('reminded_at')
            ->whereDate('due_on', $today->copy()->addDay()->toDateString())->get()
            ->each(function (MoneyRequest $r) use (&$count) {
                $this->remind($r);
                $count++;
            });

        return $count;
    }

    private function record(MoneyRequest $request, int $kobo, ?User $payer, ?string $fromName = null): void
    {
        $paid = $request->paid_amount + $kobo;
        $full = $paid >= $request->amount;
        $request->update(['paid_amount' => $paid, 'payer_user_id' => $request->payer_user_id ?? $payer?->id] + ($full ? ['status' => 'paid', 'paid_at' => now()] : []));
        $who = $payer?->first_name ?? $fromName ?? $request->payerName();
        $this->notifications->push($request->requester, 'money_request_paid', "{$who} paid {$this->naira($kobo)}", $full
            ? "Your request is paid in full. It's in {$request->wallet->name}."
            : "{$this->naira($request->amount - $paid)} still to come.", ['money_request_code' => $request->code, 'wallet_id' => $request->wallet_id]);
    }

    /** The ask, by notification (on Patriai) or SMS with the link (not yet). */
    private function tell(MoneyRequest $request, bool $reminder): void
    {
        $requester = $request->requester;
        $left = $request->left();
        $line = "{$requester->fullName()} asked you for {$this->naira($left)}" . ($request->note ? " · {$request->note}" : '') . ($request->due_on ? ' · due ' . $request->due_on->format('D j M') : '') . '.';
        if ($request->payer) {
            $this->notifications->push($request->payer, 'money_request', ($reminder ? 'Reminder: ' : '') . "{$requester->first_name} asked you for {$this->naira($left)}", $line, ['money_request_code' => $request->code]);
        } elseif ($request->payer_contact && !str_contains($request->payer_contact, '@')) {
            SmsService::make()->send($request->payer_contact, ($reminder ? 'Reminder: ' : '') . "{$line} Pay here: {$request->link()}");
        }
    }

    private function label(MoneyRequest $request): string
    {
        return "{$request->requester->first_name}'s request" . ($request->note ? ": {$request->note}" : '');
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }
}
