<?php

namespace App\Services\Cards;

use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * A card payment partner. Every method answers with a result:
 *   status  success | failed | otp | pending | redirect
 *   message what to show (the bank's reason, or "Enter the code sent to…")
 *   amount  kobo actually charged (success)
 *   card    the reusable card: code, signature, brand, last4, exp_month, exp_year, bank, reusable
 *   url     where the person types their card (redirect)
 *
 * @phpstan-type Result array{status: string, message?: ?string, amount?: int, card?: ?array, url?: ?string}
 */
interface CardGateway
{
    public function name(): string;

    /** The partner's own page for a new card; it sends the person back to $callbackUrl. */
    public function checkout(CardPayment $payment, User $user, string $callbackUrl): array;

    /** Where a payment stands now. */
    public function verify(CardPayment $payment): array;

    /** Charge a card kept from before. */
    public function chargeSaved(CardPayment $payment, User $user, SavedCard $card): array;

    /** ADD-04: the code the bank sent. */
    public function submitOtp(CardPayment $payment, string $otp): array;

    /** The partner's own notification, if it really came from them: the event, else null. */
    public function webhook(Request $request): ?array;
}
