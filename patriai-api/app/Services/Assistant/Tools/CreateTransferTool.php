<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\BankController;
use App\Models\Wallet;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * ACTION tool: prepare a transfer (wallet→wallet OR wallet→external bank) and
 * hand the user off to the existing secure PIN authorization flow.
 *
 * WHY THIS DOES NOT MOVE MONEY DIRECTLY
 * -------------------------------------
 * The only ad-hoc transfer path (POST /transfers → TransferController::store)
 * REQUIRES the user's transaction PIN, which PinService::verify() checks
 * before any money moves. The PIN is the transaction authorization and must never
 * be seen, collected, or transmitted by the AI. There is no PIN-less transfer
 * path, and creating one would be an unsafe workaround. So this tool:
 *
 *   1. Validates the transfer READ-ONLY, using the backend's own wallet
 *      authorization methods (isAccessibleBy / canSpend / canWithdraw /
 *      availableToSpend / approvalRequiredFor) — the same rules TransferController
 *      enforces — and, for a bank destination, resolves the bank_code and verifies
 *      the account name via the existing BankController (/banks, /banks/verify-
 *      account). It never writes and never moves money.
 *   2. Requires an explicit confirmed=true before doing anything.
 *   3. On confirmation, returns a secure_transfer hand-off telling the app to open
 *      the in-chat PIN card, prefilled. The real money movement then goes through
 *      the unchanged POST /transfers endpoint, which remains the sole authority
 *      (PIN, limits, permissions, approvals, provider, idempotency). A fresh
 *      idempotency_key is included so retries of that secure submission cannot
 *      double-send.
 *
 * The AI can therefore set a transfer up conversationally, but the money only ever
 * moves after the user authorizes it with their PIN in the secure flow.
 *
 * Recurring external-bank transfers are NOT supported by the backend — this tool
 * only prepares one-off transfers.
 */
class CreateTransferTool implements AssistantTool
{
    public function name(): string
    {
        return 'create_transfer';
    }

    public function description(): string
    {
        return 'Prepare a one-off transfer and hand the user to the secure PIN '
            .'screen. Two kinds:'
            ."\n- wallet: between two of the user's own wallets "
            .'(destination_type="wallet", destination_wallet_id).'
            ."\n- bank: to an external bank account (destination_type=\"bank\", bank, "
            .'account_number). The tool resolves the bank and VERIFIES the account '
            .'holder name — show that verified name to the user before confirming.'
            ."\n\nIMPORTANT: Sending money requires the user's transaction PIN, which "
            .'you must NEVER ask for, see, or handle. This tool does not move money; '
            .'it checks the transfer and hands the user to the secure screen where '
            .'they enter their PIN.'
            ."\n\nHOW TO USE:\n"
            .'1. Resolve wallet names to ids with get_wallets.\n'
            .'2. Collect what\'s missing conversationally (source wallet, amount, and '
            .'for a bank transfer the bank name + 10-digit account number). Never ask '
            .'for a PIN, password, or OTP.\n'
            .'3. Call with confirmed=false first to validate and (for bank) verify the '
            .'account name; show the summary — including the verified recipient — and '
            .'ask the user to confirm.\n'
            .'4. ONLY after they clearly say yes, call again with confirmed=true to '
            .'get the secure hand-off. If they cancel, do not.\n\n'
            .'Recurring external-bank transfers are NOT supported — if the user asks '
            .'to send to a bank "every month", tell them recurring bank payouts aren\'t '
            .'available and offer a one-off transfer instead. Calling with '
            .'confirmed=false (or omitted) never hands anything off.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'destination_type' => [
                    'type' => 'string',
                    'enum' => ['wallet', 'bank'],
                    'description' => 'Where the money goes: another wallet, or an external bank account.',
                ],
                'source_wallet_id' => [
                    'type' => 'integer',
                    'description' => 'Wallet the money comes FROM.',
                ],
                'amount' => [
                    'type' => 'number',
                    'description' => 'Amount to transfer, in Naira (e.g. 5000).',
                ],
                'destination_wallet_id' => [
                    'type' => 'integer',
                    'description' => 'For destination_type="wallet": the wallet the money goes TO.',
                ],
                'bank' => [
                    'type' => 'string',
                    'description' => 'For destination_type="bank": the bank name or code (e.g. "GTBank").',
                ],
                'account_number' => [
                    'type' => 'string',
                    'description' => 'For destination_type="bank": the recipient 10-digit account number.',
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'Optional note for the transfer (max 200 chars).',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to prepare the transfer for authorization. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => ['source_wallet_id', 'amount', 'confirmed'],
            'additionalProperties' => false,
            // NOTE: there is deliberately no pin / password / otp / user_id / owner_id field.
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $user = $request->user();

        $amountKobo = $this->toKobo($input['amount'] ?? null);
        if ($amountKobo === null) {
            return $this->reject('Please give a transfer amount greater than zero.');
        }

        $from = Wallet::find((int) ($input['source_wallet_id'] ?? 0));
        if (!$from || !$from->isAccessibleBy($user)) {
            return $this->reject('I couldn\'t find that source wallet in your account.');
        }

        // canSpend covers frozen wallets, out-of-schedule wallets, and members
        // without spend permission (e.g. viewers) — everyone the backend blocks.
        if (!$from->canSpend($user)) {
            return $this->reject('You don\'t have permission to move money out of that wallet.');
        }

        $destType = $input['destination_type'] ?? null;
        if ($destType === null) {
            $destType = (isset($input['account_number']) || isset($input['bank'])) ? 'bank' : 'wallet';
        }

        return $destType === 'bank'
            ? $this->handleBank($request, $user, $from, $amountKobo, $input)
            : $this->handleWallet($user, $from, $amountKobo, $input);
    }

    /** Wallet → wallet (unchanged behaviour, unified summary shape). */
    private function handleWallet($user, Wallet $from, int $amountKobo, array $input): array
    {
        $to = Wallet::find((int) ($input['destination_wallet_id'] ?? 0));
        if (!$to || !$to->isAccessibleBy($user)) {
            return $this->reject('I couldn\'t find that destination wallet in your account.');
        }
        if ($from->id === $to->id) {
            return $this->reject('The source and destination can\'t be the same wallet.');
        }
        if ($amountKobo > $from->availableToSpend()) {
            return $this->insufficient($from, 0);
        }

        $summary = $this->summary($user, $from, [
            'kind' => 'wallet',
            'name' => $to->name,
        ], $amountKobo, 0, $input['description'] ?? null);

        if (($input['confirmed'] ?? false) !== true) {
            return $this->needsConfirmation($summary);
        }

        return $this->handOff($user, $summary, [
            'from_wallet_id' => $from->id,
            'destination' => ['kind' => 'wallet', 'wallet_id' => $to->id],
            'amount' => number_format($amountKobo / 100, 2, '.', ''),
            'description' => $input['description'] ?? null,
            'idempotency_key' => (string) Str::uuid(),
        ]);
    }

    /** Wallet → external bank account (reuses /banks + /banks/verify-account). */
    private function handleBank(Request $request, $user, Wallet $from, int $amountKobo, array $input): array
    {
        // External payouts need the additive withdraw gate on top of canSpend.
        if (!$from->canWithdraw($user)) {
            return $this->reject('You don\'t have permission to withdraw from that wallet.');
        }

        $accountNumber = trim((string) ($input['account_number'] ?? ''));
        if (!preg_match('/^\d{10}$/', $accountNumber)) {
            return $this->reject('Please give a valid 10-digit account number.');
        }

        $bankInput = trim((string) ($input['bank'] ?? ''));
        if ($bankInput === '') {
            return $this->reject('Which bank is that account with?');
        }

        $bank = $this->resolveBank($bankInput);
        if ($bank === null) {
            return $this->reject('I couldn\'t match "'.$bankInput.'" to a bank. Please give the exact bank name.');
        }

        // Verify the account holder name via the existing verification flow.
        $verified = $this->verifyAccount($request, $accountNumber, $bank['bank_code']);
        if ($verified === null) {
            return $this->reject('I couldn\'t verify that account number at '.$bank['bank_name'].'. Please double-check it.');
        }
        $accountName = $verified['account_name'];
        $bankName = $verified['bank_name'] ?: $bank['bank_name'];

        $feeKobo = (int) config('services.matrix.transfer_fee_kobo', 2000);
        if (($amountKobo + $feeKobo) > $from->availableToSpend()) {
            return $this->insufficient($from, $feeKobo);
        }

        $summary = $this->summary($user, $from, [
            'kind' => 'bank',
            'name' => $accountName,
            'bank_name' => $bankName,
            'account_masked' => $this->mask($accountNumber),
        ], $amountKobo, $feeKobo, $input['description'] ?? null);

        if (($input['confirmed'] ?? false) !== true) {
            return $this->needsConfirmation($summary);
        }

        return $this->handOff($user, $summary, [
            'from_wallet_id' => $from->id,
            'destination' => [
                'kind' => 'bank',
                'bank_code' => $bank['bank_code'],
                'account_number' => $accountNumber,
                'account_name' => $accountName,
                'bank_name' => $bankName,
            ],
            'amount' => number_format($amountKobo / 100, 2, '.', ''),
            'description' => $input['description'] ?? null,
            'idempotency_key' => (string) Str::uuid(),
        ]);
    }

    // ---- shared response builders -------------------------------------------

    private function summary($user, Wallet $from, array $destination, int $amountKobo, int $feeKobo, ?string $description): array
    {
        $mayNeedApproval = $from->approvalRequiredFor($amountKobo)
            && $from->eligibleApprovers($user->id)->isNotEmpty();

        return [
            'source_wallet' => ['id' => $from->id, 'name' => $from->name],
            'destination' => $destination,
            'amount' => number_format($amountKobo / 100, 2, '.', ''),
            'fee' => number_format($feeKobo / 100, 2, '.', ''),
            'currency' => $from->currency ?? 'NGN',
            'description' => $description,
            'may_require_approval' => $mayNeedApproval,
        ];
    }

    private function needsConfirmation(array $summary): array
    {
        return [
            'created' => false,
            'needs_confirmation' => true,
            'message' => 'Show the user this transfer summary (including the verified '
                .'recipient for a bank transfer) and ask them to confirm. Call '
                .'create_transfer again with confirmed=true only after they say yes.',
            'summary' => $summary,
        ];
    }

    private function handOff($user, array $summary, array $transfer): array
    {
        return [
            'created' => false,
            'requires_pin_authorization' => true,
            'message' => 'For your security, sending money needs your transaction '
                .'PIN, which I can\'t handle. I\'ve set up the transfer — review it '
                .'and enter your PIN on the transfer card to send it.',
            'summary' => $summary,
            'authorization' => [
                'action' => 'open_secure_transfer',
                'requires_pin' => true,
                'pin_set' => (bool) $user->pin,
                'transfer' => $transfer,
            ],
        ];
    }

    private function insufficient(Wallet $from, int $feeKobo): array
    {
        $msg = 'That\'s more than the available balance in '.$from->name.' (₦'
            .number_format($from->availableToSpend() / 100, 2, '.', '').' available)';
        if ($feeKobo > 0) {
            $msg .= ', including the ₦'.number_format($feeKobo / 100, 2, '.', '').' transfer fee';
        }

        return $this->reject($msg.'.');
    }

    // ---- bank helpers (reuse BankController) --------------------------------

    /** Resolve a bank name/code to {bank_code, bank_name} via GET /banks. */
    private function resolveBank(string $input): ?array
    {
        try {
            $banks = app(BankController::class)->index()->getData(true)['data']['banks'] ?? [];
        } catch (\Throwable $e) {
            report($e);

            return null;
        }

        $needle = strtolower(trim($input));

        // Exact code, then exact name, then a single case-insensitive contains.
        foreach ($banks as $b) {
            if (strtolower((string) $b['bank_code']) === $needle || strtolower((string) $b['bank_name']) === $needle) {
                return ['bank_code' => $b['bank_code'], 'bank_name' => $b['bank_name']];
            }
        }
        $matches = array_values(array_filter($banks, fn ($b) => str_contains(strtolower((string) $b['bank_name']), $needle)));

        return count($matches) === 1
            ? ['bank_code' => $matches[0]['bank_code'], 'bank_name' => $matches[0]['bank_name']]
            : null;
    }

    /** Verify an account name via POST /banks/verify-account. */
    private function verifyAccount(Request $request, string $accountNumber, string $bankCode): ?array
    {
        try {
            $sub = Request::create('/api/v1/banks/verify-account', 'POST', [
                'account_number' => $accountNumber,
                'bank_code' => $bankCode,
            ]);
            $sub->setUserResolver(fn () => $request->user());

            $response = app(BankController::class)->verifyAccount($sub);
            if ($response->getStatusCode() >= 400) {
                return null;
            }
            $data = $response->getData(true)['data'] ?? [];

            return [
                'account_name' => $data['account_name'] ?? null,
                'bank_name' => $data['bank_name'] ?? null,
            ];
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    private function mask(string $accountNumber): string
    {
        $last4 = substr($accountNumber, -4);

        return str_repeat('*', max(0, strlen($accountNumber) - 4)).$last4;
    }

    private function reject(string $message): array
    {
        return ['created' => false, 'error' => $message];
    }

    /** Naira → kobo, positive only. Returns null on anything invalid. */
    private function toKobo(mixed $amount): ?int
    {
        if (!is_numeric($amount)) {
            return null;
        }
        $raw = trim((string) $amount);
        if (!preg_match('/^(\d{1,11})(?:\.(\d{1,2}))?$/', $raw, $m)) {
            return null;
        }
        $kobo = ((int) $m[1]) * 100 + (int) str_pad($m[2] ?? '', 2, '0');

        return $kobo > 0 ? $kobo : null;
    }
}
