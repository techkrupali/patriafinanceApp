<?php

namespace App\Services\Cards;

use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Paystack (https://paystack.com/docs/api): a new card goes through Paystack's
 * own checkout (Patriai never sees the number); a saved card is charged with
 * its authorization code, and the bank may ask for a code (ADD-04).
 */
class PaystackGateway implements CardGateway
{
    public function __construct(private readonly string $secret, private readonly string $baseUrl) {}

    public function name(): string
    {
        return 'paystack';
    }

    private function http(): PendingRequest
    {
        return Http::withToken($this->secret)->baseUrl(rtrim($this->baseUrl, '/'))->acceptJson()->asJson()->timeout(30);
    }

    private function email(User $user): string
    {
        return $user->email ?: "u{$user->id}@users.patriai.app";
    }

    public function checkout(CardPayment $payment, User $user, string $callbackUrl): array
    {
        $r = $this->http()->post('/transaction/initialize', [
            'email' => $this->email($user),
            'amount' => $payment->total(),
            'currency' => 'NGN',
            'reference' => $payment->reference,
            'callback_url' => $callbackUrl,
            'channels' => ['card'],
            'metadata' => ['payment_id' => $payment->id, 'wallet_id' => $payment->wallet_id],
        ]);
        if (!$r->successful() || !$r->json('status')) {
            Log::warning('Paystack initialize failed', ['reference' => $payment->reference, 'body' => $r->json()]);

            return ['status' => 'failed', 'message' => 'The card partner is not answering. Try again in a moment.'];
        }

        return ['status' => 'redirect', 'url' => (string) $r->json('data.authorization_url')];
    }

    public function verify(CardPayment $payment): array
    {
        $r = $this->http()->get('/transaction/verify/' . rawurlencode($payment->reference));
        if (!$r->successful()) {
            return ['status' => 'pending'];
        }

        return $this->result((array) $r->json('data'));
    }

    public function chargeSaved(CardPayment $payment, User $user, SavedCard $card): array
    {
        $r = $this->http()->post('/charge', [
            'email' => $this->email($user),
            'amount' => $payment->total(),
            'authorization_code' => $card->authorization_code,
            'reference' => $payment->reference,
        ]);

        return $this->result((array) $r->json('data'), (string) $r->json('message'));
    }

    public function submitOtp(CardPayment $payment, string $otp): array
    {
        $r = $this->http()->post('/charge/submit_otp', ['otp' => $otp, 'reference' => $payment->reference]);

        return $this->result((array) $r->json('data'), (string) $r->json('message'));
    }

    /** Paystack's data → a result. */
    private function result(array $d, string $fallback = ''): array
    {
        $auth = $d['authorization'] ?? null;
        $card = is_array($auth) && !empty($auth['authorization_code']) ? [
            'code' => $auth['authorization_code'],
            'signature' => $auth['signature'] ?? null,
            'brand' => ucfirst(strtolower(trim((string) ($auth['card_type'] ?? 'Card')))) ?: 'Card',
            'last4' => (string) ($auth['last4'] ?? ''),
            'exp_month' => isset($auth['exp_month']) ? (int) $auth['exp_month'] : null,
            'exp_year' => isset($auth['exp_year']) ? (int) $auth['exp_year'] : null,
            'bank' => $auth['bank'] ?? null,
            'reusable' => (bool) ($auth['reusable'] ?? false),
        ] : null;
        $message = $d['display_text'] ?? $d['gateway_response'] ?? $d['message'] ?? ($fallback ?: null);

        return match ($d['status'] ?? null) {
            'success' => ['status' => 'success', 'amount' => (int) ($d['amount'] ?? 0), 'card' => $card, 'message' => null],
            'send_otp' => ['status' => 'otp', 'message' => $message ?: 'Enter the code your bank sent you.'],
            'open_url' => ['status' => 'redirect', 'url' => $d['url'] ?? null],
            // A saved card that needs its PIN or a phone number goes through the checkout instead.
            'send_pin', 'send_phone', 'send_birthday', 'send_address' => ['status' => 'failed', 'message' => 'Your bank needs more for this card. Pay with it as a new card.'],
            'failed', 'reversed' => ['status' => 'failed', 'message' => $message ?: 'Your bank declined it.'],
            default => ['status' => 'pending', 'message' => $message],
        };
    }

    public function webhook(Request $request): ?array
    {
        $signature = (string) $request->header('x-paystack-signature');
        if ($signature === '' || !hash_equals(hash_hmac('sha512', $request->getContent(), $this->secret), $signature)) {
            return null;
        }

        return $request->json()->all();
    }
}
