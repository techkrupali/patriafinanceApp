<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Guided wallet creation from the client prototype (WCR-01 → 02 → 08 → 09 → 11
 * → 12): private or shared, members with roles, "when does money need a yes",
 * lock until the goal is reached, request expiry and the monthly save reminder.
 */
class WalletCreationFlowTest extends TestCase
{
    use RefreshDatabase;

    private function family(): array
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'phone' => '+2348034127790']);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'phone' => '+2348050000318']);
        $ada = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Eze', 'phone' => '+447700900123']);
        $tolu = User::factory()->create(['first_name' => 'Tolu', 'last_name' => 'Okafor', 'phone' => '+2348030000113']);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 50_000_000]);

        return [$ngozi, $emeka, $ada, $tolu, $main];
    }

    private function sharedGoal(User $emeka, User $ada, array $approval = []): array
    {
        return [
            'type' => 'goal',
            'name' => 'School fees 2027',
            'mode' => 'shared',
            'target_amount' => '850000',
            'target_date' => now()->addMonths(3)->toDateString(),
            'members' => [
                ['user_id' => $emeka->id, 'role' => 'co_owner'],
                ['identifier' => '0700 900 123', 'role' => 'contributor'],
                ['identifier' => '08011112222', 'role' => 'viewer'],
            ],
            'approval' => $approval + ['threshold' => '50000', 'mode' => 'all', 'lock_until_goal' => true, 'expiry_hours' => 72],
            'reminder_day' => 25,
        ];
    }

    /** Join a wallet as if the invitation was accepted. */
    private function join(Wallet $wallet, User $user, string $role): void
    {
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $user->id, 'role' => $role, 'status' => 'active']);
    }

    public function test_shared_goal_saves_mode_members_approvals_and_reminder(): void
    {
        [$ngozi, $emeka, $ada] = $this->family();
        Sanctum::actingAs($ngozi);

        $payload = $this->sharedGoal($emeka, $ada);
        $payload['members'][1]['identifier'] = '+447700900123'; // Ada, by phone

        $res = $this->postJson('/api/v1/wallets', $payload)
            ->assertCreated()
            ->assertJsonPath('data.wallet.mode', 'shared')
            ->assertJsonPath('data.wallet.approval_enabled', true)
            ->assertJsonPath('data.wallet.approval_threshold', '50000.00')
            ->assertJsonPath('data.wallet.approval_mode', 'all')
            ->assertJsonPath('data.wallet.lock_until_goal', true)
            ->assertJsonPath('data.wallet.goal_locked', true)
            ->assertJsonPath('data.wallet.approval_expiry_hours', 72)
            ->assertJsonPath('data.wallet.reminder_day', 25);

        $wallet = Wallet::find($res->json('data.wallet.id'));
        $invites = WalletInvitation::where('wallet_id', $wallet->id)->get()->keyBy('role');
        $this->assertCount(3, $invites);
        $this->assertSame($emeka->id, $invites['co_owner']->invitee_user_id);
        // A phone number that belongs to an account invites that account.
        $this->assertSame($ada->id, $invites['contributor']->invitee_user_id);
        // Someone new: local format stored as E.164, told by SMS when they sign up.
        $this->assertNull($invites['viewer']->invitee_user_id);
        $this->assertSame('+2348011112222', $invites['viewer']->invitee_identifier);

        // Each existing person hears about it once.
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'invitation_received')->count());
        $this->assertSame(1, AppNotification::where('user_id', $ada->id)->where('type', 'invitation_received')->count());
    }

    public function test_private_wallets_have_no_members_and_lock_needs_a_target(): void
    {
        [$ngozi, $emeka] = $this->family();
        Sanctum::actingAs($ngozi);

        $this->postJson('/api/v1/wallets', [
            'type' => 'goal', 'name' => 'Car', 'mode' => 'private', 'target_amount' => '2500000',
            'members' => [['user_id' => $emeka->id, 'role' => 'contributor']],
        ])->assertStatus(422);

        $this->postJson('/api/v1/wallets', [
            'type' => 'goal', 'name' => 'Car', 'mode' => 'shared',
            'approval' => ['mode' => 'any', 'lock_until_goal' => true],
        ])->assertStatus(422);

        $this->postJson('/api/v1/wallets', ['type' => 'goal', 'name' => 'Car', 'mode' => 'private', 'target_amount' => '2500000'])
            ->assertCreated()
            ->assertJsonPath('data.wallet.mode', 'private')
            ->assertJsonPath('data.wallet.approval_enabled', false);
        $this->assertSame(0, WalletInvitation::count());
    }

    public function test_a_bad_member_rolls_the_whole_wallet_back(): void
    {
        [$ngozi, $emeka] = $this->family();
        Sanctum::actingAs($ngozi);

        $this->postJson('/api/v1/wallets', [
            'type' => 'goal', 'name' => 'Fees', 'mode' => 'shared', 'target_amount' => '1000',
            'members' => [
                ['user_id' => $emeka->id, 'role' => 'co_owner'],
                ['identifier' => '08050000318', 'role' => 'contributor'], // Emeka again, by phone
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('members.1');

        $this->assertSame(0, Wallet::where('type', 'goal')->count());
        $this->assertSame(0, WalletInvitation::count());
    }

    public function test_who_decides_sets_how_many_yeses_a_spend_needs(): void
    {
        [$ngozi, $emeka, $ada, $tolu] = $this->family();
        $wallet = Wallet::create([
            'user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 0,
            'approval_enabled' => true, 'required_approvals' => 1,
        ]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'co_owner');
        $this->join($wallet, $tolu, 'co_owner');
        $this->join($wallet, $ada, 'contributor');

        $needs = function (string $mode, User $by) use ($wallet) {
            $wallet->update(['meta' => ['approval_mode' => $mode]]);

            return $wallet->fresh()->requiredApprovalsFor($by);
        };

        // Three approvers: Ngozi, Emeka, Tolu.
        $this->assertSame(1, $needs('any', $ngozi));
        $this->assertSame(2, $needs('all', $ngozi));      // the other two
        $this->assertSame(3, $needs('all', $ada));        // a contributor's request needs all three
        $this->assertSame(1, $needs('majority', $ngozi)); // 2 of 3, Ngozi's own request counts
        $this->assertSame(2, $needs('majority', $ada));

        // No rule: the fixed count, as before.
        $wallet->update(['meta' => null, 'required_approvals' => 2]);
        $this->assertSame(2, $wallet->fresh()->requiredApprovalsFor($ngozi));
    }

    public function test_locked_goal_needs_everyone_until_reached_and_requests_use_the_expiry(): void
    {
        [$ngozi, $emeka, , , $main] = $this->family();
        $wallet = Wallet::create([
            'user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 40_000_00,
            'target_amount' => 100_000_00, 'approval_enabled' => true, 'approval_threshold' => 50_000_00,
            'required_approvals' => 1,
            'meta' => ['approval_mode' => 'any', 'lock_until_goal' => true, 'approval_expiry_hours' => 24],
        ]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'co_owner');

        // ₦1,000 is under the ₦50,000 threshold, but the goal isn't reached yet.
        $this->assertTrue($wallet->approvalRequiredFor(1_000_00));

        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $wallet->id,
            'amount' => '1000',
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $main->id],
        ])->assertOk();

        $request = ApprovalRequest::where('wallet_id', $wallet->id)->sole();
        $this->assertSame(1, $request->required_approvals); // everyone else = Emeka
        $this->assertEqualsWithDelta(now()->addHours(24)->timestamp, $request->expires_at->timestamp, 5);

        // Reached: small spends go straight through again.
        $wallet->update(['balance' => 100_000_00]);
        $this->assertFalse($wallet->fresh()->isGoalLocked());
        $this->assertFalse($wallet->fresh()->approvalRequiredFor(1_000_00));
    }

    public function test_rule_changes_wait_for_the_other_owners_yes(): void
    {
        [$ngozi, $emeka] = $this->family();
        $wallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 0, 'approval_enabled' => true]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'co_owner');
        Sanctum::actingAs($ngozi);

        // WAL-08: the reminder isn't a rule and applies now; who decides waits for Emeka.
        $id = $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_mode' => 'majority', 'approval_expiry_hours' => 72, 'reminder_day' => 1])
            ->assertOk()
            ->assertJsonPath('data.wallet.approval_mode', null)
            ->assertJsonPath('data.wallet.reminder_day', 1)
            ->assertJsonPath('data.pending_change.action', 'rule_change')
            ->assertJsonPath('data.pending_change.approver_names.0', 'Emeka')
            ->json('data.pending_change.id');
        $this->getJson("/api/v1/wallets/{$wallet->id}")->assertJsonPath('data.governance.others.0', 'Emeka')
            ->assertJsonPath('data.governance.pending_change.id', $id);
        // One change waits at a time, and a lock needs a target.
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_threshold' => 50000])->assertStatus(422);
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['lock_until_goal' => true])->assertStatus(422);
        // Only Emeka is asked.
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertStatus(422);

        Sanctum::actingAs($emeka);
        $this->getJson('/api/v1/approvals?scope=to_me')->assertJsonPath('data.approvals.0.id', $id)->assertJsonPath('data.approvals.0.governance', true);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk()->assertJsonPath('data.approval.status', 'executed');
        $this->assertSame('majority', $wallet->fresh()->approvalMode());
        $this->assertSame(72, $wallet->fresh()->approvalExpiryHours());

        // A co-owner can ask too; the owner says yes. A fixed count clears the rule.
        $id = $this->patchJson("/api/v1/wallets/{$wallet->id}", ['required_approvals' => 1])->assertOk()
            ->assertJsonPath('data.pending_change.approver_names.0', 'Ngozi')->json('data.pending_change.id');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk();
        $this->assertNull($wallet->fresh()->approvalMode());

        // WAL-14: "Emeka changed the yeses needed … Ngozi approved".
        $this->getJson("/api/v1/wallets/{$wallet->id}/audit-log?category=rules")
            ->assertOk()
            ->assertJsonPath('data.audit_log.0.title', 'Emeka changed who decides')
            ->assertJsonPath('data.audit_log.0.detail', 'From most approvers to a fixed number of yeses · Ngozi approved');
    }

    public function test_named_people_decide_and_only_they_are_asked(): void
    {
        [$ngozi, $emeka, $ada, $tolu, $main] = $this->family();
        $wallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 100_000_00, 'approval_enabled' => true, 'approval_threshold' => 5_000_000]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'contributor');
        WalletMember::where('wallet_id', $wallet->id)->where('user_id', $emeka->id)->update(['can_approve' => true]);
        $this->join($wallet, $ada, 'contributor');
        WalletMember::where('wallet_id', $wallet->id)->where('user_id', $ada->id)->update(['can_approve' => true]);
        Sanctum::actingAs($ngozi);

        // Ada can't approve alone, and one name isn't enough.
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_mode' => 'named', 'approver_ids' => [$ngozi->id]])->assertStatus(422);
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_mode' => 'named', 'approver_ids' => [$ngozi->id, $tolu->id]])->assertStatus(422);
        // Alone as owner, it applies now.
        $this->patchJson("/api/v1/wallets/{$wallet->id}", ['approval_mode' => 'named', 'approver_ids' => [$ngozi->id, $emeka->id]])
            ->assertOk()->assertJsonPath('data.pending_change', null)
            ->assertJsonPath('data.wallet.approval_mode', 'named');

        $wallet->refresh();
        $this->assertSame([$ngozi->id, $emeka->id], $wallet->eligibleApprovers()->all());
        // Ada asks: Ngozi and Emeka, both.
        $this->assertSame(2, $wallet->requiredApprovalsFor($ada));
        // Ngozi asks: she is the first yes, Emeka is the second.
        $this->assertSame(1, $wallet->requiredApprovalsFor($ngozi));
    }

    public function test_reminder_goes_to_savers_once_on_the_day(): void
    {
        [$ngozi, $emeka, $ada, $tolu] = $this->family();
        Carbon::setTestNow(Carbon::create(2026, 10, 25, 9));
        $wallet = Wallet::create([
            'user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0,
            'target_amount' => 850_000_00, 'target_date' => '2027-01-08', 'meta' => ['reminder_day' => 25],
        ]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'co_owner');
        $this->join($wallet, $ada, 'contributor');
        $this->join($wallet, $tolu, 'viewer');

        $this->artisan('wallets:remind-savers')->assertSuccessful();
        $this->artisan('wallets:remind-savers')->assertSuccessful();

        $sent = AppNotification::where('type', 'savings_reminder')->get();
        $this->assertEqualsCanonicalizing([$ngozi->id, $emeka->id, $ada->id], $sent->pluck('user_id')->all());
        // ₦850,000 over 3 months for 3 people: about ₦94,500 each.
        $this->assertSame('Add about ₦94,500 this month to reach ₦850,000 by 8 Jan.', $sent->first()->body);

        Carbon::setTestNow(Carbon::create(2026, 10, 26, 9));
        $this->artisan('wallets:remind-savers')->assertSuccessful();
        $this->assertSame(3, AppNotification::where('type', 'savings_reminder')->count());
        Carbon::setTestNow();
    }

    public function test_wallet_activity_says_who_moved_the_money(): void
    {
        [$ngozi, $emeka] = $this->family();
        $emekaMain = Wallet::create(['user_id' => $emeka->id, 'type' => 'main', 'name' => 'Main', 'balance' => 100_000_00]);
        $wallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 0]);
        $this->join($wallet, $ngozi, 'owner');
        $this->join($wallet, $emeka, 'contributor');

        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/transfers', [
            'from_wallet_id' => $emekaMain->id,
            'amount' => '40000',
            'pin' => '1234',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $wallet->id],
        ])->assertOk();

        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/wallets/{$wallet->id}/transactions")
            ->assertOk()
            ->assertJsonPath('data.transactions.0.direction', 'credit')
            ->assertJsonPath('data.transactions.0.by.first_name', 'Emeka');
    }
}
