<?php

namespace App\Http\Controllers\Api;

use App\Models\MoneyRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Services\MoneyRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * REQ-01…03 request money, SPL-01 split a bill. Paying one goes through
 * POST /transfers with destination {kind: "request", code} so the PIN, limits,
 * wallet rules and approvals are the same as any payment.
 */
class MoneyRequestController extends ApiController
{
    // GET /money-requests — asked of me (open first), and the ones I sent.
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $toMe = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('payer_user_id', $user->id)
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")->latest()->limit(50)->get();
        $sent = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('requester_id', $user->id)->latest()->limit(50)->get();

        return $this->ok('Requests', [
            'to_me' => $toMe->map(fn ($r) => $this->serialize($r, $user))->values(),
            'sent' => $sent->map(fn ($r) => $this->serialize($r, $user))->values(),
        ]);
    }

    // POST /money-requests  { identifier | name+contact, amount, note?, wallet_id, due_on? }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['nullable', 'string', 'max:190'],
            'name' => ['required_without:identifier', 'nullable', 'string', 'max:120'],
            'contact' => ['nullable', 'string', 'max:190'],
            'amount' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'note' => ['nullable', 'string', 'max:200'],
            'wallet_id' => ['required', 'integer'],
            'due_on' => ['nullable', 'date', 'after_or_equal:today'],
        ]);
        $user = $request->user();
        $wallet = Wallet::find($data['wallet_id']);
        if (!$wallet || !$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        $payer = $this->payer($data);
        $created = MoneyRequestService::make()->ask($user, $wallet, $payer, $this->toKobo($data['amount']), $data['note'] ?? null, isset($data['due_on']) ? Carbon::parse($data['due_on']) : null);

        return $this->ok('Request sent', $this->serialize($created->load(['requester', 'payer', 'wallet']), $user), 201);
    }

    // GET /money-requests/{code}
    public function show(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        $found = $this->visible($code, $user);
        if (!$found) {
            return $this->fail('Request not found', 404);
        }

        return $this->ok('Request', $this->serialize($found, $user));
    }

    // POST /money-requests/{code}/decline  { reason? }  — REQ-03 "Pay part, or decline"
    public function decline(Request $request, string $code): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:200']]);
        $user = $request->user();
        $found = $this->visible($code, $user);
        if (!$found) {
            return $this->fail('Request not found', 404);
        }
        // An open link nobody has picked up yet: the person who opened it declines it.
        if ($found->payer_user_id === null && $found->requester_id !== $user->id) {
            $found->payer_user_id = $user->id;
        }

        return $this->ok('Declined', $this->serialize(MoneyRequestService::make()->decline($found, $user, $data['reason'] ?? null), $user));
    }

    // POST /money-requests/{code}/cancel
    public function cancel(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        $found = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('code', strtoupper($code))->where('requester_id', $user->id)->first();
        if (!$found) {
            return $this->fail('Request not found', 404);
        }

        return $this->ok('Cancelled', $this->serialize(MoneyRequestService::make()->cancel($found, $user), $user));
    }

    // POST /money-requests/{code}/remind — once an hour.
    public function remind(Request $request, string $code): JsonResponse
    {
        $user = $request->user();
        $found = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('code', strtoupper($code))->where('requester_id', $user->id)->first();
        if (!$found || $found->status !== 'pending') {
            return $this->fail('Request not found', 404);
        }
        if (!Cache::add('money-request:remind:' . $found->id, 1, now()->addHour())) {
            return $this->fail('You reminded them less than an hour ago.', 429);
        }
        MoneyRequestService::make()->remind($found);

        return $this->ok('Reminded', $this->serialize($found->fresh(['requester', 'payer', 'wallet']), $user));
    }

    // POST /bill-splits  { title, total, place?, method: equal|amount|share, wallet_id, people: [{identifier|name+contact, amount?, shares?}], my_shares? }
    public function split(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'place' => ['nullable', 'string', 'max:120'],
            'total' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'method' => ['required', 'in:equal,amount,share'],
            'wallet_id' => ['required', 'integer'],
            'note' => ['nullable', 'string', 'max:200'],
            'due_on' => ['nullable', 'date', 'after_or_equal:today'],
            'people' => ['required', 'array', 'min:1', 'max:20'],
            'people.*.identifier' => ['nullable', 'string', 'max:190'],
            'people.*.name' => ['nullable', 'string', 'max:120'],
            'people.*.contact' => ['nullable', 'string', 'max:190'],
            'people.*.amount' => ['nullable', 'numeric', 'min:0'],
            'people.*.shares' => ['nullable', 'integer', 'min:1', 'max:100'],
            // "By share": your own shares (you paid, so yours stay with you).
            'my_shares' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        $user = $request->user();
        $wallet = Wallet::find($data['wallet_id']);
        if (!$wallet || !$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        $total = $this->toKobo($data['total']);
        $people = collect($data['people'])->values();
        $payers = $people->map(fn ($p) => $this->payer($p))->all();
        $amounts = $this->splitAmounts($data['method'], $total, $people->all(), (int) ($data['my_shares'] ?? 1));
        $key = (string) Str::uuid();
        $service = MoneyRequestService::make();
        DB::transaction(function () use ($people, $payers, $amounts, $user, $wallet, $data, $total, $key, $service) {
            foreach ($people as $i => $p) {
                $service->ask($user, $wallet, $payers[$i], $amounts[$i], $data['note'] ?? $data['title'], isset($data['due_on']) ? Carbon::parse($data['due_on']) : null, ['key' => $key, 'title' => $data['title'], 'total' => $total, 'place' => $data['place'] ?? null, 'method' => $data['method']]);
            }
        });

        return $this->ok('Split sent', $this->splitView($key, $user), 201);
    }

    // GET /bill-splits/{key}
    public function showSplit(Request $request, string $key): JsonResponse
    {
        $view = $this->splitView($key, $request->user());

        return $view ? $this->ok('Split', $view) : $this->fail('Split not found', 404);
    }

    // POST /bill-splits/{key}/remind — SPL-01 "Remind Chidi and Amaka", once an hour.
    public function remindSplit(Request $request, string $key): JsonResponse
    {
        $user = $request->user();
        $open = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('split_key', $key)->where('requester_id', $user->id)->where('status', 'pending')->get();
        if ($open->isEmpty()) {
            return $this->fail('Everyone has paid.', 422);
        }
        if (!Cache::add('bill-split:remind:' . $key, 1, now()->addHour())) {
            return $this->fail('You reminded them less than an hour ago.', 429);
        }
        $open->each(fn ($r) => MoneyRequestService::make()->remind($r));

        return $this->ok('Reminded', $this->splitView($key, $user));
    }

    /** "Equally" counts you in; "By amount" takes each amount; "By share" weighs each person's shares against yours. */
    private function splitAmounts(string $method, int $total, array $people, int $myShares): array
    {
        $n = count($people);
        if ($method === 'amount') {
            $amounts = array_map(fn ($p) => $this->toKobo($p['amount'] ?? 0), $people);
            if (in_array(0, $amounts, true) || array_sum($amounts) > $total) {
                throw ValidationException::withMessages(['people' => 'Give everyone an amount, and no more than the bill in all.']);
            }

            return $amounts;
        }
        $weights = $method === 'share' ? array_map(fn ($p) => max(1, (int) ($p['shares'] ?? 1)), $people) : array_fill(0, $n, 1);
        $all = array_sum($weights) + ($method === 'share' ? $myShares : 1);

        return array_map(fn ($w) => intdiv($total * $w, $all), $weights);
    }

    /** SPL-01: who's in, what each owes and whether they paid; "Back to you so far ₦21,250 of ₦63,750". */
    private function splitView(string $key, User $user): ?array
    {
        $rows = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('split_key', $key)->where('requester_id', $user->id)->orderBy('id')->get();
        if ($rows->isEmpty()) {
            return null;
        }
        $first = $rows->first();
        $asked = $rows->sum('amount');

        return [
            'key' => $key,
            'title' => $first->split_title,
            'place' => $first->split_place,
            'method' => $first->split_method ?? 'equal',
            'total' => $this->naira($first->split_total ?? $asked),
            'my_part' => $this->naira(max(0, ($first->split_total ?? $asked) - $asked)),
            'asked' => $this->naira($asked),
            'back' => $this->naira($rows->sum('paid_amount')),
            'wallet' => ['id' => $first->wallet_id, 'name' => $first->wallet?->name],
            'created_at' => $first->created_at?->toIso8601String(),
            'people' => $rows->map(fn ($r) => $this->serialize($r, $user))->values(),
            'waiting' => $rows->where('status', 'pending')->map(fn ($r) => Str::before($r->payerName(), ' '))->values(),
        ];
    }

    /** A Patriai user, or someone not on Patriai yet (a name and a phone or email). */
    private function payer(array $p): User|array
    {
        if (!empty($p['identifier'])) {
            $found = $this->findPayee($p['identifier']);
            if ($found) {
                return $found;
            }
            if (empty($p['name'])) {
                throw ValidationException::withMessages(['identifier' => 'No one on Patriai has that @tag, phone or email. Add their name to send them the link.']);
            }
            $p['contact'] ??= $p['identifier'];
        }
        if (empty($p['name'])) {
            throw ValidationException::withMessages(['name' => 'Who should pay?']);
        }
        $contact = isset($p['contact']) && !str_contains($p['contact'], '@') ? $this->validPhone($p['contact']) : ($p['contact'] ?? null);
        if ($contact && ($user = $this->findPayee($contact))) {
            return $user;
        }

        return ['name' => trim($p['name']), 'contact' => $contact];
    }

    /** The requester, the person asked, or anyone holding an open link. */
    private function visible(string $code, User $user): ?MoneyRequest
    {
        $found = MoneyRequest::with(['requester', 'payer', 'wallet'])->where('code', strtoupper($code))->first();
        if (!$found) {
            return null;
        }
        $open = $found->payer_user_id === null && $found->status === 'pending';

        return $found->requester_id === $user->id || $found->payer_user_id === $user->id || $open ? $found : null;
    }

    private function serialize(MoneyRequest $r, User $viewer): array
    {
        $mine = $r->requester_id === $viewer->id;
        $payerName = $r->payer?->fullName() ?? $r->payer_name;

        return [
            'code' => $r->code,
            'link' => $r->link(),
            'mine' => $mine,
            'status' => $r->status,
            'amount' => $this->naira($r->amount),
            'paid_amount' => $this->naira($r->paid_amount),
            'left' => $this->naira($r->left()),
            'note' => $r->note,
            'due_on' => $r->due_on?->toDateString(),
            'decline_reason' => $r->decline_reason,
            'requester' => ['id' => $r->requester_id, 'name' => $r->requester?->fullName(), 'first_name' => $r->requester?->first_name],
            'payer' => ['id' => $r->payer_user_id, 'name' => $payerName, 'on_patriai' => $r->payer_user_id !== null, 'contact' => $mine ? $r->payer_contact : null],
            // REQ-03 "Goes to Mama and Papa's health fund · You're a contributor".
            'wallet' => ['id' => $r->wallet_id, 'name' => $r->wallet?->name, 'type' => $r->wallet?->type],
            'payer_is_member' => !$mine && $r->wallet && $r->wallet->user_id !== $viewer->id && $r->wallet->isAccessibleBy($viewer),
            'split' => $r->split_key ? ['key' => $r->split_key, 'title' => $r->split_title] : null,
            'reminded_at' => $r->reminded_at?->toIso8601String(),
            'paid_at' => $r->paid_at?->toIso8601String(),
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }
}
