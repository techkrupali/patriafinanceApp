<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends ApiController
{
    // GET /wallets
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $own = $user->wallets()->latest()->get()->map(fn ($w) => $this->serializeWallet($w) + ['my_role' => 'owner']);
        $member = $user->memberWallets()
            ->where('wallets.user_id', '!=', $user->id)
            ->get()
            ->map(fn ($w) => $this->serializeWallet($w, withOwner: true) + ['my_role' => $w->pivot->role]);

        return $this->ok('Wallets fetched', ['wallets' => $own->concat($member)->values()]);
    }

    // POST /wallets  { type: shared|project, name }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:shared,project'],
            'name' => ['required', 'string', 'max:100'],
        ]);

        $wallet = WalletService::make()->createWallet($request->user(), $data['type'], $data['name']);

        return $this->ok('Wallet created', ['wallet' => $this->serializeWallet($wallet)], 201);
    }

    // GET /wallets/{wallet}
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $members = $wallet->members()->with('user')->where('status', 'active')->get()->map(fn ($m) => [
            'user_id' => $m->user_id,
            'name' => $m->user->fullName(),
            'email' => $m->user->email,
            'role' => $m->role,
        ]);

        return $this->ok('Wallet fetched', [
            'wallet' => $this->serializeWallet($wallet, withOwner: true),
            'members' => $members,
            'recent_transactions' => $wallet->transactions()->latest()->limit(10)->get()
                ->map(fn ($t) => $this->serializeTransaction($t)),
        ]);
    }

    // GET /wallets/{wallet}/transactions
    public function transactions(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        $txns = $wallet->transactions()
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('direction'), fn ($q, $d) => $q->where('direction', $d))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Transactions fetched', [
            'transactions' => collect($txns->items())->map(fn ($t) => $this->serializeTransaction($t)),
            'pagination' => [
                'page' => $txns->currentPage(),
                'per_page' => $txns->perPage(),
                'total' => $txns->total(),
                'last_page' => $txns->lastPage(),
            ],
        ]);
    }

    // GET /wallets/{wallet}/funding-details
    public function fundingDetails(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }

        if (!$wallet->virtual_account) {
            WalletService::make()->ensureVirtualAccount($wallet);
            $wallet->refresh();
        }

        if (!$wallet->virtual_account) {
            return $this->fail('Funding account is being provisioned. Try again shortly.', 503);
        }

        return $this->ok('Funding details fetched', [
            'account_number' => $wallet->virtual_account,
            'bank_name' => $wallet->virtual_account_bank,
            'account_name' => 'PATRIAI/' . strtoupper($wallet->owner->fullName()),
            'note' => 'Transfer any amount to this account from any Nigerian bank to fund this wallet instantly.',
        ]);
    }

    // POST /wallets/{wallet}/withdraw  { amount, bank_code, account_number, account_name, pin, description? }
    public function withdraw(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if (!$wallet->canSpend($request->user())) {
            return $this->fail('You do not have permission to move money out of this wallet', 403);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'bank_code' => ['required', 'string'],
            'account_number' => ['required', 'digits:10'],
            'account_name' => ['required', 'string', 'max:150'],
            'bank_name' => ['required', 'string', 'max:150'],
            'pin' => ['required', 'digits:4'],
            'description' => ['nullable', 'string', 'max:200'],
        ]);

        $user = $request->user();
        app(\App\Services\PinService::class)->verify($user, $data['pin']);

        $txn = WalletService::make()->withdrawToBank(
            $wallet,
            $user,
            $this->toKobo($data['amount']),
            $data['bank_code'],
            $data['account_number'],
            $data['account_name'],
            $data['bank_name'],
            $data['description'] ?? null,
        );

        return $this->ok('Withdrawal successful', ['transaction' => $this->serializeTransaction($txn)]);
    }
}
