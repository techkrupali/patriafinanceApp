<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\MoneyRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\MoneyRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Request money (REQ-01…03) and split a bill (SPL-01): ask someone for an
 * amount into one of your wallets; they pay all or part with their PIN through
 * the same checks as any payment, or decline; a link anyone can pay by bank
 * transfer; reminders the day before it's due.
 */
class MoneyRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url' => 'https://patriai.test', 'services.matrix.webhook_secret' => 'secret']);
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['token' => 't', 'reference' => 'BANK-REF']]));
    }

    private function person(string $first, string $username, int $balance = 0, int $tier = 3): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'name' => "{$first} Okafor", 'username' => $username, 'kyc_tier' => $tier]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $balance]);

        return [$user, $main];
    }

    public function test_ask_pay_part_then_the_rest(): void
    {
        [$ngozi] = $this->person('Ngozi', 'ngozi');
        [$chidi, $chidiMain] = $this->person('Chidi', 'chidi', 10_000_000);
        $fund = Wallet::create(['user_id' => $ngozi->id, 'type' => 'emergency', 'name' => "Mama and Papa's health fund", 'balance' => 0]);
        WalletMember::create(['wallet_id' => $fund->id, 'user_id' => $chidi->id, 'role' => 'contributor', 'status' => 'active']);

        // REQ-01 "Send request".
        Sanctum::actingAs($ngozi);
        $due = now()->addDays(3)->toDateString();
        $r = $this->postJson('/api/v1/money-requests', ['identifier' => '@chidi', 'amount' => '45000', 'note' => "Your half of Mama's hospital bill", 'wallet_id' => $fund->id, 'due_on' => $due])
            ->assertCreated()->assertJsonPath('data.mine', true)->assertJsonPath('data.amount', '45000.00')->assertJsonPath('data.payer.name', 'Chidi Okafor')
            ->assertJsonPath('data.wallet.name', "Mama and Papa's health fund")->json('data');
        $this->assertMatchesRegularExpression('#^https://patriai\.test/r/[A-Z2-9]{4}$#', $r['link']);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $chidi->id, 'type' => 'money_request']);
        // Not yourself; not a wallet that isn't yours.
        $this->postJson('/api/v1/money-requests', ['identifier' => '@ngozi', 'amount' => '10', 'wallet_id' => $fund->id])->assertStatus(422);
        $this->postJson('/api/v1/money-requests', ['identifier' => '@chidi', 'amount' => '10', 'wallet_id' => $chidiMain->id])->assertStatus(404);
        // You can't pay your own request.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $fund->id, 'amount' => '10', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $r['code']]])->assertStatus(422);

        // REQ-03 as Chidi: "Goes to … You're a contributor".
        Sanctum::actingAs($chidi);
        $this->getJson("/api/v1/money-requests/{$r['code']}")->assertOk()->assertJsonPath('data.mine', false)->assertJsonPath('data.payer_is_member', true)
            ->assertJsonPath('data.requester.name', 'Ngozi Okafor')->assertJsonPath('data.payer.contact', null);
        $this->getJson('/api/v1/money-requests')->assertOk()->assertJsonPath('data.to_me.0.code', $r['code']);

        // "Pay part": ₦20,000 now — through the PIN and limits like any payment.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '20000', 'pin' => '9999', 'destination' => ['kind' => 'request', 'code' => $r['code']]])->assertStatus(422);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '20000', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $r['code']]])
            ->assertOk()->assertJsonPath('data.recipient.name', 'Ngozi Okafor');
        $this->assertSame(2_000_000, $fund->fresh()->balance);
        $this->assertSame(8_000_000, $chidiMain->fresh()->balance);
        $this->getJson("/api/v1/money-requests/{$r['code']}")->assertJsonPath('data.status', 'pending')->assertJsonPath('data.left', '25000.00')->assertJsonPath('data.paid_amount', '20000.00');
        $this->assertSame("Ngozi's request: Your half of Mama's hospital bill", $chidiMain->transactions()->latest('id')->value('description'));

        // Paying more than is left takes only what's left; then it's paid.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '30000', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $r['code']]])->assertOk();
        $this->assertSame(4_500_000, $fund->fresh()->balance);
        $this->assertSame(5_500_000, $chidiMain->fresh()->balance);
        $this->getJson("/api/v1/money-requests/{$r['code']}")->assertJsonPath('data.status', 'paid');
        $this->assertSame(2, AppNotification::where('user_id', $ngozi->id)->where('type', 'money_request_paid')->count());
        // Paid: nothing more goes.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $r['code']]])
            ->assertStatus(422)->assertJsonPath('errors.request.0', 'This request is already paid.');
        $this->postJson("/api/v1/money-requests/{$r['code']}/decline")->assertStatus(422);
    }

    public function test_decline_cancel_remind_and_who_can_see_it(): void
    {
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 'ngozi');
        [$chidi, $chidiMain] = $this->person('Chidi', 'chidi', 1_000_000);
        [$emeka] = $this->person('Emeka', 'emeka');
        Sanctum::actingAs($ngozi);
        $one = $this->postJson('/api/v1/money-requests', ['identifier' => '@chidi', 'amount' => '5000', 'wallet_id' => $ngoziMain->id])->json('data.code');
        $two = $this->postJson('/api/v1/money-requests', ['identifier' => '@chidi', 'amount' => '7000', 'wallet_id' => $ngoziMain->id])->json('data.code');

        // Someone else can't see or pay it.
        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/money-requests/{$one}")->assertNotFound();
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $one]])->assertNotFound();

        // REQ-03 "Pay part, or decline".
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/money-requests/{$one}/decline", ['reason' => 'I paid Mama directly'])->assertOk()->assertJsonPath('data.status', 'declined');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'money_request_declined']);
        $this->postJson("/api/v1/money-requests/{$two}/cancel")->assertNotFound(); // only the one who asked

        // The one who asked: remind once an hour, then cancel.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/money-requests/{$two}/remind")->assertOk()->assertJsonPath('data.status', 'pending');
        $this->postJson("/api/v1/money-requests/{$two}/remind")->assertStatus(429);
        $this->assertSame(3, AppNotification::where('user_id', $chidi->id)->where('type', 'money_request')->count()); // two asks and a reminder
        $this->postJson("/api/v1/money-requests/{$two}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $chidi->id, 'type' => 'money_request_cancelled']);
        $this->getJson('/api/v1/money-requests')->assertOk()->assertJsonCount(2, 'data.sent');

        Sanctum::actingAs($chidi);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidiMain->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $two]])
            ->assertStatus(422)->assertJsonPath('errors.request.0', 'This request was cancelled.');
        $this->assertSame(1_000_000, $chidiMain->fresh()->balance);
    }

    public function test_someone_not_on_patriai_pays_by_link_and_transfer(): void
    {
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 'ngozi');
        $ngoziMain->update(['virtual_account' => '9012345678', 'virtual_account_bank' => 'Providus']);
        Sanctum::actingAs($ngozi);
        $r = $this->postJson('/api/v1/money-requests', ['name' => 'Amaka', 'contact' => '0803 111 2233', 'amount' => '21250', 'note' => 'Birthday dinner', 'wallet_id' => $ngoziMain->id])
            ->assertCreated()->assertJsonPath('data.payer.on_patriai', false)->assertJsonPath('data.payer.name', 'Amaka')->assertJsonPath('data.payer.contact', '+2348031112233')->json('data');
        $this->postJson('/api/v1/money-requests', ['name' => 'Amaka', 'contact' => '0803 111', 'amount' => '10', 'wallet_id' => $ngoziMain->id])->assertStatus(422);

        // REQ-02 "Anyone can pay with this link, even without the app".
        $this->get("/r/{$r['code']}")->assertOk()->assertSee('Ngozi Okafor')->assertSee('₦21,250')->assertSee('9012345678')->assertSee('Birthday dinner')
            ->assertSee("patriai://r/{$r['code']}", false);
        $this->get('/r/ZZZZ9')->assertNotFound();

        // A transfer with the code in the narration counts toward it.
        $this->withHeaders(['x-webhook-secret' => 'secret'])->postJson('/api/v1/webhooks/banking', ['accountNumber' => '9012345678', 'amount' => '21250', 'sessionId' => 'amaka-1', 'narration' => "FT/{$r['code']} dinner", 'sourceAccountName' => 'AMAKA OBI'])->assertOk();
        $this->assertSame('paid', MoneyRequest::where('code', $r['code'])->value('status'));
        $this->assertSame(2_125_000, $ngoziMain->fresh()->balance);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'money_request_paid', 'title' => 'AMAKA OBI paid ₦21,250']);
        // A retried delivery doesn't count twice; an ordinary deposit isn't matched.
        $this->withHeaders(['x-webhook-secret' => 'secret'])->postJson('/api/v1/webhooks/banking', ['accountNumber' => '9012345678', 'amount' => '21250', 'sessionId' => 'amaka-1', 'narration' => "FT/{$r['code']}"])->assertOk();
        $this->assertSame(2_125_000, MoneyRequest::where('code', $r['code'])->value('paid_amount'));
        $this->get("/r/{$r['code']}")->assertOk()->assertSee('This request is paid');

        // An open link (asked by SMS): whoever opens it in the app can pay it.
        [$amaka, $amakaMain] = $this->person('Amaka', 'amaka', 1_000_000);
        Sanctum::actingAs($ngozi);
        $open = $this->postJson('/api/v1/money-requests', ['name' => 'Bisi', 'contact' => '08099990000', 'amount' => '500', 'wallet_id' => $ngoziMain->id])->json('data.code');
        Sanctum::actingAs($amaka);
        $this->getJson("/api/v1/money-requests/{$open}")->assertOk();
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $amakaMain->id, 'amount' => '500', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $open]])->assertOk();
        $this->assertSame($amaka->id, MoneyRequest::where('code', $open)->value('payer_user_id'));
    }

    public function test_paying_from_a_shared_wallet_waits_for_approval(): void
    {
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 'ngozi');
        [$chidi] = $this->person('Chidi', 'chidi');
        [$emeka] = $this->person('Emeka', 'emeka');
        $house = Wallet::create(['user_id' => $chidi->id, 'type' => 'joint', 'name' => 'Our house', 'balance' => 10_000_000, 'approval_enabled' => true, 'approval_threshold' => 0, 'required_approvals' => 1]);
        WalletMember::create(['wallet_id' => $house->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active', 'can_approve' => true]);
        Sanctum::actingAs($ngozi);
        $code = $this->postJson('/api/v1/money-requests', ['identifier' => '@chidi', 'amount' => '3000', 'wallet_id' => $ngoziMain->id])->json('data.code');

        Sanctum::actingAs($chidi);
        $approval = $this->postJson('/api/v1/transfers', ['from_wallet_id' => $house->id, 'amount' => '3000', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $code]])
            ->assertOk()->assertJsonPath('data.pending_approval', true)->json('data.approval.id');
        $this->assertSame('pending', MoneyRequest::where('code', $code)->value('status'));

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$approval}/respond", ['decision' => 'approve', 'pin' => '1234'])->assertOk();
        $this->assertSame('paid', MoneyRequest::where('code', $code)->value('status'));
        $this->assertSame(300_000, $ngoziMain->fresh()->balance);
        $this->assertSame(9_700_000, $house->fresh()->balance);
    }

    public function test_split_a_bill_equally_by_amount_and_by_share(): void
    {
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 'ngozi');
        [$emeka, $emekaMain] = $this->person('Emeka', 'emeka', 5_000_000);
        [$chidi] = $this->person('Chidi', 'chidi');
        Sanctum::actingAs($ngozi);

        // SPL-01 "₦85,000 · Equally": four of us, so ₦21,250 each from three.
        $split = $this->postJson('/api/v1/bill-splits', ['title' => "Mama's 70th birthday dinner", 'place' => 'Yellow Chilli', 'total' => '85000', 'method' => 'equal', 'wallet_id' => $ngoziMain->id, 'people' => [
            ['identifier' => '@emeka'], ['identifier' => '@chidi'], ['name' => 'Amaka', 'contact' => '08031112233'],
        ]])->assertCreated()->assertJsonPath('data.asked', '63750.00')->assertJsonPath('data.my_part', '21250.00')->assertJsonPath('data.place', 'Yellow Chilli')
            ->assertJsonPath('data.people.0.amount', '21250.00')->assertJsonPath('data.people.2.payer.on_patriai', false)->assertJsonPath('data.waiting', ['Emeka', 'Chidi', 'Amaka'])->json('data');

        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $emekaMain->id, 'amount' => '21250', 'pin' => '1234', 'destination' => ['kind' => 'request', 'code' => $split['people'][0]['code']]])->assertOk();

        // "Back to you so far ₦21,250 of ₦63,750" · "Remind Chidi and Amaka".
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/bill-splits/{$split['key']}")->assertOk()->assertJsonPath('data.back', '21250.00')->assertJsonPath('data.waiting', ['Chidi', 'Amaka'])->assertJsonPath('data.people.0.status', 'paid');
        $this->postJson("/api/v1/bill-splits/{$split['key']}/remind")->assertOk();
        $this->postJson("/api/v1/bill-splits/{$split['key']}/remind")->assertStatus(429);
        $this->assertSame(2, AppNotification::where('user_id', $chidi->id)->where('type', 'money_request')->count());
        Sanctum::actingAs($chidi);
        $this->getJson("/api/v1/bill-splits/{$split['key']}")->assertNotFound(); // only the one who paid sees the split

        // By amount: no more than the bill.
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/bill-splits', ['title' => 'Fuel', 'total' => '10000', 'method' => 'amount', 'wallet_id' => $ngoziMain->id, 'people' => [['identifier' => '@emeka', 'amount' => '6000'], ['identifier' => '@chidi', 'amount' => '5000']]])->assertStatus(422);
        $this->postJson('/api/v1/bill-splits', ['title' => 'Fuel', 'total' => '10000', 'method' => 'amount', 'wallet_id' => $ngoziMain->id, 'people' => [['identifier' => '@emeka', 'amount' => '6000'], ['identifier' => '@chidi', 'amount' => '3000']]])
            ->assertCreated()->assertJsonPath('data.people.1.amount', '3000.00')->assertJsonPath('data.my_part', '1000.00');
        // By share: Emeka 2, Chidi 1, me 1 → ₦5,000 and ₦2,500 of ₦10,000.
        $this->postJson('/api/v1/bill-splits', ['title' => 'Rent top-up', 'total' => '10000', 'method' => 'share', 'my_shares' => 1, 'wallet_id' => $ngoziMain->id, 'people' => [['identifier' => '@emeka', 'shares' => 2], ['identifier' => '@chidi', 'shares' => 1]]])
            ->assertCreated()->assertJsonPath('data.people.0.amount', '5000.00')->assertJsonPath('data.people.1.amount', '2500.00')->assertJsonPath('data.method', 'share');
    }

    public function test_reminder_the_day_before_its_due(): void
    {
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 'ngozi');
        [$chidi] = $this->person('Chidi', 'chidi');
        $service = MoneyRequestService::make();
        $today = Carbon::parse('2026-10-28', 'Africa/Lagos');
        $due = $service->ask($ngozi, $ngoziMain, $chidi, 4_500_000, 'Hospital bill', $today->copy()->addDays(2));
        $later = $service->ask($ngozi, $ngoziMain, $chidi, 100_000, null, $today->copy()->addDays(5));

        $this->assertSame(0, $service->remindDue($today));
        $this->assertSame(1, $service->remindDue($today->copy()->addDay())); // Thursday for Friday
        $this->assertSame(0, $service->remindDue($today->copy()->addDay())); // once
        $this->assertNotNull($due->fresh()->reminded_at);
        $this->assertNull($later->fresh()->reminded_at);
        $this->assertSame(1, AppNotification::where('user_id', $chidi->id)->where('title', 'like', 'Reminder:%')->count());
        $this->artisan('requests:remind')->assertSuccessful();
    }

    public function test_links_moved_referral_to_join(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'referral_code' => 'NGOZI500']);
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/referrals')->assertOk()->assertJsonPath('data.share_url', 'https://patriai.test/join/NGOZI500');
        $this->get('/join/NGOZI500')->assertOk()->assertSee('Ngozi invited you to Patriai');
    }
}
