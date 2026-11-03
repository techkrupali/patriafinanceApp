<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\AutomationRule;
use App\Models\ChildTask;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The child wallet once it's set up: the child's own phone linked with its code
 * (CHW-06), the child's app (CHD-03…07), what parents (CHD-09), a co-parent
 * (WPV-04) and a relative (WPV-05) see, and tasks with rewards (CHD-07/12).
 */
class ChildAppTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
        Storage::fake('local');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3, 'phone' => '+23480' . random_int(10000000, 99999999)]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    /** Requests from the child's own phone, signed in with its token (not whoever acted last). */
    private function kid(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    /** Ngozi's "Kamsi's wallet" with Emeka as co-parent and Aunty Ada as a relative. */
    private function kamsi(): array
    {
        [$ngozi, $main] = $this->person('Ngozi', 10_000_000);
        [$emeka] = $this->person('Emeka');
        [$ada, $adaMain] = $this->person('Ada', 5_000_000);
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $code = $this->postJson('/api/v1/children/link-code', ['first_name' => 'Kamsi'])->json('data.code');
        $id = $this->postJson('/api/v1/wallets', [
            'type' => 'child',
            'name' => "Kamsi's wallet",
            'mode' => 'shared',
            'members' => [['user_id' => $emeka->id, 'role' => 'co_owner', 'can_approve' => true], ['user_id' => $ada->id, 'role' => 'contributor', 'permissions' => ['view' => false, 'fund' => true, 'request' => false, 'withdraw' => false]]],
            'child' => [
                'first_name' => 'Kamsi', 'last_name' => 'Okafor', 'age_band' => '6_9',
                'allowance' => ['amount' => '3000', 'frequency' => 'weekly', 'starts_on' => '2026-11-02', 'from_wallet_id' => $main->id, 'notify' => true],
                'controls' => ['daily_limit' => '1500', 'shops' => true, 'friends' => false, 'online' => false, 'cash' => false],
                'requests' => ['auto_limit' => '2000', 'auto_per_week' => 3, 'expiry_hours' => 24, 'reason_required' => true],
                'goal' => ['name' => 'New bicycle', 'amount' => '25000', 'save_percent' => 20, 'match_percent' => 50, 'match_wallet_id' => $main->id],
                'phone' => ['mode' => 'own', 'code' => $code],
                'coparent' => ['approve' => true, 'change' => true, 'see' => true],
                'gifts' => true,
            ],
        ])->assertCreated()->json('data.wallet.id');
        foreach ([$emeka, $ada] as $who) {
            $this->withoutToken();
        Sanctum::actingAs($who);
            $this->postJson('/api/v1/invitations/' . WalletInvitation::where('wallet_id', $id)->where('invitee_user_id', $who->id)->value('id') . '/accept')->assertOk();
        }

        return [Wallet::find($id), $ngozi, $main, $emeka, $ada, $adaMain, $code];
    }

    /** INV-CH2 → INV-CH3 → INV-CH4: the child's phone asks, a parent says yes, the child sets a PIN. */
    private function pair(string $code, User $parent, string $pin = '4821', string $device = "Kamsi's tablet")
    {
        $this->withoutToken();
        $start = $this->postJson('/api/v1/children/link/start', ['code' => $code, 'device_name' => $device])->assertCreated();
        Sanctum::actingAs($parent);
        $this->postJson('/api/v1/child-link-requests/' . $start->json('data.request_id') . '/approve')->assertOk();
        $this->withoutToken();

        return $this->postJson('/api/v1/children/link', ['code' => $code, 'pin' => $pin, 'device_name' => $device, 'request_id' => $start->json('data.request_id'), 'secret' => $start->json('data.secret')]);
    }

    public function test_the_childs_phone_links_with_the_code_and_stays_in_the_child_app(): void
    {
        [$wallet, $ngozi, , , , , $code] = $this->kamsi();

        // A wrong code, a weak PIN.
        $this->postJson('/api/v1/children/link/start', ['code' => 'KMS-0000'])->assertStatus(422)->assertJsonValidationErrors('code');
        $this->postJson('/api/v1/children/link', ['code' => $code, 'pin' => '1234', 'request_id' => 1, 'secret' => 'x'])->assertStatus(422);

        // INV-CH3: no PIN before a parent says yes on their phone.
        $start = $this->postJson('/api/v1/children/link/start', ['code' => $code, 'device_name' => 'Tecno Spark 20'])->assertCreated()
            ->assertJsonPath('data.child', 'Kamsi')->assertJsonPath('data.parents', ['Ngozi', 'Emeka']);
        $pairing = ['code' => $code, 'pin' => '4821', 'request_id' => $start->json('data.request_id'), 'secret' => $start->json('data.secret')];
        $this->postJson('/api/v1/children/link', $pairing)->assertStatus(422)->assertJsonValidationErrors('code');
        $this->getJson('/api/v1/children/link/' . $pairing['request_id'] . '?secret=' . $pairing['secret'])->assertOk()->assertJsonPath('data.status', 'pending');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'child_link_request', 'title' => 'Link this phone to Kamsi?']);
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/child-link-requests/' . $pairing['request_id'])->assertOk()
            ->assertJsonPath('data.request.device', 'Tecno Spark 20')->assertJsonPath('data.request.will_see', 'Balance, goal, tasks, asking for money');
        $this->postJson('/api/v1/child-link-requests/' . $pairing['request_id'] . '/approve')->assertOk();
        $this->withoutToken();
        $this->getJson('/api/v1/children/link/' . $pairing['request_id'] . '?secret=' . $pairing['secret'])->assertJsonPath('data.status', 'approved');

        $res = $this->postJson('/api/v1/children/link', ['device_name' => "Kamsi's tablet"] + array_merge($pairing, ['code' => strtolower($code)]))->assertCreated()
            ->assertJsonPath('data.user.first_name', 'Kamsi')->assertJsonPath('data.user.role', 'child')->assertJsonPath('data.wallet_id', $wallet->id)
            // INV-CH5 "Mum sends ₦3,000 every Monday, and you're saving for a new bicycle".
            ->assertJsonPath('data.welcome.allowance', 'Ngozi sends ₦3,000 every Monday')
            ->assertJsonPath('data.welcome.goal.name', 'New bicycle')
            ->assertJsonPath('data.welcome.goal.match', 'Ngozi adds ₦1 for every ₦2');
        $token = $res->json('data.token');
        $this->assertSame('child', $wallet->fresh()->roleOf(User::where('role', 'child')->sole()));
        $this->assertTrue($wallet->fresh()->meta['child']['phone']['linked']);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $ngozi->id, 'type' => 'child_linked', 'title' => "Kamsi's phone is linked"]);

        // The code is used up; the child's sign-in reaches only the child app.
        $this->postJson('/api/v1/children/link/start', ['code' => $code])->assertStatus(422);
        $this->postJson('/api/v1/children/link', $pairing)->assertStatus(422);
        $this->kid($token)->getJson('/api/v1/child/home')->assertOk()->assertJsonPath('data.first_name', 'Kamsi');
        $this->kid($token)->getJson('/api/v1/wallets')->assertForbidden()->assertJsonPath('data.code', 'child_account');
        $this->kid($token)->postJson('/api/v1/transfers', [])->assertForbidden();
        $this->kid($token)->getJson('/api/v1/auth/me')->assertOk();
        // SYS-05 the app lock on the child's phone unlocks with the child's PIN.
        $this->kid($token)->postJson('/api/v1/profile/verify-pin', ['pin' => '4821'])->assertOk();

        // A new phone later: a new code, the same child, the old phone signed out.
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $new = $this->postJson("/api/v1/wallets/{$wallet->id}/child/link-code")->json('data.code');
        $this->pair($new, $ngozi, '7392')->assertCreated();
        $this->assertSame(1, User::where('role', 'child')->count());
        $this->assertSame(1, User::where('role', 'child')->sole()->tokens()->count());

        // "This isn't Kamsi": the code stops working.
        Sanctum::actingAs($ngozi);
        $stranger = $this->postJson("/api/v1/wallets/{$wallet->id}/child/link-code")->json('data.code');
        $this->withoutToken();
        $ask = $this->postJson('/api/v1/children/link/start', ['code' => $stranger, 'device_name' => 'Unknown phone'])->assertCreated();
        Sanctum::actingAs($emeka = User::where('first_name', 'Emeka')->first());
        $this->postJson('/api/v1/child-link-requests/' . $ask->json('data.request_id') . '/deny')->assertOk()->assertJsonPath('data.status', 'denied');
        $this->withoutToken();
        $this->postJson('/api/v1/children/link/start', ['code' => $stranger])->assertStatus(422);

        // Codes expire after 10 minutes.
        Sanctum::actingAs($ngozi);
        $late = $this->postJson("/api/v1/wallets/{$wallet->id}/child/link-code")->json('data.code');
        Carbon::setTestNow(now()->addMinutes(11));
        $this->withoutToken();
        $this->postJson('/api/v1/children/link/start', ['code' => $late])->assertStatus(422);
    }

    public function test_the_child_asks_saves_and_parents_answer(): void
    {
        [$wallet, $ngozi, , $emeka, $ada] = $this->kamsi();
        $wallet->update(['balance' => 1_000_000]);
        $token = $this->pair($wallet->meta['child']['phone']['code'], $ngozi)->json('data.token');
        $bank = ['kind' => 'bank', 'bank_code' => '058', 'account_number' => '0123456789', 'account_name' => 'OLA STORES', 'bank_name' => 'GTBank'];

        // CHD-03: "You can spend ₦1,500 today".
        $this->kid($token)->getJson('/api/v1/child/home')->assertOk()
            ->assertJsonPath('data.wallet.balance', '10000.00')->assertJsonPath('data.spend_today', '1500.00')->assertJsonPath('data.goal.name', 'New bicycle')->assertJsonPath('data.parents', ['Ngozi', 'Emeka']);

        // CHD-04: small → straight through; bigger → a parent.
        $this->kid($token)->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '1000', 'pin' => '4821', 'description' => 'Snacks after football', 'category' => 'food', 'destination' => $bank])
            ->assertOk()->assertJsonPath('data.pending_approval', false);
        $this->kid($token)->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", ['amount' => '2500', 'pin' => '4821', 'description' => 'A storybook', 'category' => 'school', 'destination' => $bank])
            ->assertOk()->assertJsonPath('data.pending_approval', true);

        // WPV-04: Emeka sees "Kamsi asked ₦2,500 for a storybook · Over ₦2,000 · needs you or Ngozi".
        $this->withoutToken();
        Sanctum::actingAs($emeka);
        $view = $this->getJson("/api/v1/wallets/{$wallet->id}/child")->assertOk()->assertJsonPath('data.role', 'coparent')
            ->assertJsonPath('data.asks.0.title', 'A storybook')->assertJsonPath('data.asks.0.category', 'school')->assertJsonPath('data.asks.0.needs', 'Over ₦2,000 · needs you or Ngozi')
            ->assertJsonPath('data.spent_this_week', '1000.00')->json('data');
        $this->postJson("/api/v1/approvals/{$view['asks'][0]['id']}/respond", ['decision' => 'approve', 'pin' => '1234', 'note' => 'Enjoy it!'])->assertOk();

        // CHD-05: yes by Emeka, with what he said; the small one, automatically.
        $requests = $this->kid($token)->getJson('/api/v1/child/requests')->assertOk()->json('data.requests');
        $this->assertSame(['yes', 'yes'], array_column($requests, 'status'));
        $this->assertSame('Emeka', $requests[0]['by']);
        $this->assertSame('Enjoy it!', $requests[0]['said']);
        $this->assertTrue($requests[1]['auto']);

        // CHD-06 "Add to my goal" with the child's PIN.
        $this->kid($token)->postJson('/api/v1/child/goal', ['amount' => '500', 'pin' => '0000'])->assertStatus(422);
        $this->kid($token)->postJson('/api/v1/child/goal', ['amount' => '500', 'pin' => '4821'])->assertOk()->assertJsonPath('data.goal.you_saved', '500.00')->assertJsonPath('data.goal.saved', '500.00');

        // WPV-05: Aunty Ada sees the goal, not the balance or spending; she can add to the bike and leave a note.
        $this->withoutToken();
        Sanctum::actingAs($ada);
        $this->getJson("/api/v1/wallets/{$wallet->id}")->assertOk()->assertJsonPath('data.wallet.balance', null)->assertJsonPath('data.recent_transactions', []);
        $this->getJson("/api/v1/wallets/{$wallet->id}/transactions")->assertForbidden();
        $this->assertNull(collect($this->getJson('/api/v1/wallets')->json('data.wallets'))->firstWhere('id', $wallet->id)['balance']);
        $this->getJson("/api/v1/wallets/{$wallet->id}/child")->assertOk()->assertJsonPath('data.role', 'relative')->assertJsonPath('data.goal.saved', '500.00')->assertJsonMissingPath('data.balance')->assertJsonMissingPath('data.asks');
        $goalId = $wallet->fresh()->meta['child']['goal_wallet_id'];
        $adaMain = $ada->mainWallet();
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $adaMain->id, 'amount' => '2000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $goalId]])->assertOk();
        $this->assertSame(250_000, Wallet::find($goalId)->balance);
        $child = User::where('role', 'child')->sole();
        $this->assertDatabaseHas('app_notifications', ['user_id' => $child->id, 'type' => 'child_gift', 'title' => 'Ada sent you ₦2,000']);
        $this->postJson("/api/v1/wallets/{$wallet->id}/child/note", ['message' => 'Well done, Kamsi!'])->assertOk();
        $this->kid($token)->getJson('/api/v1/child/home')->assertJsonPath('data.notes.0.from', 'Ada')->assertJsonPath('data.goal.others_added', '2000.00');
        // A relative can't change limits; a parent can.
        $this->withoutToken();
        Sanctum::actingAs($ada);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/child", ['daily_limit' => '5000'])->assertNotFound();
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/child", ['daily_limit' => '2000', 'allowance' => '4000', 'friends' => true])->assertOk()
            ->assertJsonPath('data.daily_limit', '2000.00')->assertJsonPath('data.allowance.amount', '4000.00')->assertJsonPath('data.controls.friends', true);
        $this->assertSame(400_000, AutomationRule::where('to_wallet_id', $wallet->id)->where('name', "Kamsi's pocket money")->value('amount'));
    }

    public function test_tasks_are_set_done_with_a_photo_checked_and_paid(): void
    {
        [$wallet, $ngozi, $main, $emeka] = $this->kamsi();
        $token = $this->pair($wallet->meta['child']['phone']['code'], $ngozi)->json('data.token');

        // CHD-12 "New task for Kamsi".
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $id = $this->postJson("/api/v1/wallets/{$wallet->id}/tasks", ['title' => 'Wash the car', 'reward' => '1000', 'due_on' => '2026-10-31', 'repeat_weekly' => true, 'needs_photo' => true])->assertCreated()->json('data.id');
        $child = User::where('role', 'child')->sole();
        $this->assertDatabaseHas('app_notifications', ['user_id' => $child->id, 'type' => 'child_task', 'title' => 'New task: Wash the car']);

        // CHD-07: done needs a photo.
        $this->kid($token)->postJson("/api/v1/tasks/{$id}/done")->assertStatus(422);
        $this->kid($token)->post("/api/v1/tasks/{$id}/done", ['photo' => UploadedFile::fake()->image('car.jpg')], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.tasks.0.status', 'submitted');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $emeka->id, 'type' => 'child_task_done']);

        // The parent sees the photo, sends it back once, then pays.
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $list = $this->getJson("/api/v1/wallets/{$wallet->id}/tasks")->assertOk()->json('data.tasks');
        $this->get($list[0]['photo_url'])->assertOk();
        $this->postJson("/api/v1/tasks/{$id}/send-back", ['note' => 'The windows too, please'])->assertOk();
        $this->kid($token)->getJson('/api/v1/child/tasks')->assertJsonPath('data.tasks.0.note', 'The windows too, please')->assertJsonPath('data.tasks.0.status', 'todo');
        $this->kid($token)->post("/api/v1/tasks/{$id}/done", ['photo' => UploadedFile::fake()->image('car2.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->withoutToken();
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/tasks/{$id}/approve")->assertStatus(422); // Emeka's Main has nothing
        $this->withoutToken();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/tasks/{$id}/approve", ['from_wallet_id' => $main->id])->assertOk();
        $this->assertSame(100_000, $wallet->fresh()->balance);
        $this->assertSame('paid', ChildTask::find($id)->status);
        $this->postJson("/api/v1/tasks/{$id}/approve")->assertStatus(422); // never twice
        // Weekly: next week's comes back; the streak counts this week.
        $this->assertSame('2026-11-07', ChildTask::where('status', 'todo')->sole()->due_on->toDateString());
        $this->kid($token)->getJson('/api/v1/child/tasks')->assertJsonPath('data.streak', 1);
        $this->kid($token)->getJson('/api/v1/child/home')->assertJsonPath('data.tasks_open', 1);
        $this->assertDatabaseHas('app_notifications', ['user_id' => $child->id, 'type' => 'child_task_paid', 'title' => '+₦1,000 for Wash the car']);
        // A child can't set or pay tasks.
        $this->kid($token)->postJson("/api/v1/wallets/{$wallet->id}/tasks", ['title' => 'x', 'reward' => '9000'])->assertForbidden();
    }
}
