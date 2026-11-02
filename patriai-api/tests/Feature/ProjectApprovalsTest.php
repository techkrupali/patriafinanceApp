<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects 2.0 from the client prototype: approval settings for every milestone
 * with an override and a site-visit photo (MLS-03), several approvers with what
 * each said (MLS-02), a funder who approves (CTB-01/02), money set aside as it
 * comes in (MLS-04), and the builder's materials advance (VDM-12/13).
 */
class ProjectApprovalsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
        Carbon::setTestNow(Carbon::parse('2026-10-28 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $first, string $last = 'Eze', int $mainKobo = 0): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => $last, 'kyc_tier' => 3, 'phone' => '+234803' . fake()->unique()->numerify('#######')]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    /** Mama's house renovation: Roof ₦1.6m, Tiling ₦1.9m, Painting ₦3.3m; ₦4m in; 10% held back; photos only. */
    private function renovation(string $approvers = 'owner'): array
    {
        $ngozi = $this->person('Ngozi', 'Eze', 1_000_000_00);
        $tunde = $this->person('Tunde', 'Adeyemi');
        $profile = VendorProfile::create([
            'user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'location' => 'Enugu',
            'verified' => true, 'status' => 'verified', 'account_number' => '0123454410', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_name' => 'ADEYEMI BUILDERS LTD', 'auto_withdraw' => false,
        ]);
        $savings = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House money', 'balance' => 4_000_000_00]);
        WalletMember::create(['wallet_id' => $savings->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);

        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/projects', [
            'title' => "Mama's house renovation", 'kind' => 'renovation', 'location' => 'Nsukka', 'budget' => '6800000', 'buffer_percent' => 0,
            'milestones' => [['title' => 'Roof repair', 'amount' => '1600000'], ['title' => 'Tiling and plaster', 'amount' => '1900000'], ['title' => 'Painting and fittings', 'amount' => '3300000']],
            'vendor' => ['vendor_profile_id' => $profile->id],
            'move_in_wallet_id' => $savings->id,
            'release' => ['photos' => true, 'video' => false, 'receipts' => false, 'approvers' => $approvers, 'retention_percent' => 10, 'retention_months' => 3],
        ])->assertCreated()->json('data.project.id');
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$id}/accept")->assertOk();

        return [Project::find($id), $ngozi, $tunde];
    }

    private function invite(Project $project, User $by, User $who, string $role, bool $approve): WalletInvitation
    {
        Sanctum::actingAs($by);
        $this->postJson("/api/v1/wallets/{$project->wallet_id}/invitations", ['invitee_user_id' => $who->id, 'role' => $role, 'can_approve' => $approve, 'permissions' => ['fund' => true, 'chat' => true]])->assertCreated();

        return WalletInvitation::where('invitee_user_id', $who->id)->where('wallet_id', $project->wallet_id)->sole();
    }

    private function submit(Milestone $m, User $builder, array $extra = []): void
    {
        Sanctum::actingAs($builder);
        $this->post("/api/v1/milestones/{$m->id}/evidence", ['file' => UploadedFile::fake()->image('floor.jpg'), 'caption' => 'Kitchen floor'], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$m->id}/submit", ['note' => 'Done'] + $extra)->assertOk()->assertJsonPath('data.milestone.status', 'submitted');
    }

    public function test_approval_settings_override_site_photo_and_funders_who_approve(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        [$roof, $tiling, $painting] = $project->milestones()->orderBy('sequence')->get();
        $chidi = $this->person('Chidi', 'Eze', 3_000_000_00);
        $emeka = $this->person('Emeka', 'Okafor');
        $obi = $this->person('Obi', 'Okafor');

        // CTB-01: Chidi puts money in and approves; Emeka only sees.
        foreach ([[$chidi, 'contributor', true], [$emeka, 'viewer', false]] as [$who, $role, $approve]) {
            $invite = $this->invite($project, $ngozi, $who, $role, $approve);
            Sanctum::actingAs($who);
            $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertOk();
        }

        // MLS-03: 2 of them for every milestone, Ngozi alone for Painting, a site photo over ₦1,800,000.
        Sanctum::actingAs($chidi);
        $this->putJson("/api/v1/projects/{$project->id}/approval-rules", ['mode' => 'any', 'approver_ids' => [$chidi->id]])->assertStatus(403);
        Sanctum::actingAs($ngozi);
        $this->putJson("/api/v1/projects/{$project->id}/approval-rules", ['mode' => 'count', 'approver_ids' => [$ngozi->id, $emeka->id], 'needed' => 2])->assertStatus(422);
        $this->putJson("/api/v1/projects/{$project->id}/approval-rules", [
            'mode' => 'count', 'approver_ids' => [$ngozi->id, $chidi->id], 'needed' => 2,
            'overrides' => [['milestone_id' => $painting->id, 'approver_ids' => [$ngozi->id], 'needed' => 1]],
            'site_photo_over' => '1800000',
        ])->assertOk()
            ->assertJsonPath('data.approval_rules.needed', 2)
            ->assertJsonPath('data.approval_rules.approvers.1.first_name', 'Chidi')
            ->assertJsonPath('data.approval_rules.overrides.0.names', ['Ngozi'])
            ->assertJsonPath('data.approval_rules.site_photo_over', '1800000.00');
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'project_approvals_changed')->count());
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()
            ->assertJsonPath('data.people.family.1.first_name', 'Chidi')
            ->assertJsonPath('data.people.family.1.approver', true)
            ->assertJsonPath('data.people.family.2.role', 'viewer')
            ->assertJsonPath('data.people.vendor.0.business', 'Adeyemi Builders Ltd');

        // CTB-02: Uncle Obi is asked to approve too — "2 of 3: Ngozi, Chidi and you".
        $invite = $this->invite($project, $ngozi, $obi, 'contributor', true);
        Sanctum::actingAs($obi);
        $this->getJson('/api/v1/invitations')->assertOk()
            ->assertJsonPath('data.invitations.0.project.approvals.needed', 2)
            ->assertJsonPath('data.invitations.0.project.approvals.of', 3)
            ->assertJsonPath('data.invitations.0.project.approvals.names', ['Ngozi', 'Chidi', 'you'])
            ->assertJsonPath('data.invitations.0.project.next.title', 'Roof repair');
        $this->postJson("/api/v1/invitations/{$invite->id}/accept")->assertOk();
        $this->assertContains($obi->id, $project->refresh()->meta['approvals']['approver_ids']);

        // MLS-02: Ngozi says yes with a note; Chidi opens it and gives the second yes.
        $this->submit($roof, $tunde);
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertStatus(403);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234', 'note' => 'Looks good'])->assertOk()
            ->assertJsonPath('data.milestone.status', 'approved')
            ->assertJsonPath('data.milestone.approval.yes', 1)
            ->assertJsonPath('data.milestone.approval.required', 2)
            ->assertJsonPath('data.milestone.approval.approvers.0.note', 'Looks good')
            ->assertJsonPath('data.milestone.approval.viewers.0.first_name', 'Emeka');
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/milestones/{$roof->id}/viewed")->assertOk();
        $this->assertNotNull($roof->refresh()->meta['viewed'][(string) $chidi->id] ?? null);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
        $this->getJson("/api/v1/projects/{$project->id}")->assertJsonPath('data.milestones.0.approved_by.1.first_name', 'Chidi');

        // Over ₦1,800,000: an approver's site visit photo first.
        $this->submit($tiling, $tunde);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertStatus(422)->assertJsonValidationErrors('milestone');
        Sanctum::actingAs($tunde);
        $this->post("/api/v1/milestones/{$tiling->id}/evidence", ['file' => UploadedFile::fake()->image('visit.jpg'), 'kind' => 'site_visit'], ['Accept' => 'application/json'])->assertStatus(403);
        Sanctum::actingAs($ngozi);
        $this->post("/api/v1/milestones/{$tiling->id}/evidence", ['file' => UploadedFile::fake()->image('visit.jpg'), 'kind' => 'site_visit'], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'approved');
        Sanctum::actingAs($obi);
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');

        // MLS-04: Painting isn't funded until Chidi's money comes in — then it's set aside.
        $this->assertSame('planned', $painting->refresh()->status);
        Sanctum::actingAs($chidi);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $chidi->mainWallet()->id, 'amount' => '2800000', 'pin' => '1234', 'destination' => ['kind' => 'wallet', 'wallet_id' => $project->wallet_id]])->assertOk();
        $this->assertSame('funded', $painting->refresh()->status);
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/projects/{$project->id}")->assertJsonPath('data.people.family.1.put_in', '2800000.00');

        // The override: Ngozi alone releases Painting (over ₦1,800,000, so with her site visit photo).
        $this->submit($painting, $tunde);
        Sanctum::actingAs($ngozi);
        $this->post("/api/v1/milestones/{$painting->id}/evidence", ['file' => UploadedFile::fake()->image('visit.jpg'), 'kind' => 'site_visit'], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$painting->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
        $this->assertSame('completed', $project->refresh()->status);
    }

    public function test_the_builder_asks_for_materials_money_with_a_milestone(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        [$roof, $tiling, $painting] = $project->milestones()->orderBy('sequence')->get();
        $this->submit($roof, $tunde);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk();

        // VDM-12 "Ask for Painting materials money now · 30% of Painting".
        $this->submit($tiling, $tunde, ['advance_percent' => 30]);
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/projects/{$project->id}")
            ->assertJsonPath('data.milestones.1.advance.title', 'Painting and fittings')
            ->assertJsonPath('data.milestones.1.advance.amount', '990000.00')
            ->assertJsonPath('data.milestones.1.advance.paid', false);
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');

        // "Paid once the family funds Painting": nothing yet…
        $this->assertSame(0, $painting->refresh()->advance_paid);
        $vendorBefore = $tunde->mainWallet()->refresh()->balance;
        // …then money arrives in the project's account and Painting is set aside: the advance goes.
        WalletService::make()->credit($project->wallet, 2_800_000_00, 'fund', ['source_name' => 'NGOZI EZE']);
        $this->assertSame('funded', $painting->refresh()->status);
        $this->assertSame(990_000_00, $painting->advance_paid);
        $this->assertSame($vendorBefore + 990_000_00, $tunde->mainWallet()->refresh()->balance);
        $this->assertSame(1, Transaction::where('wallet_id', $project->wallet_id)->where('description', 'Materials advance: Painting and fittings')->count());

        // Painting pays what's left: ₦3,300,000 less 10% held back, less the advance.
        $this->submit($painting, $tunde);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$painting->id}/approve", ['pin' => '1234'])->assertOk()
            ->assertJsonPath('data.milestone.paid_now', '1980000.00');
        $this->assertSame(160_000_00 + 190_000_00 + 330_000_00, $project->refresh()->heldBack());
        $this->assertSame($project->heldBack(), $project->wallet->refresh()->balance);
    }
}
