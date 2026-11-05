<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * INV-C1/C2 joining a goal as a contributor: "How will you add money?" and
 * "Contribute every month" — even when the goal has no savings plan of its
 * own, the amount and day chosen start a monthly save from the person's wallet.
 */
class ContributorJoinTest extends TestCase
{
    use RefreshDatabase;

    private function invite(): array
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $chidi = User::factory()->create(['first_name' => 'Chidi', 'last_name' => 'Eze', 'kyc_tier' => 0]);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0, 'target_amount' => 850_000_00, 'target_date' => '2027-01-08']);
        WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);
        $main = Wallet::create(['user_id' => $chidi->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 100_000_00]);
        $invite = WalletInvitation::create(['wallet_id' => $fees->id, 'inviter_id' => $ngozi->id, 'invitee_user_id' => $chidi->id, 'invitee_identifier' => $chidi->phone, 'role' => 'contributor', 'status' => 'pending', 'token' => 'tok-c1', 'expires_at' => now()->addDays(3)]);

        return [$ngozi, $chidi, $fees, $main, $invite];
    }

    public function test_contribute_every_month_into_a_goal_without_a_plan(): void
    {
        [$ngozi, $chidi, $fees, $main, $invite] = $this->invite();
        Sanctum::actingAs($chidi);

        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $main->id, 'amount' => '25000', 'frequency' => 'monthly', 'day_of_month' => 5])
            ->assertOk()->assertJsonPath('data.member.role', 'contributor');
        $rule = AutomationRule::where('user_id', $chidi->id)->where('to_wallet_id', $fees->id)->sole();
        $this->assertSame([$main->id, 25_000_00, 'monthly', 5, true], [$rule->from_wallet_id, $rule->amount, $rule->frequency, $rule->day_of_month, (bool) $rule->savings_contribution]);
        $this->assertSame('Monthly into School fees 2027', $rule->name);
    }

    public function test_joining_without_a_monthly_save_or_from_someone_elses_wallet(): void
    {
        [$ngozi, $chidi, $fees, $main, $invite] = $this->invite();
        Sanctum::actingAs($chidi);

        // Someone else's wallet: nothing happens, the invite stays open.
        $ngoziMain = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $ngoziMain->id, 'amount' => '25000'])->assertStatus(422);
        $this->assertSame('pending', $invite->refresh()->status);
        // An amount is needed for a monthly save.
        $this->postJson("/api/v1/invitations/{$invite->id}/accept", ['source_wallet_id' => $main->id])->assertStatus(422)->assertJsonValidationErrors('amount');

        // Bank transfer, no monthly save: just joins.
        $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertOk();
        $this->assertSame('accepted', $invite->refresh()->status);
        $this->assertSame(0, AutomationRule::where('user_id', $chidi->id)->count());
    }
}
