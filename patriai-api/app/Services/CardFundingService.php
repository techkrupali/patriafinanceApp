<?php

namespace App\Services;

use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\User;
use App\Models\Wallet;
use App\Services\Cards\CardGateway;
use App\Services\Cards\PaystackGateway;
use App\Services\Cards\SandboxGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * ADD-03/04/08/09 adding money by card: the amount and the fee on top, a saved
 * card or the partner's checkout for a new one, the bank's code when it asks,
 * then "Money added" — or why not. Money lands in the wallet once, whichever
 * comes first: the app checking, or the partner's own notification.
 */
class CardFundingService
{
    public static function make(): self
    {
        return new self;
    }

    /** The partner in use, or null when card top-ups are off (no keys yet). */
    public function gateway(): ?CardGateway
    {
        $driver = config('services.cards.driver');
        if ($driver === 'paystack' && config('services.paystack.secret')) {
            return new PaystackGateway((string) config('services.paystack.secret'), (string) config('services.paystack.base_url'));
        }
        // Test cards only, and never where real money moves.
        if ($driver === 'sandbox' && !app()->environment('production')) {
            return new SandboxGateway;
        }

        return null;
    }

    public function enabled(): bool
    {
        return $this->gateway() !== null;
    }

    /** "Fee ₦750 (1.5%)": a share of the amount, up to the cap. Kobo. */
    public function fee(int $amount): int
    {
        $fee = (int) round($amount * (float) config('services.cards.fee_percent') / 100);

        return min($fee, (int) config('services.cards.fee_cap') * 100);
    }

    /** Who may add money to this wallet by card: anyone in it but a viewer, while it takes money in. */
    public function canFund(User $user, Wallet $wallet): bool
    {
        return $wallet->isAccessibleBy($user)
            && $wallet->roleOf($user) !== 'viewer'
            && !$wallet->hidesSpendingFrom($user)
            && !in_array($wallet->status, ['closed', 'suspended'], true);
    }

    private function reference(): string
    {
        do {
            $ref = 'PTF-' . strtoupper(Str::random(4)) . '-' . random_int(10, 99);
        } while (CardPayment::where('reference', $ref)->exists());

        return $ref;
    }

    /** ADD-03 "Pay ₦50,750": with a saved card, or by opening the partner's checkout. */
    public function start(User $user, Wallet $wallet, int $amount, ?int $savedCardId): CardPayment
    {
        $gateway = $this->gateway() ?? throw ValidationException::withMessages(['card' => 'Paying by card is coming soon. Use a bank transfer for now.']);
        if (!$this->canFund($user, $wallet)) {
            throw ValidationException::withMessages(['wallet_id' => 'You can’t add money to this wallet.']);
        }
        $min = (int) config('services.cards.min') * 100;
        $max = (int) config('services.cards.max') * 100;
        if ($amount < $min || $amount > $max) {
            throw ValidationException::withMessages(['amount' => 'Add between ₦' . number_format($min / 100) . ' and ₦' . number_format($max / 100) . ' by card.']);
        }
        // A Main wallet holds only what the person's level allows.
        if ($wallet->type === 'main' && $wallet->user_id === $user->id) {
            $cap = LimitService::make()->tier((int) $user->kyc_tier)['max_balance'];
            if ($cap !== null && $wallet->balance + $amount > $cap) {
                throw ValidationException::withMessages(['amount' => 'Your Main wallet can hold up to ₦' . number_format($cap / 100) . ' at your level. Add less, or verify more.']);
            }
        }
        $card = null;
        if ($savedCardId) {
            $card = SavedCard::where('id', $savedCardId)->where('user_id', $user->id)->where('provider', $gateway->name())->first()
                ?? throw ValidationException::withMessages(['card_id' => 'Choose one of your saved cards.']);
        }

        $payment = CardPayment::create([
            'user_id' => $user->id,
            'wallet_id' => $wallet->id,
            'saved_card_id' => $card?->id,
            'provider' => $gateway->name(),
            'reference' => $this->reference(),
            'amount' => $amount,
            'fee' => $this->fee($amount),
            'status' => 'pending',
            'card_label' => $card?->label(),
        ]);

        $result = $card
            ? $gateway->chargeSaved($payment, $user, $card)
            : $gateway->checkout($payment, $user, url('/api/v1/funding/card/return'));

        return $this->apply($payment, $result);
    }

    /** ADD-04 "Confirm": the code from the bank. Three wrong codes end the payment. */
    public function submitOtp(CardPayment $payment, string $otp): CardPayment
    {
        if ($payment->status !== 'otp') {
            throw ValidationException::withMessages(['otp' => 'This payment isn’t waiting for a code.']);
        }
        $gateway = $this->gatewayFor($payment);
        $result = $gateway->submitOtp($payment, $otp);
        if ($result['wrong'] ?? false) {
            $payment->increment('otp_tries');
            if ($payment->otp_tries >= 3) {
                return $this->apply($payment, ['status' => 'failed', 'message' => 'Too many wrong codes. You have not been charged.']);
            }
            throw ValidationException::withMessages(['otp' => $result['message'] ?? 'That code is wrong.']);
        }

        return $this->apply($payment, $result);
    }

    /** After the checkout, or while waiting: ask the partner how it went. */
    public function refresh(CardPayment $payment): CardPayment
    {
        if (in_array($payment->status, ['pending', 'otp'], true) && ($gateway = $this->gatewayFor($payment, false))) {
            $result = $gateway->verify($payment);
            if ($result['status'] !== 'pending' && !($payment->status === 'otp' && $result['status'] === 'otp')) {
                return $this->apply($payment, $result);
            }
        }

        return $payment;
    }

    private function gatewayFor(CardPayment $payment, bool $strict = true): ?CardGateway
    {
        $gateway = $this->gateway();
        if (!$gateway || $gateway->name() !== $payment->provider) {
            if ($strict) {
                throw ValidationException::withMessages(['card' => 'Card payments are paused. You have not been charged.']);
            }

            return null;
        }

        return $gateway;
    }

    /** Take a partner's answer: money in, a failure with the bank's reason, or wait. */
    public function apply(CardPayment $payment, array $result): CardPayment
    {
        return match ($result['status'] ?? 'pending') {
            'success' => $this->complete($payment, $result),
            'failed' => tap($payment)->update(['status' => 'failed', 'message' => $result['message'] ?? 'Your bank declined it.']),
            'otp' => tap($payment)->update(['status' => 'otp', 'message' => $result['message'] ?? 'Enter the code your bank sent you.']),
            'redirect' => tap($payment)->update(['meta' => array_merge($payment->meta ?? [], ['checkout_url' => $result['url'] ?? null])]),
            default => $payment,
        };
    }

    /** ADD-08 "Money added": into the wallet once, the card kept, everyone told. */
    private function complete(CardPayment $payment, array $result): CardPayment
    {
        $credited = false;
        $payment = DB::transaction(function () use ($payment, $result, &$credited) {
            $p = CardPayment::whereKey($payment->id)->lockForUpdate()->first();
            if ($p->status === 'success') {
                return $p;
            }
            if ((int) ($result['amount'] ?? 0) < $p->total()) {
                Log::error('Card payment amount mismatch', ['reference' => $p->reference, 'charged' => $result['amount'] ?? null, 'expected' => $p->total()]);
                $p->update(['status' => 'failed', 'message' => 'The amount charged did not match. Contact support with this reference.']);

                return $p;
            }

            $card = $p->savedCard;
            if (!$card && ($c = $result['card'] ?? null) && ($c['reusable'] ?? false) && !empty($c['code'])) {
                $card = SavedCard::where('user_id', $p->user_id)->where('provider', $p->provider)
                    ->where(fn ($q) => $q->where('signature', $c['signature'] ?? '-')->orWhere(fn ($q) => $q->where('last4', $c['last4'])->where('exp_month', $c['exp_month'])->where('exp_year', $c['exp_year'])->where('brand', $c['brand'])))
                    ->first();
                if ($card) {
                    $card->update(['authorization_code' => $c['code']]);
                } else {
                    $card = SavedCard::create([
                        'user_id' => $p->user_id, 'provider' => $p->provider, 'authorization_code' => $c['code'], 'signature' => $c['signature'] ?? null,
                        'brand' => $c['brand'], 'last4' => $c['last4'], 'exp_month' => $c['exp_month'], 'exp_year' => $c['exp_year'], 'bank' => $c['bank'] ?? null,
                    ]);
                }
            }
            $label = $card?->label() ?? $p->card_label ?? 'Card';

            $txn = WalletService::make()->credit(
                $p->wallet,
                $p->amount,
                'fund',
                ['kind' => 'card', 'source_name' => $label, 'card' => $label, 'fee' => $p->fee, 'reference' => $p->reference],
                'card:' . $p->reference,
                "Card · {$label}",
                $p->user_id,
            );
            $p->update(['status' => 'success', 'saved_card_id' => $card?->id, 'card_label' => $label, 'message' => null, 'transaction_id' => $txn->id]);
            $credited = $txn->wasRecentlyCreated;

            return $p;
        });

        if ($credited && $payment->status === 'success') {
            $txn = $payment->transaction;
            $wallet = $payment->wallet->refresh();
            NotificationService::make()->push($payment->user, 'money_received', 'Money added', '₦' . number_format($payment->amount / 100) . " from {$payment->card_label} is in {$wallet->name}.", ['wallet_id' => $wallet->id, 'transaction_reference' => $txn->reference, 'amount' => $txn->amount]);
            WalletManageService::make()->notifyPayment($wallet, $txn, $payment->user);
            AutomationService::make()->runDeposits($wallet, $txn);
        }

        return $payment;
    }

    /** The partner's own notification (charge.success), for payments the app never came back to. */
    public function handleWebhook(array $event): void
    {
        if (($event['event'] ?? null) !== 'charge.success') {
            return;
        }
        $payment = CardPayment::where('reference', (string) ($event['data']['reference'] ?? ''))->first();
        if (!$payment || $payment->status === 'success') {
            return;
        }
        // Trust the partner's own record over the notification's body.
        $this->refresh($payment);
    }

    /** What the app shows on ADD-03/04/08/09. */
    public function serialize(CardPayment $p): array
    {
        $wallet = $p->wallet;
        $naira = fn (int $k) => number_format($k / 100, 2, '.', '');

        return [
            'reference' => $p->reference,
            'status' => $p->status,
            'amount' => $naira($p->amount),
            'fee' => $naira($p->fee),
            'total' => $naira($p->total()),
            'card' => $p->card_label,
            'message' => $p->message,
            'checkout_url' => $p->status === 'pending' ? ($p->meta['checkout_url'] ?? null) : null,
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'balance' => $naira((int) $wallet->balance)],
            'transaction_reference' => $p->transaction?->reference,
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }

    public function serializeCard(SavedCard $c): array
    {
        return ['id' => $c->id, 'brand' => $c->brand, 'last4' => $c->last4, 'label' => $c->label(), 'expiry' => $c->expiry(), 'bank' => $c->bank];
    }
}
