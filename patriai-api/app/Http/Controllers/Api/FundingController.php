<?php

namespace App\Http\Controllers\Api;

use App\Models\Agent;
use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\Wallet;
use App\Services\CardFundingService;
use App\Services\Cards\SandboxGateway;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as BaseResponse;

/**
 * ADD-01…09 ways to add money besides a bank transfer: by card (the payment
 * partner's checkout, saved cards, the bank's code), by USSD (the bank's own
 * transfer code to the wallet's account) and with cash at an agent.
 */
class FundingController extends ApiController
{
    private function cards(): CardFundingService
    {
        return CardFundingService::make();
    }

    // GET /funding/options?wallet_id= — ADD-01 what's on, ADD-03 saved cards, ADD-05 the USSD codes
    public function options(Request $request): JsonResponse
    {
        $data = $request->validate(['wallet_id' => ['required', 'integer']]);
        $user = $request->user();
        $wallet = Wallet::find($data['wallet_id']);
        if (!$wallet || !$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        $cards = $this->cards();
        $gateway = $cards->gateway();
        if (!$wallet->virtual_account) {
            WalletService::make()->ensureVirtualAccount($wallet);
            $wallet->refresh();
        }

        return $this->ok('Ways to add money', [
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'type' => $wallet->type],
            'card' => [
                'enabled' => $gateway !== null && $cards->canFund($user, $wallet),
                'fee_percent' => (float) config('services.cards.fee_percent'),
                'fee_cap' => number_format((int) config('services.cards.fee_cap'), 2, '.', ''),
                'min' => number_format((int) config('services.cards.min'), 2, '.', ''),
                'max' => number_format((int) config('services.cards.max'), 2, '.', ''),
                'test_mode' => $gateway?->name() === 'sandbox',
            ],
            'saved_cards' => $gateway
                ? SavedCard::where('user_id', $user->id)->where('provider', $gateway->name())->latest()->get()->map(fn ($c) => $cards->serializeCard($c))->values()
                : [],
            'account' => $wallet->virtual_account ? [
                'number' => $wallet->virtual_account,
                'bank' => $wallet->virtual_account_bank ?: 'Assetmatrix MFB',
                'name' => 'PATRIAI/' . strtoupper((string) $wallet->owner?->fullName()),
            ] : null,
            'ussd' => array_values(config('funding.ussd', [])),
        ]);
    }

    // POST /funding/card {wallet_id, amount, card_id?} — ADD-03 "Pay ₦50,750"
    public function card(Request $request): JsonResponse
    {
        $data = $request->validate([
            'wallet_id' => ['required', 'integer'],
            'amount' => ['required', 'numeric', 'min:1'],
            'card_id' => ['nullable', 'integer'],
        ]);
        $wallet = Wallet::find($data['wallet_id']);
        if (!$wallet || !$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        $payment = $this->cards()->start($request->user(), $wallet, $this->toKobo((string) $data['amount']), $data['card_id'] ?? null);

        return $this->ok('Card payment', ['payment' => $this->cards()->serialize($payment->refresh())]);
    }

    private function mine(Request $request, string $reference): ?CardPayment
    {
        return CardPayment::where('reference', $reference)->where('user_id', $request->user()->id)->first();
    }

    // GET /funding/card/{reference} — how it went (asks the partner while it's open)
    public function show(Request $request, string $reference): JsonResponse
    {
        $payment = $this->mine($request, $reference);
        if (!$payment) {
            return $this->fail('Payment not found', 404);
        }

        return $this->ok('Card payment', ['payment' => $this->cards()->serialize($this->cards()->refresh($payment)->refresh())]);
    }

    // POST /funding/card/{reference}/otp {otp} — ADD-04 "Confirm"
    public function otp(Request $request, string $reference): JsonResponse
    {
        $data = $request->validate(['otp' => ['required', 'string', 'regex:/^\d{4,8}$/']]);
        $payment = $this->mine($request, $reference);
        if (!$payment) {
            return $this->fail('Payment not found', 404);
        }

        return $this->ok('Card payment', ['payment' => $this->cards()->serialize($this->cards()->submitOtp($payment, $data['otp'])->refresh())]);
    }

    // GET /cards
    public function savedCards(Request $request): JsonResponse
    {
        $cards = SavedCard::where('user_id', $request->user()->id)->latest()->get();

        return $this->ok('Saved cards', ['cards' => $cards->map(fn ($c) => $this->cards()->serializeCard($c))->values()]);
    }

    // DELETE /cards/{card}
    public function removeCard(Request $request, int $card): JsonResponse
    {
        $row = SavedCard::where('id', $card)->where('user_id', $request->user()->id)->first();
        if (!$row) {
            return $this->fail('Card not found', 404);
        }
        $row->delete();

        return $this->ok('Card removed');
    }

    // GET /funding/agents?lat=&lng= — ADD-06 the nearest agents first
    public function agents(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
        ]);
        $here = isset($data['lat'], $data['lng']) ? [(float) $data['lat'], (float) $data['lng']] : null;
        $radius = (float) config('funding.agent_radius_km', 50) * 1000;
        $agents = Agent::where('active', true)->get()
            ->map(function (Agent $a) use ($here) {
                $metres = $here && $a->lat !== null && $a->lng !== null ? $this->metres($here, [$a->lat, $a->lng]) : null;

                return ['agent' => $a, 'metres' => $metres];
            })
            ->filter(fn ($r) => $here === null || ($r['metres'] !== null && $r['metres'] <= $radius))
            ->sortBy(fn ($r) => [$r['metres'] ?? PHP_INT_MAX, $r['agent']->city, $r['agent']->name])
            ->take(30)
            ->values();

        return $this->ok('Agents', [
            'located' => $here !== null,
            'agents' => $agents->map(fn ($r) => [
                'id' => $r['agent']->id,
                'name' => $r['agent']->name,
                'address' => $r['agent']->address,
                'area' => $r['agent']->area,
                'city' => $r['agent']->city,
                'lat' => $r['agent']->lat,
                'lng' => $r['agent']->lng,
                'hours' => $r['agent']->hours,
                'phone' => $r['agent']->phone,
                'cash_in' => $r['agent']->cash_in,
                'cash_out' => $r['agent']->cash_out,
                'distance_m' => $r['metres'] !== null ? (int) round($r['metres']) : null,
            ])->values(),
        ]);
    }

    /** Great-circle distance in metres. */
    private function metres(array $a, array $b): float
    {
        [$lat1, $lng1] = array_map('deg2rad', $a);
        [$lat2, $lng2] = array_map('deg2rad', $b);
        $h = sin(($lat2 - $lat1) / 2) ** 2 + cos($lat1) * cos($lat2) * sin(($lng2 - $lng1) / 2) ** 2;

        return 6_371_000 * 2 * asin(min(1, sqrt($h)));
    }

    // ---------------------------------------------------------------- web pages (no sign-in)

    // GET /funding/card/return?reference= — the partner sends the person back here; on to the app.
    public function cardReturn(Request $request): Response
    {
        $ref = preg_replace('/[^A-Za-z0-9-]/', '', (string) ($request->query('reference') ?: $request->query('trxref')));
        $app = 'patriai://fund/card?reference=' . $ref;
        $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>Back to Patriai</title><style>body{font-family:system-ui,sans-serif;background:#F3F7F4;color:#0E1A16;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}'
            . 'main{background:#fff;border-radius:18px;padding:28px;max-width:340px;text-align:center}a{display:block;margin-top:18px;background:#5FD3A5;color:#08392F;padding:14px;border-radius:12px;font-weight:700;text-decoration:none}</style></head>'
            . '<body><main><h2>Payment sent</h2><p>Go back to Patriai to see if it went through.</p><a href="' . e($app) . '">Back to Patriai</a></main>'
            . '<script>location.href=' . json_encode($app) . ';</script></body></html>';

        return response($html, 200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store']);
    }

    private function sandboxPayment(string $reference): CardPayment
    {
        $payment = CardPayment::where('reference', $reference)->where('provider', 'sandbox')->first();
        // Test cards only where the sandbox is switched on, never in production.
        abort_unless($payment && $this->cards()->gateway() instanceof SandboxGateway, 404);

        return $payment;
    }

    // GET /funding/sandbox/{reference} — the test checkout ("the partner's page")
    public function sandboxPage(string $reference): Response
    {
        return $this->sandboxForm($this->sandboxPayment($reference));
    }

    // POST /funding/sandbox/{reference} {number, expiry, cvv, otp?}
    public function sandboxPay(Request $request, string $reference): BaseResponse
    {
        $payment = $this->sandboxPayment($reference);
        if ($payment->status !== 'pending' || isset($payment->meta['sandbox'])) {
            return redirect()->away(($payment->meta['callback_url'] ?? url('/api/v1/funding/card/return')) . '?reference=' . $payment->reference);
        }
        /** @var SandboxGateway $gateway */
        $gateway = $this->cards()->gateway();
        $result = $gateway->pay($payment, (string) $request->input('number'), (string) $request->input('expiry'), $request->filled('otp') ? (string) $request->input('otp') : null);
        if ($result['status'] === 'otp' || ($result['retry'] ?? false)) {
            return $this->sandboxForm($payment, $result['message'] ?? null, $result['status'] === 'otp' ? $request->only(['number', 'expiry', 'cvv']) : null);
        }

        return redirect()->away(($payment->meta['callback_url'] ?? url('/api/v1/funding/card/return')) . '?reference=' . $payment->reference);
    }

    private function sandboxForm(CardPayment $p, ?string $note = null, ?array $card = null): Response
    {
        $amount = '₦' . number_format($p->total() / 100, 2);
        $action = e(url('/api/v1/funding/sandbox/' . $p->reference));
        $fields = $card
            ? '<input type="hidden" name="number" value="' . e($card['number'] ?? '') . '"><input type="hidden" name="expiry" value="' . e($card['expiry'] ?? '') . '"><input type="hidden" name="cvv" value="' . e($card['cvv'] ?? '') . '">'
                . '<label>Code from your bank<input name="otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>'
            : '<label>Card number<input name="number" inputmode="numeric" autocomplete="off" required></label>'
                . '<div class="row"><label>Expiry (MM/YY)<input name="expiry" placeholder="08/28" required></label><label>CVV<input name="cvv" inputmode="numeric" maxlength="4" required></label></div>';
        $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test card payment</title>'
            . '<style>body{font-family:system-ui,sans-serif;background:#F3F7F4;color:#0E1A16;margin:0;padding:20px}main{background:#fff;border-radius:18px;padding:20px;max-width:420px;margin:0 auto}'
            . 'label{display:block;font-size:13px;margin-top:12px}input{display:block;width:100%;box-sizing:border-box;height:46px;border:1px solid #6F8A7E;border-radius:12px;padding:0 12px;font-size:16px;margin-top:4px}'
            . '.row{display:flex;gap:10px}.row label{flex:1}button{width:100%;height:50px;margin-top:18px;border:0;border-radius:12px;background:#5FD3A5;color:#08392F;font-weight:700;font-size:16px}'
            . '.tag{display:inline-block;background:#FCEBCC;color:#8F5400;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}.note{background:#FBE3DD;color:#B3311A;border-radius:12px;padding:10px;margin-top:12px;font-size:14px}'
            . 'ul{font-size:13px;color:#3D5249;padding-left:18px}</style></head><body><main>'
            . '<span class="tag">TEST MODE · no real money</span><h2>Pay ' . e($amount) . '</h2><p style="color:#3D5249;margin-top:-8px">To Patriai · ' . e($p->reference) . '</p>'
            . ($note ? '<div class="note">' . e($note) . '</div>' : '')
            . '<form method="post" action="' . $action . '">' . $fields . '<button type="submit">Pay ' . e($amount) . '</button></form>'
            . ($card ? '' : '<p style="font-size:13px;margin-top:18px"><b>Test cards</b></p><ul><li>4084 0840 8408 4081 — paid</li><li>5060 6666 6666 6666 666 — bank asks for a code (123456)</li><li>4084 0800 0000 5408 — declined, insufficient funds</li><li>5078 5078 5078 5078 12 — declined, card limit</li></ul>')
            . '</main></body></html>';

        return response($html, 200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store']);
    }

    // POST /webhooks/paystack — the partner's own notification (signed)
    public function paystackWebhook(Request $request): JsonResponse
    {
        $gateway = $this->cards()->gateway();
        if (!$gateway || $gateway->name() !== 'paystack') {
            return $this->fail('Card payments are not set up', 503);
        }
        $event = $gateway->webhook($request);
        if ($event === null) {
            return $this->fail('Unauthorized', 401);
        }
        $this->cards()->handleWebhook($event);

        return $this->ok('Received');
    }
}
