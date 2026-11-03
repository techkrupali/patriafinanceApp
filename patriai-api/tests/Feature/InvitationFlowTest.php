<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\InviteBlock;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Invitations from the client prototype: FAM-03…06, INV-01…04 and INV-A1 — the
 * invite's own link that only opens for the person it went to, decline with a
 * reason and a block, "Ask for a new invite", the inviter's list, and an
 * accountant's read-only access until a date.
 */
class InvitationFlowTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{to: string, sms: string}> */
    private array $sms = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.termii.api_key' => 'test-key', 'app.url' => 'https://patriai.test']);
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/api/sms/send')) {
                $this->sms[] = ['to' => $request->data()['to'], 'sms' => $request->data()['sms']];
            }

            return Http::response(['status' => true, 'data' => []]);
        });
        Carbon::setTestNow(Carbon::parse('2026-11-04 09:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, ?string $phone = null): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'phone' => $phone]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function wallet(User $owner, string $name, string $type = 'savings', ?int $target = null): Wallet
    {
        $w = Wallet::create(['user_id' => $owner->id, 'type' => $type, 'name' => $name, 'balance' => 68_000_000, 'target_amount' => $target, 'target_date' => $target ? '2027-01-08' : null]);
        WalletMember::create(['wallet_id' => $w->id, 'user_id' => $owner->id, 'role' => 'owner', 'status' => 'active']);

        return $w;
    }

    public function test_an_invite_has_its_own_link_that_opens_only_for_the_person_it_went_to(): void
    {
        $ngozi = $this->person('Ngozi');
        $fees = $this->wallet($ngozi, 'School fees 2027', 'savings', 85_000_000);
        Sanctum::actingAs($ngozi);

        // FAM-04: by phone, a note, and "Invite expires · In 7 days".
        $res = $this->postJson("/api/v1/wallets/{$fees->id}/invitations", [
            'identifier' => '+2348031110001', 'role' => 'contributor', 'expires_in_days' => 7,
            'message' => "Chidi, I've added you so you can chip in for Tolu and Kamsi's school fees. No pressure!",
        ])->assertCreated();
        $code = WalletInvitation::sole()->code;
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}$/', $code);
        $this->assertSame("https://patriai.test/i/{$code}", $res->json('data.link'));
        // INV-01 the message on WhatsApp.
        $this->assertStringContainsString('Join School fees 2027 on Patriai. ₦680,000 of ₦850,000 saved.', $res->json('data.share_message'));
        $this->assertStringContainsString("Ngozi: Chidi, I've added you", $res->json('data.share_message'));
        $this->assertStringContainsString("/i/{$code}", $this->sms[0]['sms']);

        // INV-02 the web page, before the app; it counts as "Opened" (FAM-05).
        $this->withoutToken();
        $this->get("/i/{$code}")->assertOk()->assertSee('Ngozi Okafor')->assertSee('School fees 2027')->assertSee('You: Contributor')
            ->assertSee('Add money from any bank, card or abroad')->assertSee('Open in the Patriai app')->assertSee("patriai://i/{$code}", false);
        $this->assertNotNull(WalletInvitation::sole()->opened_at);

        // FAM-06 in the app: the same invite, signed in as the person it went to — or not.
        $chidi = $this->person('Chidi', '+2348031110001');
        Sanctum::actingAs($chidi);
        $this->getJson("/api/v1/invites/{$code}")->assertOk()
            ->assertJsonPath('data.invitation.for_you', true)
            ->assertJsonPath('data.invitation.role_label', 'Contributor')
            ->assertJsonPath('data.invitation.progress.percent', 80)
            ->assertJsonPath('data.invitation.progress.due', '8 Jan')
            ->assertJsonPath('data.invitation.cannot.0', "You can't take money out. Ngozi approves payments.")
            ->assertJsonPath('data.invitation.expires_label', 'In 7 days');
        $stranger = $this->person('Bisi', '+2348031119999');
        Sanctum::actingAs($stranger);
        $this->getJson("/api/v1/invites/{$code}")->assertJsonPath('data.invitation.for_you', false);
        $inviteId = WalletInvitation::sole()->id;
        $this->postJson("/api/v1/invitations/{$inviteId}/accept")->assertNotFound();

        // Chidi signs up with that number later and accepts.
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/invitations/{$inviteId}/accept")->assertOk();
        $this->assertTrue($fees->fresh()->isAccessibleBy($chidi));

        // INV-04: an old link says what happened.
        $this->withoutToken();
        $this->get("/i/{$code}")->assertOk()->assertSee('This invite has been used');
    }

    public function test_decline_with_a_reason_block_future_invites_and_ask_for_a_new_one(): void
    {
        $ngozi = $this->person('Ngozi');
        $chidi = $this->person('Chidi', '+2348031110001');
        $fees = $this->wallet($ngozi, 'School fees 2027');
        $car = $this->wallet($ngozi, 'Car');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$fees->id}/invitations", ['invitee_user_id' => $chidi->id, 'role' => 'contributor'])->assertCreated();
        $invite = WalletInvitation::sole();

        // INV-03 "We'll let her know. Adding a reason is optional."
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/invitations/{$invite->id}/decline", ['reason' => "I can't contribute", 'block' => true])->assertOk();
        $this->assertSame("I can't contribute", $invite->fresh()->decline_reason);
        $this->assertTrue(InviteBlock::where('user_id', $chidi->id)->where('blocked_user_id', $ngozi->id)->exists());
        $note = AppNotification::where('user_id', $ngozi->id)->where('type', 'invitation_declined')->sole();
        $this->assertSame('Chidi declined your invite', $note->title);

        // "Block future invites from Ngozi".
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$car->id}/invitations", ['invitee_user_id' => $chidi->id, 'role' => 'contributor'])
            ->assertStatus(422)->assertJsonPath('message', "You can't invite this person.");

        // FAM-05: what Ngozi sent — Waiting / Accepted / Expired.
        $emeka = $this->person('Emeka', '+2348050000318');
        $this->postJson("/api/v1/wallets/{$car->id}/invitations", ['invitee_user_id' => $emeka->id, 'role' => 'co_owner', 'expires_in_days' => 1])->assertCreated();
        $waiting = $this->getJson('/api/v1/invitations/sent?tab=waiting')->assertOk()->json('data.invites');
        $this->assertCount(1, $waiting);
        $this->assertSame(['label' => 'Sent', 'tone' => 'neutral'], $waiting[0]['chip']);
        $this->assertSame('Co-owner', $waiting[0]['role_label']);
        $declined = collect($this->getJson('/api/v1/invitations/sent?tab=expired')->json('data.invites'))->firstWhere('wallet_name', 'School fees 2027');
        $this->assertSame('Declined', $declined['chip']['label']);
        $this->assertSame("I can't contribute", $declined['decline_reason']);

        // A day later it has expired. INV-04 "Ask Ngozi for a new invite" — once a day.
        Carbon::setTestNow(now()->addDays(2));
        $code = WalletInvitation::where('invitee_user_id', $emeka->id)->value('code');
        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/invites/{$code}")->assertJsonPath('data.invitation.status', 'expired');
        $this->postJson("/api/v1/invites/{$code}/ask-again")->assertOk();
        $this->postJson("/api/v1/invites/{$code}/ask-again")->assertOk();
        $ask = AppNotification::where('user_id', $ngozi->id)->where('type', 'invitation_ask_again')->sole();
        $this->assertSame('Emeka Okafor asked for a new invite', $ask->title);
        $this->get("/i/{$code}")->assertOk()->assertSee('This invite has expired')->assertSee('Invites last 7 days')->assertSee('Ask Ngozi for a new invite');

        // The same from the web page, for someone without the app: the declined one.
        $this->withoutToken();
        $this->post("/i/{$invite->code}/ask")->assertRedirect("/i/{$invite->code}")->assertSessionHas('asked', true);
        $this->assertStringContainsString('School fees 2027 was declined', AppNotification::where('user_id', $ngozi->id)->where('type', 'invitation_ask_again')->latest('id')->first()->body);
        $this->post("/i/{$code}/ask")->assertSessionHas('asked', true);
        $this->assertSame(2, AppNotification::where('user_id', $ngozi->id)->where('type', 'invitation_ask_again')->count());

        // "Resend all" gives the waiting ones a fresh week.
        Sanctum::actingAs($ngozi);
        $this->assertSame('Expired', collect($this->getJson('/api/v1/invitations/sent?tab=expired')->json('data.invites'))->firstWhere('wallet_name', 'Car')['chip']['label']);
        $this->postJson('/api/v1/invitations/resend-all')->assertOk()->assertJsonPath('data.sent', 1);
        $this->assertTrue(WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->expires_at->isFuture());
    }

    public function test_an_accountant_gets_read_only_access_to_several_wallets_until_a_date(): void
    {
        $ngozi = $this->person('Ngozi');
        $funmi = $this->person('Funmi', '+2348060000001');
        $house = $this->wallet($ngozi, 'House Project', 'shared');
        $giving = $this->wallet($ngozi, 'Giving', 'giving');
        $kid = $this->wallet($ngozi, "Kamsi's wallet", 'child');
        Sanctum::actingAs($ngozi);

        // "Children's wallets stay hidden."
        $this->postJson('/api/v1/accountant-invites', ['wallet_ids' => [$house->id, $kid->id], 'invitee_user_id' => $funmi->id, 'access_until' => '2027-03-31'])->assertStatus(422);
        $this->postJson('/api/v1/accountant-invites', ['wallet_ids' => [$house->id], 'invitee_user_id' => $funmi->id, 'access_until' => '2026-11-01'])->assertStatus(422);
        // Already invited to one of them: nothing is sent for the others either.
        $this->postJson("/api/v1/wallets/{$giving->id}/invitations", ['invitee_user_id' => $funmi->id, 'role' => 'contributor'])->assertCreated();
        $this->postJson('/api/v1/accountant-invites', ['wallet_ids' => [$house->id, $giving->id], 'invitee_user_id' => $funmi->id, 'access_until' => '2027-03-31'])
            ->assertStatus(422)->assertJsonPath('message', 'Funmi already has an invite waiting for Giving.');
        $this->assertSame(0, WalletInvitation::where('role', 'accountant')->count());
        WalletInvitation::where('wallet_id', $giving->id)->update(['status' => 'cancelled']);
        $this->postJson('/api/v1/accountant-invites', ['wallet_ids' => [$ngozi->mainWallet()->id, $house->id, $giving->id], 'invitee_user_id' => $funmi->id, 'access_until' => '2027-03-31', 'message' => 'For the 2026 tax return'])->assertCreated();
        $this->assertSame(3, WalletInvitation::where('role', 'accountant')->count());
        $this->assertSame(2, AppNotification::where('user_id', $funmi->id)->where('type', 'invitation_received')->count()); // the earlier contributor invite, and one for the whole set

        // INV-A1 "See statements for Main, House Project and Giving · Access ends 31 Mar 2027".
        Sanctum::actingAs($funmi);
        $invite = $this->getJson('/api/v1/invitations')->assertOk()->json('data.invitations.0');
        $this->assertSame('accountant', $invite['preview']['kind']);
        $this->assertSame('See statements for Main wallet, House Project and Giving', $invite['preview']['can'][0]);
        $this->assertSame("Children's wallets stay hidden", $invite['preview']['cannot'][1]);
        $this->assertSame('31 Mar 2027', $invite['preview']['accountant']['access_until_label']);
        $this->postJson("/api/v1/invitations/{$invite['id']}/accept")->assertOk();
        foreach ([$ngozi->mainWallet(), $house, $giving] as $w) {
            $this->assertTrue($w->fresh()->isAccessibleBy($funmi));
            $this->assertFalse($w->fresh()->canSpend($funmi));
            $this->assertFalse($w->fresh()->canFund($funmi));
        }
        $this->assertFalse($kid->fresh()->isAccessibleBy($funmi));

        // The day after the date, access ends.
        Carbon::setTestNow(Carbon::parse('2027-04-01 01:00:00', 'UTC'));
        $this->artisan('access:end')->assertSuccessful();
        $this->assertFalse($house->fresh()->isAccessibleBy($funmi));
        $this->assertTrue(AppNotification::where('user_id', $funmi->id)->where('type', 'access_ended')->exists());
    }
}
