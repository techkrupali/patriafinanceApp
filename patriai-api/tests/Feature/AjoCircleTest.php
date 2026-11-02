<?php

namespace Tests\Feature;

use App\Models\AjoCircle;
use App\Models\AjoContribution;
use App\Models\AjoMember;
use App\Models\AppNotification;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use App\Services\AjoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ajo circles from the client prototype (AJO-01…04, INV-J1, WPV-06): everyone
 * pays the same amount each round into a pot Patriai holds, and the pot goes
 * to one member per round in a drawn or agreed order.
 */
class AjoCircleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'data' => []]));
        // Wednesday 28 October 2026, 10:00 in Lagos.
        Carbon::setTestNow(Carbon::parse('2026-10-28 09:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainNaira = 0, int $tier = 1): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Adeyemi', 'kyc_tier' => $tier]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainNaira * 100]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    /** AJO-01 as the organiser: ₦50,000 a month, late fee ₦2,000 after 3 days. */
    private function circle(User $organiser, int $size = 3, string $frequency = 'monthly', string $starts = '2026-11-01'): Wallet
    {
        Sanctum::actingAs($organiser);
        $id = $this->postJson('/api/v1/ajo', [
            'name' => 'Unity ladies ajo', 'contribution' => '50000', 'size' => $size, 'frequency' => $frequency,
            'starts_on' => $starts, 'late_fee' => '2000', 'late_after_days' => 3,
        ])->assertCreated()->json('data.ajo.wallet_id');

        return Wallet::find($id);
    }

    private function joinByCode(User $user, Wallet $pot, bool $autoPay = true): void
    {
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/ajo-codes/' . AjoCircle::where('wallet_id', $pot->id)->value('code') . '/join', ['auto_pay' => $autoPay])->assertCreated();
    }

    /** Three people in an agreed order, started on 1 Nov. */
    private function running(array $people, ?Carbon $at = null): Wallet
    {
        [$organiser] = $people[0];
        $pot = $this->circle($organiser, count($people));
        foreach (array_slice($people, 1) as $p) {
            $this->joinByCode($p[0], $pot, $p[2] ?? true);
        }
        $circle = AjoCircle::where('wallet_id', $pot->id)->first();
        $order = collect($people)->map(fn ($p) => AjoMember::where('circle_id', $circle->id)->where('user_id', $p[0]->id)->value('id'))->all();
        Sanctum::actingAs($organiser);
        $this->postJson("/api/v1/ajo/{$pot->id}/start", ['order_mode' => 'agreed', 'order' => $order, 'allow_swaps' => true])->assertOk();

        return $pot;
    }

    private function runAt(string $lagos): void
    {
        Carbon::setTestNow(Carbon::parse($lagos, 'Africa/Lagos'));
        $this->artisan('ajo:run')->assertSuccessful();
    }

    public function test_a_circle_is_set_up_people_join_and_a_draw_sets_the_order(): void
    {
        [$mama] = $this->person('Chioma', 0, 2);
        [$funke] = $this->person('Funke');
        [$ngozi] = $this->person('Ngozi');
        [$chidi] = $this->person('Chidi', 0, 0);
        [$tunde] = $this->person('Tunde');

        $pot = $this->circle($mama);
        $this->getJson("/api/v1/ajo/{$pot->id}")->assertOk()
            ->assertJsonPath('data.ajo.role', 'organiser')
            ->assertJsonPath('data.ajo.status', 'forming')
            ->assertJsonPath('data.ajo.joined', 1)
            ->assertJsonPath('data.ajo.payout_amount', '150000.00')
            ->assertJsonPath('data.ajo.late_fee_label', '₦2,000 after 3 days')
            ->assertJsonPath('data.ajo.period_label', 'Nov 2026 to Jan 2027');
        $this->assertNull($pot->virtual_account);
        // "Organisers can't touch the pot."
        $this->assertFalse($pot->canSpend($mama));
        $this->assertFalse($pot->canFund($mama));

        // INV-J1: Funke is invited by name and joins.
        $this->postJson("/api/v1/ajo/{$pot->id}/invite", ['invitee_user_id' => $funke->id])->assertCreated()
            ->assertJsonPath('data.ajo.invited.0.name', $funke->fullName());
        Sanctum::actingAs($funke);
        $inv = $this->getJson('/api/v1/invitations')->assertOk()
            ->assertJsonPath('data.invitations.0.ajo.members_label', '1 joined of 3')
            ->assertJsonPath('data.invitations.0.ajo.pay_label', '₦50,000 every month')
            ->assertJsonPath('data.invitations.0.ajo.receive_label', '₦150,000 once')
            ->assertJsonPath('data.invitations.0.ajo.pay_day_label', 'On the 1st of every month')
            ->json('data.invitations.0.id');
        $this->postJson("/api/v1/invitations/{$inv}/accept", ['auto_pay' => true])->assertOk();

        // "Everyone must be verified to join."
        $code = AjoCircle::where('wallet_id', $pot->id)->value('code');
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/ajo-codes/{$code}/join")->assertStatus(422)->assertJsonFragment(['message' => 'Everyone must be verified to join. Verify your BVN first.']);

        // TRS-03 "Join an ajo circle · With a code from the organiser".
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/ajo-codes/{$code}")->assertOk()->assertJsonPath('data.ajo.open', true)->assertJsonPath('data.ajo.members_label', '2 joined of 3');
        $this->postJson("/api/v1/ajo-codes/{$code}/join", ['auto_pay' => false])->assertCreated()->assertJsonPath('data.ajo.me.auto_pay', false);
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/ajo-codes/{$code}/join")->assertStatus(422)->assertJsonFragment(['message' => 'This circle is full.']);
        $this->assertTrue(AppNotification::where('user_id', $mama->id)->where('type', 'ajo_joined')->where('body', 'Everyone has joined. Set the order and start the circle.')->exists());

        // AJO-02 "Random draw" → "Start the circle".
        Sanctum::actingAs($mama);
        $res = $this->postJson("/api/v1/ajo/{$pot->id}/start", ['order_mode' => 'random', 'allow_swaps' => true])->assertOk()
            ->assertJsonPath('data.ajo.status', 'active');
        $positions = collect($res->json('data.ajo.members'))->pluck('position')->sort()->values()->all();
        $this->assertSame([1, 2, 3], $positions);
        $this->assertSame(3, AppNotification::where('type', 'ajo_started')->count());
        // Nobody else can be invited once it has started.
        $this->postJson("/api/v1/ajo/{$pot->id}/invite", ['invitee_user_id' => $tunde->id])->assertStatus(422);
    }

    public function test_rounds_take_payments_add_the_late_fee_and_pay_each_turn(): void
    {
        [$mama, $mamaMain] = $this->person('Chioma', 200_000, 2);
        [$funke, $funkeMain] = $this->person('Funke', 200_000);
        [$ngozi, $ngoziMain] = $this->person('Ngozi', 0);
        $pot = $this->running([[$mama], [$funke], [$ngozi]]);

        // 1 Nov, 8:00 am: Main pays for Mama and Funke; Ngozi's Main is empty.
        $this->runAt('2026-11-01 08:00');
        $this->assertSame(150_000_00, $mamaMain->refresh()->balance);
        $this->assertSame(100_000_00, $pot->refresh()->balance);
        $this->assertTrue(AppNotification::where('user_id', $ngozi->id)->where('type', 'ajo_payment_failed')->exists());
        Sanctum::actingAs($mama);
        $this->getJson("/api/v1/ajo/{$pot->id}")->assertOk()
            ->assertJsonPath('data.ajo.round.number', 1)
            ->assertJsonPath('data.ajo.round.label', 'November')
            ->assertJsonPath('data.ajo.round.paid', 2)
            ->assertJsonPath('data.ajo.round.collected', '100000.00')
            ->assertJsonPath('data.ajo.round.recipient.name', 'you')
            ->assertJsonPath('data.ajo.round.pay_on_label', '5 Nov')
            ->assertJsonPath('data.ajo.stats.due_today', 1)
            ->assertJsonPath('data.ajo.members.2.round_status.label', 'Due today');

        // 3 Nov: "Late 2 days"; 4 Nov: the fee is added and it counts as missed (AJO-04).
        $this->runAt('2026-11-03 08:00');
        Sanctum::actingAs($mama);
        $this->getJson("/api/v1/ajo/{$pot->id}")->assertJsonPath('data.ajo.members.2.round_status.label', 'Late 2 days')->assertJsonPath('data.ajo.stats.late', 1);
        $this->runAt('2026-11-04 08:00');
        $late = AppNotification::where('user_id', $ngozi->id)->where('type', 'ajo_late')->sole();
        $this->assertSame("November's ₦50,000 is late", $late->title);
        $this->assertStringContainsString('You have missed 1.', $late->body);
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/ajo/{$pot->id}")->assertOk()
            ->assertJsonPath('data.ajo.me.due.total', '52000.00')
            ->assertJsonPath('data.ajo.me.due.fee', '2000.00')
            ->assertJsonPath('data.ajo.me.due.days_late', 3)
            ->assertJsonPath('data.ajo.me.missed', 1)
            ->assertJsonPath('data.ajo.me.turn_label', 'January 2027');

        // 5 Nov: Mama's turn — what's in the pot goes to her Main.
        $this->runAt('2026-11-05 08:00');
        $this->assertSame(250_000_00, $mamaMain->refresh()->balance);
        $this->assertSame(0, $pot->refresh()->balance);

        // Ngozi pays late, with the fee: it goes straight on to Mama.
        $ngoziMain->refresh()->update(['balance' => 60_000_00]);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/ajo/{$pot->id}/pay", ['pin' => '0000'])->assertStatus(422);
        $this->postJson("/api/v1/ajo/{$pot->id}/pay", ['pin' => '1234'])->assertOk()->assertJsonPath('data.paid.amount', '52000.00');
        $this->assertSame(8_000_00, $ngoziMain->refresh()->balance);
        $this->assertSame(302_000_00, $mamaMain->refresh()->balance);
        $this->assertSame(0, $pot->refresh()->balance);
        $this->assertTrue(AppNotification::where('user_id', $mama->id)->where('type', 'ajo_payout')->where('title', '₦52,000 more from Unity ladies ajo')->exists());
        Sanctum::actingAs($mama);
        $this->getJson("/api/v1/ajo/{$pot->id}")->assertJsonPath('data.ajo.stats.fees_collected', '2000.00');

        // 1 Dec: round 2, Funke's turn on 5 Dec.
        $ngoziMain->refresh()->update(['balance' => 50_000_00]);
        $this->runAt('2026-12-01 08:00');
        $this->runAt('2026-12-05 08:00');
        $this->assertSame(250_000_00, $funkeMain->refresh()->balance);

        // Round 3 pays Ngozi, and the circle is complete.
        $ngoziMain->refresh()->update(['balance' => 50_000_00]);
        $this->runAt('2027-01-01 08:00');
        $this->runAt('2027-01-05 08:00');
        $this->assertSame(150_000_00, $ngoziMain->refresh()->balance);
        $this->assertSame('completed', AjoCircle::where('wallet_id', $pot->id)->value('status'));
    }

    public function test_missing_three_rounds_moves_your_turn_to_the_end(): void
    {
        $people = [];
        foreach (['Chioma', 'Funke', 'Blessing', 'Hauwa', 'Aisha'] as $i => $name) {
            [$u] = $this->person($name, $name === 'Hauwa' ? 0 : 500_000, $i === 0 ? 2 : 1);
            $people[] = [$u];
        }
        [$mama] = $people[0];
        $pot = $this->circle($mama, 5, 'weekly', '2026-11-02');
        foreach (array_slice($people, 1) as [$u]) {
            $this->joinByCode($u, $pot);
        }
        $circle = AjoCircle::where('wallet_id', $pot->id)->first();
        $order = collect($people)->map(fn ($p) => AjoMember::where('circle_id', $circle->id)->where('user_id', $p[0]->id)->value('id'))->all();
        Sanctum::actingAs($mama);
        $this->postJson("/api/v1/ajo/{$pot->id}/start", ['order_mode' => 'agreed', 'order' => $order])->assertOk();

        $hauwa = AjoMember::where('circle_id', $circle->id)->where('user_id', $people[3][0]->id)->first();
        $aisha = AjoMember::where('circle_id', $circle->id)->where('user_id', $people[4][0]->id)->first();
        $this->assertSame(4, $hauwa->position);
        for ($day = Carbon::parse('2026-11-02'); $day->lte(Carbon::parse('2026-11-19')); $day->addDay()) {
            $this->runAt($day->toDateString() . ' 08:00');
        }
        $this->assertSame(3, $hauwa->refresh()->missed);
        $this->assertSame('lost_turn', $hauwa->status);
        $this->assertSame(5, $hauwa->position);
        $this->assertSame(4, $aisha->refresh()->position);
        $this->assertTrue(AppNotification::where('user_id', $hauwa->user_id)->where('type', 'ajo_turn_lost')->exists());
    }

    public function test_members_swap_turns_when_both_agree(): void
    {
        [$mama] = $this->person('Chioma', 0, 2);
        [$funke] = $this->person('Funke');
        [$ngozi] = $this->person('Ngozi');
        $pot = $this->running([[$mama], [$funke], [$ngozi]]);
        $circle = AjoCircle::where('wallet_id', $pot->id)->first();
        $f = AjoMember::where('circle_id', $circle->id)->where('user_id', $funke->id)->first();
        $n = AjoMember::where('circle_id', $circle->id)->where('user_id', $ngozi->id)->first();

        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/ajo/{$pot->id}/swaps", ['member_id' => $f->id])->assertCreated()
            ->assertJsonPath('data.ajo.me.swap_out.name', 'Funke A.');
        Sanctum::actingAs($funke);
        $swap = $this->getJson("/api/v1/ajo/{$pot->id}")->assertJsonPath('data.ajo.me.swaps_in.0.name', 'Ngozi A.')->json('data.ajo.me.swaps_in.0.id');
        $this->postJson("/api/v1/ajo-swaps/{$swap}/respond", ['accept' => true])->assertOk();
        $this->assertSame(3, $f->refresh()->position);
        $this->assertSame(2, $n->refresh()->position);
        $this->assertTrue(AppNotification::where('user_id', $ngozi->id)->where('title', 'Funke agreed to swap')->exists());

        // A turn that has come can't swap.
        $this->runAt('2026-11-01 08:00');
        Sanctum::actingAs($ngozi);
        $mamaMember = AjoMember::where('circle_id', $circle->id)->where('user_id', $mama->id)->value('id');
        $this->postJson("/api/v1/ajo/{$pot->id}/swaps", ['member_id' => $mamaMember])->assertStatus(422);
    }

    public function test_the_organiser_replaces_a_member_who_has_not_paid_in(): void
    {
        [$mama] = $this->person('Chioma', 500_000, 2);
        [$funke] = $this->person('Funke', 500_000);
        [$ngozi] = $this->person('Ngozi', 0);
        [$tunde] = $this->person('Tunde', 100_000);
        $pot = $this->running([[$mama], [$funke], [$ngozi]]);
        $circle = AjoCircle::where('wallet_id', $pot->id)->first();
        $n = AjoMember::where('circle_id', $circle->id)->where('user_id', $ngozi->id)->first();
        $f = AjoMember::where('circle_id', $circle->id)->where('user_id', $funke->id)->first();
        $this->runAt('2026-11-01 08:00');

        // Funke has paid in, so she keeps her place.
        Sanctum::actingAs($mama);
        $this->postJson("/api/v1/ajo/{$pot->id}/members/{$f->id}/replace", ['invitee_user_id' => $tunde->id])->assertStatus(422);
        $this->postJson("/api/v1/ajo/{$pot->id}/members/{$n->id}/replace", ['invitee_user_id' => $tunde->id])->assertCreated();

        Sanctum::actingAs($tunde);
        $inv = $this->getJson('/api/v1/invitations')->json('data.invitations.0.id');
        $this->postJson("/api/v1/invitations/{$inv}/accept", ['auto_pay' => true])->assertOk();
        $t = AjoMember::where('circle_id', $circle->id)->where('user_id', $tunde->id)->first();
        $this->assertSame(3, $t->position);
        $this->assertSame('replaced', $n->refresh()->status);
        $this->assertFalse($pot->refresh()->isAccessibleBy($ngozi));

        // Tunde pays from the next run, for round 1 too.
        $this->runAt('2026-11-02 08:00');
        $this->assertSame(50_000_00, $tunde->mainWallet()->balance);
    }

    public function test_home_shows_the_payment_and_the_turn_and_leaves_the_pot_out_of_the_total(): void
    {
        [$mama] = $this->person('Chioma', 500_000, 2);
        [$funke] = $this->person('Funke', 500_000);
        [$ngozi] = $this->person('Ngozi', 10_000);
        $pot = $this->running([[$mama], [$funke], [$ngozi]]);
        $this->runAt('2026-11-01 08:00');
        $this->runAt('2026-11-02 08:00');

        Sanctum::actingAs($ngozi);
        $home = $this->getJson('/api/v1/home')->assertOk();
        $this->assertSame('10000.00', $home->json('data.totals.total'));
        $kinds = collect($home->json('data.upcoming'))->pluck('kind');
        $this->assertTrue($kinds->contains('ajo_due'));
        $this->assertSame('Unity ladies ajo: your payment is late', collect($home->json('data.needs_you.items'))->firstWhere('kind', 'ajo_due')['label']);

        Sanctum::actingAs($mama);
        $home = $this->getJson('/api/v1/home')->assertOk();
        // ₦500,000 less her ₦50,000; the pot (₦100,000 so far) isn't hers.
        $this->assertSame('450000.00', $home->json('data.totals.total'));
        $this->assertSame('ajo_payout', collect($home->json('data.upcoming'))->firstWhere('kind', 'ajo_payout')['kind']);

        // TRS-02: the circle in the wallet list.
        Sanctum::actingAs($ngozi);
        $row = collect($this->getJson('/api/v1/wallets')->json('data.wallets'))->firstWhere('type', 'ajo');
        $this->assertSame('Your turn in January', $row['ajo']['line']);
        $this->assertSame('150000.00', $row['ajo']['payout']);

        // Nobody moves money into the pot by hand.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $ngozi->mainWallet()->id, 'destination' => ['kind' => 'wallet', 'wallet_id' => $pot->id], 'amount' => '1000', 'pin' => '1234'])
            ->assertStatus(422);
    }

    public function test_rules_can_change_but_not_the_money_once_it_starts_and_a_forming_circle_can_be_cancelled(): void
    {
        [$mama] = $this->person('Chioma', 0, 2);
        [$funke] = $this->person('Funke');
        $pot = $this->circle($mama, 2);
        $this->patchJson("/api/v1/ajo/{$pot->id}", ['contribution' => '20000', 'size' => 4])->assertOk()->assertJsonPath('data.ajo.payout_amount', '80000.00');
        $this->joinByCode($funke, $pot);
        Sanctum::actingAs($funke);
        $this->patchJson("/api/v1/ajo/{$pot->id}", ['late_fee' => '500'])->assertStatus(422);

        Sanctum::actingAs($mama);
        $this->postJson("/api/v1/ajo/{$pot->id}/start", ['order_mode' => 'random'])->assertOk()->assertJsonPath('data.ajo.size', 2);
        $this->patchJson("/api/v1/ajo/{$pot->id}", ['contribution' => '30000'])->assertStatus(422);
        $this->patchJson("/api/v1/ajo/{$pot->id}", ['late_fee' => '1000', 'allow_swaps' => false])->assertOk()
            ->assertJsonPath('data.ajo.late_fee_label', '₦1,000 after 3 days')
            ->assertJsonPath('data.ajo.allow_swaps', false);
        $this->postJson("/api/v1/ajo/{$pot->id}/cancel")->assertStatus(422);

        $other = $this->circle($mama, 3);
        $this->postJson("/api/v1/ajo/{$other->id}/cancel")->assertOk()->assertJsonPath('data.ajo.status', 'cancelled');
        $this->assertSame('closed', $other->refresh()->status);
    }
}
