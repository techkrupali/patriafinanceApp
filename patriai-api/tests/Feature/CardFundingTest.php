<?php

namespace Tests\Feature;

use App\Models\Agent;
use App\Models\AppNotification;
use App\Models\CardPayment;
use App\Models\SavedCard;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Adding money (client prototype ADD-01…09): by card through the payment
 * partner (a saved card, or the partner's checkout for a new one, and the
 * bank's code when it asks), the USSD codes for the wallet's account, and the
 * cash agents nearest first.
 */
class CardFundingTest extends TestCase
{
    use RefreshDatabase;

    private function ngozi(int $tier = 2): array
    {
        Http::fake();
        $user = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => $tier, 'phone' => '+2348034127790']);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 293_200_00, 'virtual_account' => '8034127790', 'virtual_account_bank' => 'Assetmatrix MFB']);
        Sanctum::actingAs($user);

        return [$user, $main];
    }

    /** The test checkout: card details (and the bank's code), then back to the app. */
    private function checkout(string $reference, string $number, ?string $otp = null)
    {
        return $this->post("/api/v1/funding/sandbox/{$reference}", array_filter(['number' => $number, 'expiry' => '08/28', 'cvv' => '123', 'otp' => $otp]));
    }

    public function test_cards_are_off_until_a_partner_is_set_up(): void
    {
        [$user, $main] = $this->ngozi();
        $this->getJson("/api/v1/funding/options?wallet_id={$main->id}")->assertOk()
            ->assertJsonPath('data.card.enabled', false)
            ->assertJsonPath('data.account.number', '8034127790')
            ->assertJsonPath('data.ussd.0.bank', 'GTBank');
        $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50000'])->assertStatus(422);

        // The test cards never work where real money moves.
        config(['services.cards.driver' => 'sandbox']);
        $this->app['env'] = 'production';
        $this->getJson("/api/v1/funding/options?wallet_id={$main->id}")->assertJsonPath('data.card.enabled', false);
    }

    public function test_a_new_card_through_the_checkout_lands_once_and_is_kept(): void
    {
        [$user, $main] = $this->ngozi();
        config(['services.cards.driver' => 'sandbox']);

        $p = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50000'])->assertOk()->json('data.payment');
        $this->assertSame(['pending', '50000.00', '750.00', '50750.00'], [$p['status'], $p['amount'], $p['fee'], $p['total']]);
        $this->assertStringContainsString("/api/v1/funding/sandbox/{$p['reference']}", $p['checkout_url']);
        $this->get($p['checkout_url'])->assertOk()->assertSee('Pay ₦50,750.00')->assertSee('TEST MODE');

        // Not back yet: still waiting.
        $this->getJson("/api/v1/funding/card/{$p['reference']}")->assertJsonPath('data.payment.status', 'pending');
        $this->checkout($p['reference'], '4084 0840 8408 4081')->assertRedirectContains("/api/v1/funding/card/return?reference={$p['reference']}");
        $this->get("/api/v1/funding/card/return?reference={$p['reference']}")->assertOk()->assertSee("patriai://fund/card?reference={$p['reference']}", false);

        $done = $this->getJson("/api/v1/funding/card/{$p['reference']}")->assertOk()->json('data.payment');
        $this->assertSame(['success', 'Visa •••• 4081', '343200.00'], [$done['status'], $done['card'], $done['wallet']['balance']]);
        $this->assertSame(343_200_00, $main->refresh()->balance);
        $this->assertSame('Card · Visa •••• 4081', Transaction::where('wallet_id', $main->id)->where('type', 'fund')->sole()->description);
        $this->assertSame(1, AppNotification::where('user_id', $user->id)->where('type', 'money_received')->count());
        // Asking again (or the partner's notification) never adds it twice.
        $this->getJson("/api/v1/funding/card/{$p['reference']}")->assertJsonPath('data.payment.status', 'success');
        $this->assertSame(343_200_00, $main->refresh()->balance);
        $this->assertSame(['Visa', '4081', '08/28'], [SavedCard::sole()->brand, SavedCard::sole()->last4, SavedCard::sole()->expiry()]);
        $this->getJson("/api/v1/funding/options?wallet_id={$main->id}")->assertJsonPath('data.saved_cards.0.label', 'Visa •••• 4081');
    }

    public function test_a_saved_card_asks_for_the_banks_code(): void
    {
        [$user, $main] = $this->ngozi();
        config(['services.cards.driver' => 'sandbox']);
        // Kept from a first payment, where the bank asked for its code at the checkout.
        $first = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '1000'])->json('data.payment');
        $this->checkout($first['reference'], '5060666666666666666')->assertOk()->assertSee('Code from your bank');
        $this->checkout($first['reference'], '5060666666666666666', '123456')->assertRedirect();
        $this->getJson("/api/v1/funding/card/{$first['reference']}")->assertJsonPath('data.payment.status', 'success');
        $card = SavedCard::where('brand', 'Verve')->sole();

        $p = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50000', 'card_id' => $card->id])->assertOk()->json('data.payment');
        $this->assertSame('otp', $p['status']);
        $this->assertSame('Enter the 6-digit code sent to 0803 •••• 790 to approve ₦50,750 to Patriai.', $p['message']);
        $this->postJson("/api/v1/funding/card/{$p['reference']}/otp", ['otp' => '000000'])->assertStatus(422)->assertJsonValidationErrors('otp');
        $this->postJson("/api/v1/funding/card/{$p['reference']}/otp", ['otp' => '123456'])->assertOk()->assertJsonPath('data.payment.status', 'success');
        $this->assertSame(293_200_00 + 1_000_00 + 50_000_00, $main->refresh()->balance);

        // Three wrong codes end it; nothing is taken.
        $q = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '2000', 'card_id' => $card->id])->json('data.payment');
        $this->postJson("/api/v1/funding/card/{$q['reference']}/otp", ['otp' => '111111'])->assertStatus(422);
        $this->postJson("/api/v1/funding/card/{$q['reference']}/otp", ['otp' => '222222'])->assertStatus(422);
        $this->postJson("/api/v1/funding/card/{$q['reference']}/otp", ['otp' => '333333'])->assertOk()->assertJsonPath('data.payment.status', 'failed');
        $this->assertSame(344_200_00, $main->refresh()->balance);
    }

    public function test_a_declined_card_says_why_and_takes_nothing(): void
    {
        [$user, $main] = $this->ngozi();
        config(['services.cards.driver' => 'sandbox']);
        $p = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50000'])->json('data.payment');
        $this->checkout($p['reference'], '5078 5078 5078 5078 12')->assertRedirect();
        $this->getJson("/api/v1/funding/card/{$p['reference']}")->assertJsonPath('data.payment.status', 'failed')
            ->assertJsonPath('data.payment.message', 'Card limit for online payments reached');
        $this->assertSame(293_200_00, $main->refresh()->balance);
        $this->assertSame(0, SavedCard::count());
    }

    public function test_limits_and_who_may_add(): void
    {
        [$user, $main] = $this->ngozi(1);
        config(['services.cards.driver' => 'sandbox']);
        // Tier 1: Main holds up to ₦300,000.
        $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '10000'])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50'])->assertStatus(422);
        // Someone else's wallet.
        $other = Wallet::create(['user_id' => User::factory()->create()->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0, 'virtual_account' => '8000000001']);
        $this->postJson('/api/v1/funding/card', ['wallet_id' => $other->id, 'amount' => '1000'])->assertNotFound();
        $this->getJson('/api/v1/funding/card/PTF-NONE-00')->assertNotFound();
    }

    public function test_paystack_checkout_and_its_signed_notification(): void
    {
        config(['services.cards.driver' => 'paystack', 'services.paystack.secret' => 'sk_test_x', 'services.paystack.base_url' => 'https://api.paystack.test']);
        // The partner's answers first: the first matching fake wins.
        Http::fake([
            'api.paystack.test/transaction/initialize' => Http::response(['status' => true, 'data' => ['authorization_url' => 'https://checkout.paystack.com/abc', 'access_code' => 'abc']]),
            'api.paystack.test/transaction/verify/*' => fn ($r) => Http::response(['status' => true, 'data' => [
                'status' => 'success', 'amount' => 5_075_000, 'reference' => basename($r->url()),
                'authorization' => ['authorization_code' => 'AUTH_1', 'card_type' => 'visa ', 'last4' => '9012', 'exp_month' => '01', 'exp_year' => '2027', 'bank' => 'GTBank', 'reusable' => true, 'signature' => 'SIG_1'],
            ]]),
        ]);
        [$user, $main] = $this->ngozi();
        $p = $this->postJson('/api/v1/funding/card', ['wallet_id' => $main->id, 'amount' => '50000'])->assertOk()->json('data.payment');
        $this->assertSame('https://checkout.paystack.com/abc', $p['checkout_url']);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/transaction/initialize') && $r['amount'] === 5_075_000 && $r['reference'] === $p['reference'] && $r->hasHeader('Authorization', 'Bearer sk_test_x'));

        $body = json_encode(['event' => 'charge.success', 'data' => ['reference' => $p['reference']]]);
        $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_PAYSTACK_SIGNATURE' => 'forged'], $body)->assertUnauthorized();
        $this->call('POST', '/api/v1/webhooks/paystack', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_PAYSTACK_SIGNATURE' => hash_hmac('sha512', $body, 'sk_test_x')], $body)->assertOk();
        $this->assertSame('success', CardPayment::sole()->status);
        $this->assertSame(343_200_00, $main->refresh()->balance);
        $this->assertSame('Visa •••• 9012', SavedCard::sole()->label());
        $this->assertNotSame('AUTH_1', \DB::table('saved_cards')->value('authorization_code')); // kept encrypted
    }

    public function test_agents_nearest_first_and_kept_in_admin(): void
    {
        [$user] = $this->ngozi();
        Agent::create(['name' => 'Admiralty Way Pharmacy', 'area' => 'Lekki', 'city' => 'Lagos', 'lat' => 6.4474, 'lng' => 3.4723, 'hours' => 'Open till 10 pm', 'cash_out' => true]);
        Agent::create(['name' => 'Mama Nkechi Stores', 'area' => 'Lekki', 'city' => 'Lagos', 'lat' => 6.4400, 'lng' => 3.4650, 'hours' => 'Open till 9 pm', 'cash_out' => true]);
        Agent::create(['name' => 'Wuse Market POS', 'area' => 'Wuse', 'city' => 'Abuja', 'lat' => 9.0765, 'lng' => 7.4793]);
        Agent::create(['name' => 'Closed shop', 'city' => 'Lagos', 'lat' => 6.4400, 'lng' => 3.4650, 'active' => false]);

        $near = $this->getJson('/api/v1/funding/agents?lat=6.4380&lng=3.4630')->assertOk()->json('data');
        $this->assertTrue($near['located']);
        $this->assertSame(['Mama Nkechi Stores', 'Admiralty Way Pharmacy'], array_column($near['agents'], 'name'));
        $this->assertLessThan(400, $near['agents'][0]['distance_m']);
        $this->assertCount(3, $this->getJson('/api/v1/funding/agents')->json('data.agents'));

        // Admin adds and switches off agents; others can't.
        $this->postJson('/api/v1/admin/agents', ['name' => 'X', 'city' => 'Lagos'])->assertForbidden();
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->postJson('/api/v1/admin/agents', ['name' => 'Lekki Phase 1 POS', 'city' => 'Lagos', 'area' => 'Lekki', 'lat' => 6.45, 'lng' => 3.47, 'hours' => 'Open 24 hours'])->assertCreated();
        $this->postJson('/api/v1/admin/agents', ['name' => 'No city'])->assertStatus(422);
        $id = Agent::where('name', 'Wuse Market POS')->value('id');
        $this->patchJson("/api/v1/admin/agents/{$id}", ['active' => false])->assertOk()->assertJsonPath('data.agent.active', false);
        $this->getJson('/api/v1/admin/agents')->assertOk()->assertJsonPath('data.summary.active', 3)->assertJsonPath('data.summary.off', 2);
    }
}
