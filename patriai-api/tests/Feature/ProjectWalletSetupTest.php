<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Project wallet from the client prototype (PRW-01…06): planned milestones
 * before the money is in, a builder from the directory, funders each month,
 * savings moved in now, both owners approving each payment, and 10% held back
 * until 3 months after handover.
 */
class ProjectWalletSetupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, int $mainKobo = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'kyc_tier' => 3]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return [$user, $main];
    }

    private function house(array $overrides = []): array
    {
        [$ngozi, $main] = $this->person('Ngozi', 500_000_000);
        [$emeka, $emekaMain] = $this->person('Emeka', 500_000_000);
        [$ada] = $this->person('Ada');
        [$builder] = $this->person('Adeyemi');
        $profile = VendorProfile::create(['user_id' => $builder->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'construction', 'location' => 'Enugu and Lagos', 'verified' => true]);
        $saved = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House Project', 'balance' => 120_000_000]);
        WalletMember::create(['wallet_id' => $saved->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);

        Sanctum::actingAs($ngozi);
        $payload = [
            'title' => 'Our house in Enugu',
            'kind' => 'building',
            'location' => 'Independence Layout, Enugu',
            'starts_on' => '2026-11-01',
            'finishes_on' => '2027-12-31',
            'budget' => '18500000',
            'buffer_percent' => 5,
            'milestones' => [
                ['title' => 'Foundation', 'description' => 'Setting out, excavation, footing, DPC', 'amount' => '3200000', 'starts_on' => '2026-11-01', 'ends_on' => '2026-12-31'],
                ['title' => 'Blockwork to lintel', 'amount' => '4100000', 'starts_on' => '2027-01-01', 'ends_on' => '2027-03-31'],
                ['title' => 'Roofing', 'amount' => '3600000'],
                ['title' => 'Plastering and windows', 'amount' => '3400000'],
                ['title' => 'Finishing', 'amount' => '4200000'],
            ],
            'vendor' => ['vendor_profile_id' => $profile->id],
            'my_monthly' => '700000',
            'source_wallet_id' => $main->id,
            'funders' => [
                ['user_id' => $emeka->id, 'role' => 'co_owner', 'amount' => '500000'],
                ['user_id' => $ada->id, 'role' => 'contributor', 'amount' => '250000'],
            ],
            'move_in_wallet_id' => $saved->id,
            'release' => ['photos' => true, 'video' => true, 'receipts' => false, 'approvers' => 'all', 'retention_percent' => 10, 'retention_months' => 3],
        ];
        // Lists are replaced whole.
        foreach (['milestones', 'funders'] as $list) {
            if (array_key_exists($list, $overrides)) {
                $payload[$list] = $overrides[$list];
                unset($overrides[$list]);
            }
        }
        $res = $this->postJson('/api/v1/projects', array_replace_recursive($payload, $overrides))->assertCreated()
            ->assertJsonPath('data.project.setup.kind', 'building')
            ->assertJsonPath('data.project.setup.release.retention_percent', 10)
            ->assertJsonPath('data.project.vendor.name', 'Adeyemi Okafor')
            ->assertJsonPath('data.wallet.target_amount', '19425000.00');

        return [Project::find($res->json('data.project.id')), $ngozi, $emeka, $emekaMain, $ada, $builder, $saved];
    }

    public function test_it_sets_up_the_whole_project(): void
    {
        [$project, $ngozi, $emeka, $emekaMain, $ada, $builder, $saved] = $this->house();
        $wallet = $project->wallet;

        // Savings moved in now; milestones planned, none reserved yet.
        $this->assertSame(120_000_000, $wallet->balance);
        $this->assertSame(0, $saved->refresh()->balance);
        $this->assertSame(['planned'], Milestone::where('project_id', $project->id)->pluck('status')->unique()->values()->all());
        $this->assertSame(['Foundation', 'Blockwork to lintel', 'Roofing', 'Plastering and windows', 'Finishing'], Milestone::where('project_id', $project->id)->orderBy('sequence')->pluck('title')->all());
        $this->assertSame(0, $project->reservedAmount());

        // Ngozi's ₦700,000 each month; Emeka and Ada asked for theirs.
        $this->assertSame(70_000_000, AutomationRule::where('user_id', $ngozi->id)->where('to_wallet_id', $wallet->id)->sole()->amount);
        $this->assertSame(['co_owner', 'contributor'], WalletInvitation::where('wallet_id', $wallet->id)->orderBy('id')->pluck('role')->all());
        $this->assertSame(1, AppNotification::where('user_id', $builder->id)->where('type', 'project_vendor_assigned')->count());

        // Emeka joins and his share starts; he can see the project.
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept', ['source_wallet_id' => $emekaMain->id])->assertOk();
        $this->assertSame(50_000_000, AutomationRule::where('user_id', $emeka->id)->where('to_wallet_id', $wallet->id)->sole()->amount);
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->assertJsonPath('data.my_role', 'co_owner');
        $this->getJson('/api/v1/projects')->assertOk()->assertJsonCount(1, 'data.projects');

        // Builder's card: projects, milestones paid, open disputes.
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/vendors/' . VendorProfile::sole()->id)->assertOk()->assertJsonPath('data.vendor.stats.projects', 1)->assertJsonPath('data.vendor.stats.milestones_paid', 0);
    }

    public function test_both_approve_and_ten_percent_is_held_until_three_months_after_handover(): void
    {
        [$project, $ngozi, $emeka, $emekaMain, $ada, $builder] = $this->house([
            'milestones' => [['title' => 'Foundation', 'amount' => '1000000'], ['title' => 'Roofing', 'amount' => '200000']],
        ]);
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept')->assertOk();
        [$foundation, $roofing] = $project->milestones()->orderBy('sequence')->get();

        // A planned milestone is reserved when the builder submits, if the money is there.
        Sanctum::actingAs($builder);
        $this->postJson("/api/v1/milestones/{$foundation->id}/submit", ['proof' => 'Photos and a video walk-through'])->assertOk()->assertJsonPath('data.milestone.status', 'submitted');
        $this->assertSame(100_000_000, $project->refresh()->reservedAmount());

        // Ngozi says yes; it waits for Emeka.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$foundation->id}/approve")->assertOk()->assertJsonPath('data.milestone.status', 'approved');
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/approvals/' . ApprovalRequest::sole()->id . '/respond', ['decision' => 'approve'])->assertOk();
        $foundation->refresh();
        $this->assertSame('released', $foundation->status);
        $this->assertSame(10_000_000, $foundation->retention);
        $builderMain = $builder->mainWallet();
        $this->assertSame(90_000_000, $builderMain->refresh()->balance);
        // The ₦100,000 held back stays reserved in the project wallet.
        $this->assertSame(10_000_000, $project->refresh()->heldBack());

        // Roofing: not enough free money left for the next planned milestone? It's ₦200,000 of ₦1,100,000 left.
        Sanctum::actingAs($builder);
        $this->postJson("/api/v1/milestones/{$roofing->id}/submit", ['proof' => 'Photos'])->assertOk();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roofing->id}/approve")->assertOk();
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/approvals/' . ApprovalRequest::latest('id')->first()->id . '/respond', ['decision' => 'approve'])->assertOk();

        // Handover: every milestone paid, retention due in 3 months.
        $this->assertSame('completed', $project->refresh()->status);
        $this->assertSame('2027-01-28', $foundation->refresh()->retention_due_at->toDateString());
        $this->artisan('projects:release-retention')->assertSuccessful();
        $this->assertSame(90_000_000 + 18_000_000, $builderMain->refresh()->balance);

        Carbon::setTestNow(Carbon::parse('2027-01-28 10:00:00'));
        $this->artisan('projects:release-retention')->assertSuccessful();
        $this->assertSame(90_000_000 + 18_000_000 + 10_000_000 + 2_000_000, $builderMain->refresh()->balance);
        $this->assertSame(0, $project->refresh()->heldBack());
    }

    public function test_a_planned_milestone_waits_for_its_money(): void
    {
        [$project, , , , , $builder] = $this->house(['move_in_wallet_id' => null]);
        $foundation = $project->milestones()->orderBy('sequence')->first();
        Sanctum::actingAs($builder);
        $this->postJson("/api/v1/milestones/{$foundation->id}/submit", ['proof' => 'Photos'])->assertStatus(422);
    }

    public function test_milestones_cant_be_more_than_the_budget_and_buffer(): void
    {
        [$ngozi] = $this->person('Ngozi', 1_000_000);
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/projects', [
            'title' => 'Wedding',
            'kind' => 'event',
            'budget' => '1000000',
            'buffer_percent' => 5,
            'milestones' => [['title' => 'Venue', 'amount' => '1100000']],
        ])->assertStatus(422);
        $this->assertSame(0, Project::count());
    }
}
