<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Admin panel data for the phone-first onboarding and the new tabs: how
 * customers signed up, their language and "what brings you", their rules and
 * pending invites, and whether SMS / the AI assistant are configured.
 */
class AdminOnboardingDataTest extends TestCase
{
    use RefreshDatabase;

    private function phoneCustomer(array $extra = []): User
    {
        $u = User::factory()->create(['password' => null, 'pin' => Hash::make('482915'), 'pin_length' => 6, ...$extra]);
        $u->forceFill(['phone_verified_at' => now()])->save();

        return $u;
    }

    public function test_stats_show_signups_languages_purposes_rules_invites_and_system(): void
    {
        config(['services.termii.api_key' => null, 'services.anthropic.api_key' => 'k']);
        $ngozi = $this->phoneCustomer(['language' => 'pcm', 'onboarding_purposes' => ['household', 'school_goals']]);
        $this->phoneCustomer(['onboarding_purposes' => ['household']]);
        User::factory()->create(['password' => 'password123']); // older email + password account
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'Fees', 'balance' => 0]);
        AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Save', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 100, 'frequency' => 'daily', 'enabled' => true]);
        AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Old', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 100, 'frequency' => 'daily', 'enabled' => false]);
        WalletInvitation::create(['wallet_id' => $fees->id, 'inviter_id' => $ngozi->id, 'invitee_identifier' => '+2348011112222', 'role' => 'contributor', 'status' => 'pending', 'token' => 't1', 'expires_at' => now()->addDays(3)]);
        WalletInvitation::create(['wallet_id' => $fees->id, 'inviter_id' => $ngozi->id, 'invitee_identifier' => '+2348011113333', 'role' => 'contributor', 'status' => 'pending', 'token' => 't2', 'expires_at' => now()->subDay()]);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson('/api/v1/admin/stats')
            ->assertOk()
            ->assertJsonPath('data.signups.phone', 2)
            ->assertJsonPath('data.signups.password', 1)
            ->assertJsonPath('data.signups.languages', ['en' => 2, 'pcm' => 1])
            ->assertJsonPath('data.signups.purposes.household', 2)
            ->assertJsonPath('data.signups.purposes.school_goals', 1)
            ->assertJsonPath('data.signups.purposes.vendor', 0)
            ->assertJsonPath('data.signups.answered_purposes', 2)
            ->assertJsonPath('data.rules', ['active' => 1, 'paused' => 1])
            ->assertJsonPath('data.invitations.pending', 1)
            ->assertJsonPath('data.system', ['sms_configured' => false, 'ai_configured' => true]);
    }

    public function test_users_filter_by_signup_and_detail_carries_rules_and_invites(): void
    {
        $ngozi = $this->phoneCustomer(['first_name' => 'Ngozi', 'date_of_birth' => '1988-03-14', 'onboarding_purposes' => ['ajo']]);
        $old = User::factory()->create(['password' => 'password123']);
        $emeka = User::factory()->create();
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees', 'balance' => 0]);
        $emekas = Wallet::create(['user_id' => $emeka->id, 'type' => 'joint', 'name' => 'Joint', 'balance' => 0]);
        AutomationRule::create(['user_id' => $ngozi->id, 'name' => 'Save', 'from_wallet_id' => $main->id, 'to_wallet_id' => $fees->id, 'amount' => 4_500_000, 'frequency' => 'daily', 'enabled' => true]);
        WalletInvitation::create(['wallet_id' => $fees->id, 'inviter_id' => $ngozi->id, 'invitee_identifier' => '+2348011112222', 'role' => 'contributor', 'status' => 'pending', 'token' => 't1', 'expires_at' => now()->addDays(3)]);
        WalletInvitation::create(['wallet_id' => $emekas->id, 'inviter_id' => $emeka->id, 'invitee_user_id' => $ngozi->id, 'invitee_identifier' => $ngozi->phone, 'role' => 'co_owner', 'status' => 'pending', 'token' => 't2', 'expires_at' => now()->addDays(3)]);

        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $phoneOnly = collect($this->getJson('/api/v1/admin/users?signup=phone')->assertOk()->json('data.users'))->pluck('id');
        $this->assertTrue($phoneOnly->contains($ngozi->id));
        $this->assertFalse($phoneOnly->contains($old->id));
        $passwordOnly = collect($this->getJson('/api/v1/admin/users?signup=password')->json('data.users'))->pluck('id');
        $this->assertTrue($passwordOnly->contains($old->id));
        $this->assertFalse($passwordOnly->contains($ngozi->id));

        $detail = $this->getJson("/api/v1/admin/users/{$ngozi->id}")
            ->assertOk()
            ->assertJsonPath('data.user.has_password', false)
            ->assertJsonPath('data.user.pin_length', 6)
            ->assertJsonPath('data.user.date_of_birth', '1988-03-14')
            ->assertJsonPath('data.user.onboarding_purposes', ['ajo'])
            ->assertJsonPath('data.automations.0.name', 'Save')
            ->assertJsonPath('data.automations.0.from_wallet', 'Main')
            ->assertJsonPath('data.automations.0.to_wallet', 'School fees')
            ->assertJsonPath('data.automations.0.amount', '45000.00')
            ->assertJsonPath('data.automations.0.next_run_on', now()->toDateString())
            ->json('data.invitations');
        $this->assertEqualsCanonicalizing(['sent', 'received'], array_column($detail, 'direction'));
    }
}
