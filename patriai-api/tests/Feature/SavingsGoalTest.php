<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\SavingsMilestone;
use App\Models\SavingsPlan;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletDraft;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\AutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Savings Goals wallets + wallet drafts (client sheet "Savings Wallets",
 * 2026-10-18): target date, milestones, contributors invited with their own
 * permissions, one savings plan for everyone (incl. contributors' auto-save into
 * a wallet they don't own), contributor edit rights, and resumable drafts.
 */
class SavingsGoalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(); // the banking rails are never contacted
    }

    private function makeWallet(User $user, string $type, int $balanceKobo): Wallet
    {
        $wallet = Wallet::create(['user_id' => $user->id, 'type' => $type, 'name' => ucfirst($type) . ' Wallet', 'balance' => $balanceKobo]);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $wallet;
    }

    private function goalPayload(Wallet $source, array $extra = []): array
    {
        return array_merge([
            'type' => 'savings',
            'name' => 'New Car',
            'purpose' => 'big_purchase',
            'target_amount' => '1000',
            'target_date' => now()->addMonths(10)->toDateString(),
            'source_wallet_id' => $source->id,
            'savings_plan' => ['amount' => '50', 'frequency' => 'monthly', 'day_of_month' => 5, 'auto_save' => true],
        ], $extra);
    }

    /** Owner (with main wallet) creates a savings goal that invites $friend. */
    private function createGoal(User $friend, array $planExtra = [], array $permissions = []): array
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', 100_000);
        Sanctum::actingAs($owner);

        $res = $this->postJson('/api/v1/wallets', $this->goalPayload($main, [
            'savings_plan' => array_merge(['amount' => '50', 'frequency' => 'monthly', 'day_of_month' => 5, 'auto_save' => true], $planExtra),
            'contributors' => [['user_id' => $friend->id, 'permissions' => $permissions]],
        ]));
        $res->assertCreated();

        return [$owner, $main, Wallet::findOrFail($res->json('data.wallet.id'))];
    }

    // ---------------------------------------------------------------- creation

    public function test_savings_goal_setup_creates_plan_milestones_invites_and_owner_auto_save(): void
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', 100_000);
        $friend = User::factory()->create();
        $draft = WalletDraft::create(['user_id' => $owner->id, 'type' => 'savings', 'name' => 'New Car', 'step' => 4, 'total_steps' => 4, 'data' => []]);
        Sanctum::actingAs($owner);

        $res = $this->postJson('/api/v1/wallets', $this->goalPayload($main, [
            'initial_deposit' => '100',
            'draft_id' => $draft->id,
            'milestones' => [
                ['title' => 'Quarter way', 'amount' => '250'],
                ['title' => 'Halfway', 'amount' => '500', 'due_date' => now()->addMonths(5)->toDateString()],
            ],
            'contributors' => [[
                'user_id' => $friend->id,
                'can_approve' => true,
                'permissions' => ['view' => true, 'fund' => true, 'request' => false, 'withdraw' => false],
            ]],
        ]));

        $res->assertCreated()
            ->assertJsonPath('data.wallet.target_date', now()->addMonths(10)->toDateString())
            ->assertJsonPath('data.wallet.target_amount', '1000.00');
        $wallet = Wallet::findOrFail($res->json('data.wallet.id'));

        $this->assertSame(10_000, $wallet->balance);
        $this->assertSame(90_000, $main->refresh()->balance);

        $plan = SavingsPlan::where('wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame(5_000, $plan->amount);
        $this->assertSame(5, $plan->day_of_month);
        $this->assertFalse($plan->allow_contributor_edit);

        $this->assertSame(['Quarter way', 'Halfway'], SavingsMilestone::where('wallet_id', $wallet->id)->orderBy('position')->pluck('title')->all());

        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame($friend->id, $invite->invitee_user_id);
        $this->assertTrue($invite->can_approve);
        $this->assertFalse($invite->permissions['request']);
        $this->assertFalse($invite->permissions['can_spend']);

        $rule = AutomationRule::where('to_wallet_id', $wallet->id)->firstOrFail();
        $this->assertTrue($rule->savings_contribution);
        $this->assertSame($main->id, $rule->from_wallet_id);
        $this->assertSame(5_000, $rule->amount);

        $this->assertNull(WalletDraft::find($draft->id));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $friend->id, 'type' => 'invitation_received']);
    }

    public function test_savings_setup_validation_rolls_back(): void
    {
        $owner = User::factory()->create();
        $main = $this->makeWallet($owner, 'main', 100_000);
        Sanctum::actingAs($owner);

        // Savings fields on a non-savings wallet.
        $this->postJson('/api/v1/wallets', $this->goalPayload($main, ['type' => 'giving']))->assertStatus(422);
        // Target date in the past.
        $this->postJson('/api/v1/wallets', $this->goalPayload($main, ['target_date' => now()->subDay()->toDateString()]))
            ->assertStatus(422)->assertJsonValidationErrors('target_date');
        // Auto-save with no wallet to save from.
        $this->postJson('/api/v1/wallets', $this->goalPayload($main, ['source_wallet_id' => null]))
            ->assertStatus(422)->assertJsonValidationErrors('source_wallet_id');
        // Inviting yourself.
        $this->postJson('/api/v1/wallets', $this->goalPayload($main, ['contributors' => [['user_id' => $owner->id]]]))
            ->assertStatus(422)->assertJsonValidationErrors('contributors.0.user_id');
        // A milestone above the target.
        $this->postJson('/api/v1/wallets', $this->goalPayload($main, ['milestones' => [['title' => 'Too far', 'amount' => '5000']]]))
            ->assertStatus(422)->assertJsonValidationErrors('milestones.0.amount');

        $this->assertSame(0, Wallet::where('user_id', $owner->id)->where('type', 'savings')->count());
        $this->assertSame(0, SavingsPlan::count());
    }

    // ---------------------------------------------------------- contributors

    public function test_contributor_joins_with_permissions_and_auto_saves_into_owners_wallet(): void
    {
        $friend = User::factory()->create();
        $friendMain = $this->makeWallet($friend, 'main', 20_000);
        [$owner, , $wallet] = $this->createGoal($friend, [], ['request' => false]);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();

        Sanctum::actingAs($friend);
        $this->getJson('/api/v1/invitations')->assertOk()
            ->assertJsonPath('data.invitations.0.savings.amount', '50.00')
            ->assertJsonPath('data.invitations.0.permissions.request', false);

        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $friendMain->id])->assertOk();

        $member = WalletMember::where('wallet_id', $wallet->id)->where('user_id', $friend->id)->firstOrFail();
        $this->assertSame('contributor', $member->role);
        $this->assertFalse($member->permissions['request']);
        $this->assertTrue($member->permissions['fund']);
        $this->assertFalse($wallet->canSpend($friend));

        // The friend's rule pays from THEIR wallet into the OWNER's savings wallet.
        $rule = AutomationRule::where('user_id', $friend->id)->where('to_wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame($friendMain->id, $rule->from_wallet_id);
        $this->assertSame(5_000, $rule->amount);

        $result = AutomationService::make()->runRule($rule, now(), true);
        $this->assertSame('ran', $result['status']);
        $this->assertSame(15_000, $friendMain->refresh()->balance);
        $this->assertSame(5_000, $wallet->refresh()->balance);

        // Lose the fund permission → the rule stops paying in.
        $member->update(['permissions' => array_merge($member->permissions, ['fund' => false])]);
        $rule->update(['last_run_period' => null]);
        $this->assertSame('skipped', AutomationService::make()->runRule($rule, now(), true)['status']);
        $this->assertSame(5_000, $wallet->refresh()->balance);
    }

    public function test_accept_with_someone_elses_wallet_undoes_the_join(): void
    {
        $friend = User::factory()->create();
        [$owner, $ownerMain, $wallet] = $this->createGoal($friend);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();

        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $ownerMain->id])
            ->assertStatus(422)->assertJsonValidationErrors('source_wallet_id');

        $this->assertSame('pending', $invite->refresh()->status);
        $this->assertFalse(WalletMember::where('wallet_id', $wallet->id)->where('user_id', $friend->id)->exists());
    }

    public function test_contributor_edits_only_when_owner_allows_but_can_always_pause(): void
    {
        $friend = User::factory()->create();
        $friendMain = $this->makeWallet($friend, 'main', 0);
        [$owner, , $wallet] = $this->createGoal($friend);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();

        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $friendMain->id, 'amount' => '999'])->assertOk();
        // Not allowed to pick their own amount → the plan's amount applies.
        $rule = AutomationRule::where('user_id', $friend->id)->where('to_wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame(5_000, $rule->amount);

        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings/contribution", ['amount' => '20'])->assertStatus(422);
        // …nor through the generic automations screen.
        $this->patchJson("/api/v1/automations/{$rule->id}", ['amount' => '20'])->assertStatus(422);
        // Pausing debits from your own wallet is always allowed (both routes).
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings/contribution", ['enabled' => false])->assertOk()
            ->assertJsonPath('data.savings.me.auto_save.enabled', false);
        $this->patchJson("/api/v1/automations/{$rule->id}", ['enabled' => true])->assertOk();

        // The owner allows edits → the friend can change amount and frequency.
        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings", ['allow_contributor_edit' => true])->assertOk();
        Sanctum::actingAs($friend);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings/contribution", ['amount' => '20', 'frequency' => 'weekly', 'day_of_week' => 3])
            ->assertOk()
            ->assertJsonPath('data.savings.me.auto_save.amount', '20.00')
            ->assertJsonPath('data.savings.me.auto_save.frequency', 'weekly');
    }

    public function test_owner_plan_changes_apply_to_everyone_and_auto_save_off_pauses_all(): void
    {
        $friend = User::factory()->create();
        $friendMain = $this->makeWallet($friend, 'main', 0);
        [$owner, , $wallet] = $this->createGoal($friend);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();
        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $friendMain->id])->assertOk();

        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings", ['amount' => '75', 'frequency' => 'weekly', 'day_of_week' => 1])->assertOk();

        $rules = AutomationRule::where('to_wallet_id', $wallet->id)->get();
        $this->assertCount(2, $rules);
        foreach ($rules as $r) {
            $this->assertSame(7_500, $r->amount);
            $this->assertSame('weekly', $r->frequency);
            $this->assertSame(1, $r->day_of_week);
            $this->assertNull($r->day_of_month);
        }

        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings", ['auto_save' => false])->assertOk();
        $this->assertSame(0, AutomationRule::where('to_wallet_id', $wallet->id)->where('enabled', true)->count());

        // Contributors can't change the plan.
        Sanctum::actingAs($friend);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings", ['amount' => '1'])->assertStatus(422);
    }

    public function test_detail_shows_milestones_savers_and_projection(): void
    {
        $friend = User::factory()->create();
        [$owner, , $wallet] = $this->createGoal($friend);
        $wallet->update(['balance' => 30_000]); // ₦300 of ₦1,000

        $this->postJson("/api/v1/wallets/{$wallet->id}/savings/milestones", ['title' => 'Quarter', 'amount' => '250'])->assertCreated();
        $this->postJson("/api/v1/wallets/{$wallet->id}/savings/milestones", ['title' => 'Half', 'amount' => '500'])->assertCreated();

        $res = $this->getJson("/api/v1/wallets/{$wallet->id}/savings")->assertOk();
        $res->assertJsonPath('data.savings.progress', 30)
            ->assertJsonPath('data.savings.milestones.0.reached', true)
            ->assertJsonPath('data.savings.milestones.1.reached', false)
            ->assertJsonPath('data.savings.savers.0.status', 'owner')
            ->assertJsonPath('data.savings.savers.1.status', 'invited')
            ->assertJsonPath('data.savings.projection.per_month', '50.00')
            ->assertJsonPath('data.savings.me.can_edit_plan', true);
        // ₦700 left at ₦50/month lands ~14 months out — after the 10-month target date.
        $this->assertFalse($res->json('data.savings.projection.on_track'));
        $this->assertNotNull($res->json('data.savings.projection.suggested_amount'));

        $milestone = SavingsMilestone::where('wallet_id', $wallet->id)->where('title', 'Half')->firstOrFail();
        $this->deleteJson("/api/v1/wallets/{$wallet->id}/savings/milestones/{$milestone->id}")->assertOk();
        $this->assertSame(1, SavingsMilestone::where('wallet_id', $wallet->id)->count());

        // Outsiders see nothing.
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/wallets/{$wallet->id}/savings")->assertStatus(404);
    }

    // ---------------------------------------------------------------- drafts

    public function test_drafts_save_list_strip_secrets_and_stay_private(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/v1/wallet-drafts', [
            'type' => 'emergency',
            'name' => 'Medical',
            'step' => 2,
            'total_steps' => 2,
            'data' => ['stepOne' => ['name' => 'Medical'], 'rules' => ['reason' => 'Surgery', 'pin' => '1234', 'pinConfirm' => '1234']],
        ])->assertCreated()->json('data.draft.id');

        $this->assertSame(['reason' => 'Surgery'], WalletDraft::find($id)->data['rules']);

        $this->putJson("/api/v1/wallet-drafts/{$id}", ['step' => 1, 'name' => 'Medical Fund'])->assertOk()
            ->assertJsonPath('data.draft.name', 'Medical Fund');
        $this->getJson('/api/v1/wallet-drafts')->assertOk()->assertJsonPath('data.drafts.0.id', $id);

        Sanctum::actingAs(User::factory()->create());
        $this->putJson("/api/v1/wallet-drafts/{$id}", ['name' => 'Mine'])->assertStatus(404);
        $this->deleteJson("/api/v1/wallet-drafts/{$id}")->assertStatus(404);
        $this->getJson('/api/v1/wallet-drafts')->assertOk()->assertJsonCount(0, 'data.drafts');

        Sanctum::actingAs($user);
        $this->deleteJson("/api/v1/wallet-drafts/{$id}")->assertOk();
        $this->assertNull(WalletDraft::find($id));
    }

    // ------------------------------------------------- remaining sheet items

    public function test_contributor_can_join_without_auto_save_and_start_later_on_the_plan(): void
    {
        $friend = User::factory()->create();
        $friendMain = $this->makeWallet($friend, 'main', 0);
        [, , $wallet] = $this->createGoal($friend);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();

        // Join only — no wallet chosen, no auto-save yet.
        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertOk();
        $this->assertFalse(AutomationRule::where('user_id', $friend->id)->exists());
        $this->getJson("/api/v1/wallets/{$wallet->id}/savings")->assertOk()
            ->assertJsonPath('data.savings.me.can_start_auto_save', true)
            ->assertJsonPath('data.savings.me.auto_save', null);

        // Start later. Without the owner's permission to adjust, the plan's terms apply.
        $this->postJson("/api/v1/wallets/{$wallet->id}/savings/contribution", [
            'source_wallet_id' => $friendMain->id,
            'amount' => '999',
            'frequency' => 'daily',
        ])->assertCreated()
            ->assertJsonPath('data.savings.me.auto_save.amount', '50.00')
            ->assertJsonPath('data.savings.me.auto_save.frequency', 'monthly')
            ->assertJsonPath('data.savings.me.auto_save.day_of_month', 5);

        // Only one auto-save per person.
        $this->postJson("/api/v1/wallets/{$wallet->id}/savings/contribution", ['source_wallet_id' => $friendMain->id])->assertStatus(422);
    }

    public function test_owner_plan_change_keeps_a_contributors_own_amount(): void
    {
        $friend = User::factory()->create();
        $friendMain = $this->makeWallet($friend, 'main', 0);
        [$owner, , $wallet] = $this->createGoal($friend, ['allow_contributor_edit' => true]);
        $invite = WalletInvitation::where('wallet_id', $wallet->id)->firstOrFail();

        // The friend picks their own amount (allowed) but keeps the plan's schedule.
        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $friendMain->id, 'amount' => '20'])->assertOk();

        // The owner raises the amount and moves everyone to weekly.
        Sanctum::actingAs($owner);
        $this->patchJson("/api/v1/wallets/{$wallet->id}/savings", ['amount' => '80', 'frequency' => 'weekly', 'day_of_week' => 5])->assertOk();

        $friendRule = AutomationRule::where('user_id', $friend->id)->where('to_wallet_id', $wallet->id)->firstOrFail();
        $ownerRule = AutomationRule::where('user_id', $owner->id)->where('to_wallet_id', $wallet->id)->firstOrFail();
        $this->assertSame(2_000, $friendRule->amount);  // their own amount survives
        $this->assertSame('weekly', $friendRule->frequency); // the shared schedule applies to all
        $this->assertSame(5, $friendRule->day_of_week);
        $this->assertSame(8_000, $ownerRule->amount);
    }

    public function test_regular_invite_screen_carries_per_person_permissions(): void
    {
        $owner = User::factory()->create();
        $friend = User::factory()->create();
        $wallet = $this->makeWallet($owner, 'savings', 0);
        Sanctum::actingAs($owner);

        $invite = $this->postJson("/api/v1/wallets/{$wallet->id}/invitations", [
            'invitee_user_id' => $friend->id,
            'role' => 'contributor',
            'permissions' => ['view' => true, 'fund' => true, 'request' => false, 'withdraw' => true],
        ])->assertCreated()->json('data.invitation');
        $this->assertFalse($invite['permissions']['request']);

        Sanctum::actingAs($friend);
        $this->postJson("/api/v1/invitations/{$invite['id']}/accept")->assertOk();
        $member = WalletMember::where('wallet_id', $wallet->id)->where('user_id', $friend->id)->firstOrFail();
        $this->assertFalse($member->permissions['request']);
        $this->assertTrue($member->permissions['withdraw']);
        $this->assertTrue($wallet->canSpend($friend)); // withdraw mirrors the spend grant
    }

    public function test_any_wallet_type_created_from_a_draft_clears_it_and_drafts_are_capped(): void
    {
        $user = User::factory()->create();
        $main = $this->makeWallet($user, 'main', 10_000);
        Sanctum::actingAs($user);

        $draftId = $this->postJson('/api/v1/wallet-drafts', [
            'type' => 'giving', 'name' => 'Church', 'step' => 1, 'total_steps' => 1, 'data' => ['purpose' => 'tithe'],
        ])->assertCreated()->json('data.draft.id');
        $this->getJson('/api/v1/wallet-drafts')->assertJsonPath('data.drafts.0.data.purpose', 'tithe');

        $this->postJson('/api/v1/wallets', ['type' => 'giving', 'name' => 'Church', 'purpose' => 'tithe', 'draft_id' => $draftId])->assertCreated();
        $this->assertNull(WalletDraft::find($draftId));

        // Someone else's draft id is never deleted by your wallet creation.
        $other = WalletDraft::create(['user_id' => User::factory()->create()->id, 'type' => 'shared', 'step' => 1, 'total_steps' => 1, 'data' => []]);
        $this->postJson('/api/v1/wallets', ['type' => 'shared', 'name' => 'Home', 'draft_id' => $other->id])->assertCreated();
        $this->assertNotNull(WalletDraft::find($other->id));

        // No more than 20 unfinished setups.
        WalletDraft::insert(array_fill(0, 20, ['user_id' => $user->id, 'type' => 'savings', 'step' => 1, 'total_steps' => 4, 'created_at' => now(), 'updated_at' => now()]));
        $this->postJson('/api/v1/wallet-drafts', ['type' => 'savings'])->assertStatus(422);
        $this->assertNotNull($main);
    }
}
