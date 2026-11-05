<?php

namespace App\Services\Cards;

use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * A local stand-in for the card partner, to test every path without real
 * money. Never used in production (see CardFundingService::gateway). Its
 * checkout page takes only these test cards:
 *
 *   4084 0840 8408 4081  Visa   paid
 *   5060 6666 6666 6666 666  Verve  the bank asks for a code: 123456
 *   4084 0800 0000 5408  Visa   declined: insufficient funds
 *   5078 5078 5078 5078 12  Verve  declined: card limit for online payments reached
 */
class SandboxGateway implements CardGateway
{
    public const OTP = '123456';

    public const CARDS = [
        '4084084084084081' => ['brand' => 'Visa', 'outcome' => 'success'],
        '5060666666666666666' => ['brand' => 'Verve', 'outcome' => 'otp'],
        '4084080000005408' => ['brand' => 'Visa', 'outcome' => 'Insufficient funds'],
        '507850785078507812' => ['brand' => 'Verve', 'outcome' => 'Card limit for online payments reached'],
    ];

    public function name(): string
    {
        return 'sandbox';
    }

    public function checkout(CardPayment $payment, User $user, string $callbackUrl): array
    {
        $payment->update(['meta' => array_merge($payment->meta ?? [], ['callback_url' => $callbackUrl])]);

        return ['status' => 'redirect', 'url' => url('/api/v1/funding/sandbox/' . $payment->reference)];
    }

    /**
     * The checkout page's answer: a test card (and the code, for the Verve
     * one). Returns the result, and remembers it for verify().
     */
    public function pay(CardPayment $payment, string $number, string $expiry, ?string $otp): array
    {
        $number = preg_replace('/\D/', '', $number);
        $test = self::CARDS[$number] ?? null;
        if (!$test) {
            return ['status' => 'failed', 'message' => 'Use one of the test cards on this page.', 'retry' => true];
        }
        [$month, $year] = array_map('intval', explode('/', preg_replace('/[^\d\/]/', '', $expiry) . '/')) + [0, 0];
        $card = [
            'code' => 'SBX_' . substr(sha1($payment->user_id . $number), 0, 20),
            'signature' => 'SBX_SIG_' . substr(sha1($number), 0, 16),
            'brand' => $test['brand'],
            'last4' => substr($number, -4),
            'exp_month' => $month ?: 12,
            'exp_year' => $year ? 2000 + ($year % 100) : 2030,
            'bank' => 'Test Bank',
            'reusable' => true,
        ];
        $result = match (true) {
            $test['outcome'] === 'success' => ['status' => 'success', 'amount' => $payment->total(), 'card' => $card],
            $test['outcome'] === 'otp' && $otp === null => ['status' => 'otp', 'message' => 'Enter the code your bank sent (test code ' . self::OTP . ').'],
            $test['outcome'] === 'otp' && $otp === self::OTP => ['status' => 'success', 'amount' => $payment->total(), 'card' => $card],
            $test['outcome'] === 'otp' => ['status' => 'otp', 'message' => 'That code is wrong. Try again.', 'retry' => true],
            default => ['status' => 'failed', 'message' => $test['outcome'], 'card' => null],
        };
        if (!($result['retry'] ?? false) && $result['status'] !== 'otp') {
            $payment->update(['meta' => array_merge($payment->meta ?? [], ['sandbox' => $result])]);
        }

        return $result;
    }

    public function verify(CardPayment $payment): array
    {
        return $payment->meta['sandbox'] ?? ['status' => 'pending'];
    }

    public function chargeSaved(CardPayment $payment, User $user, SavedCard $card): array
    {
        // Verve test cards ask for the bank's code each time; Visa goes straight through.
        if ($card->brand === 'Verve') {
            $phone = preg_replace('/\D/', '', (string) $user->phone);
            $masked = strlen($phone) >= 7 ? '0' . substr($phone, -10, 3) . ' •••• ' . substr($phone, -3) : 'your phone';

            return ['status' => 'otp', 'message' => "Enter the 6-digit code sent to {$masked} to approve ₦" . number_format($payment->total() / 100) . ' to Patriai.'];
        }

        return ['status' => 'success', 'amount' => $payment->total(), 'card' => null];
    }

    public function submitOtp(CardPayment $payment, string $otp): array
    {
        return $otp === self::OTP
            ? ['status' => 'success', 'amount' => $payment->total(), 'card' => null]
            : ['status' => 'otp', 'message' => 'That code is wrong. Check it and try again.', 'wrong' => true];
    }

    public function webhook(Request $request): ?array
    {
        return null;
    }
}
