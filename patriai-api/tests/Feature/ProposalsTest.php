<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ConversationMessage;
use App\Models\Milestone;
use App\Models\MilestoneEvidence;
use App\Models\Project;
use App\Models\ProjectProposal;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorReview;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * VPJ-01…06 the builder sends a proposal, the family accepts and funds it (the
 * first phase paid upfront), or declines; VLS-01/02 a finished project shown on
 * the builder's profile once the family agrees.
 */
class ProposalsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
    }

    private function person(string $first, string $last = 'Okafor', int $mainKobo = 0): User
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => $last, 'kyc_tier' => 3, 'phone' => '+234803' . fake()->unique()->numerify('#######')]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function draft(User $family, array $phases = null): array
    {
        return [
            'family_user_id' => $family->id,
            'title' => "Boys' quarters extension",
            'kind' => 'extension',
            'location' => 'Lekki, Lagos',
            'lines' => [['label' => 'Labour', 'amount' => '1650000'], ['label' => 'Blocks, cement, sand', 'amount' => '1420000'], ['label' => 'Roofing', 'amount' => '980000'], ['label' => 'Doors, windows, finishing', 'amount' => '750000']],
            'phases' => $phases ?? [
                ['title' => 'Mobilisation', 'percent' => 20, 'proof' => 'Materials on site'],
                ['title' => 'Foundation and blockwork', 'percent' => 30, 'proof' => 'Photos of DPC and walls to lintel'],
                ['title' => 'Roofing', 'percent' => 25],
                ['title' => 'Finishing and handover', 'percent' => 25],
            ],
            'terms' => ['upfront' => true, 'retention_percent' => 5, 'retention_months' => 3, 'start_within_days' => 7, 'show_on_profile' => true],
        ];
    }

    public function test_a_builder_proposes_and_the_family_accepts_and_funds_it(): void
    {
        $ngozi = $this->person('Ngozi', 'Okafor', 2_000_000_00);
        $emeka = $this->person('Emeka');
        $tunde = $this->person('Tunde', 'Adeyemi');
        VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'verified' => true, 'status' => 'verified', 'account_number' => '0123454410', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_name' => 'ADEYEMI BUILDERS LTD', 'auto_withdraw' => false]);

        // VPJ-03 "Percentages must add up to 100%".
        Sanctum::actingAs($tunde);
        $this->postJson('/api/v1/vendor/proposals', $this->draft($ngozi, [['title' => 'All of it', 'percent' => 90]]))->assertStatus(422)->assertJsonValidationErrors('phases');
        $id = $this->postJson('/api/v1/vendor/proposals', $this->draft($ngozi))->assertCreated()
            ->assertJsonPath('data.proposal.total', '4800000.00')
            ->assertJsonPath('data.proposal.phases.1.amount', '1440000.00')
            ->assertJsonPath('data.proposal.upfront', '960000.00')
            ->assertJsonPath('data.proposal.held_back', '240000.00')
            ->json('data.proposal.id');
        $this->post("/api/v1/vendor/proposals/{$id}/documents", ['file' => UploadedFile::fake()->create('bill-of-quantities.pdf', 120, 'application/pdf'), 'kind' => 'quote'], ['Accept' => 'application/json'])->assertOk();

        // VPJ-04 "Send proposal to Ngozi": a notification and a card in their chat.
        $this->postJson("/api/v1/vendor/proposals/{$id}/send")->assertOk()->assertJsonPath('message', 'Sent to Ngozi');
        $this->postJson("/api/v1/vendor/proposals/{$id}/send")->assertStatus(422);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'project_proposal')->count());
        $this->assertSame("Boys' quarters extension", ConversationMessage::where('kind', 'proposal')->sole()->payload['title']);

        // VPJ-05 the family reads it; someone else can't.
        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/proposals/{$id}")->assertNotFound();
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/proposals/{$id}")->assertOk()
            ->assertJsonPath('data.proposal.vendor.business', 'Adeyemi Builders Ltd')
            ->assertJsonPath('data.proposal.documents.0.name', 'bill-of-quantities.pdf')
            ->assertJsonPath('data.proposal.can_answer', true);

        // VPJ-06 "Me and Emeka, both" · fund ₦960,000 from Main · ₦1,000,000 a month.
        $main = $ngozi->mainWallet();
        $project = $this->postJson("/api/v1/proposals/{$id}/accept", ['pin' => '1234', 'approvers' => 'both', 'co_approver_id' => $emeka->id, 'source_wallet_id' => $main->id, 'monthly' => '1000000'])
            ->assertCreated()->json('data.project');
        $p = Project::find($project['id']);
        $this->assertSame($tunde->id, $p->vendor_id);
        $this->assertSame('accepted', $p->vendor_status);
        $this->assertSame(4, $p->milestones()->count());
        $this->assertSame('Materials on site', $p->milestones()->orderBy('sequence')->first()->proof_needed);
        // "Paid upfront: Mobilisation" — less the 5% held back.
        $mob = $p->milestones()->orderBy('sequence')->first();
        $this->assertSame('released', $mob->status);
        $this->assertSame(912_000_00, $tunde->mainWallet()->balance);
        $this->assertSame(2_000_000_00 - 960_000_00, $main->refresh()->balance);
        $this->assertSame('accepted', ProjectProposal::find($id)->status);
        $this->assertSame('co_owner', WalletInvitation::where('wallet_id', $p->wallet_id)->where('invitee_user_id', $emeka->id)->where('can_approve', true)->sole()->role);
        $this->assertSame(1, \App\Models\AutomationRule::where('to_wallet_id', $p->wallet_id)->count());
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'project_proposal_accepted')->count());

        // Emeka accepts, so he approves each phase with Ngozi.
        Sanctum::actingAs($emeka);
        $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $emeka->id)->sole()->id . '/accept')->assertOk();
        $this->assertSame([$ngozi->id, $emeka->id], $p->refresh()->meta['approvals']['approver_ids']);

        // Already accepted.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/proposals/{$id}/accept", ['pin' => '1234', 'approvers' => 'me', 'source_wallet_id' => $main->id])->assertStatus(422);
    }

    public function test_the_family_declines_and_a_finished_project_is_listed_once_they_agree(): void
    {
        $ngozi = $this->person('Ngozi', 'Eze', 1_000_000_00);
        $tunde = $this->person('Tunde', 'Adeyemi');
        $profile = VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'verified' => true, 'status' => 'verified', 'account_number' => '0123454410', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_name' => 'ADEYEMI BUILDERS LTD', 'auto_withdraw' => false]);
        Sanctum::actingAs($tunde);
        $id = $this->postJson('/api/v1/vendor/proposals', $this->draft($ngozi))->json('data.proposal.id');
        $this->postJson("/api/v1/vendor/proposals/{$id}/send")->assertOk();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/proposals/{$id}/decline", ['note' => 'Not this year'])->assertOk()->assertJsonPath('data.proposal.status', 'declined');
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'project_proposal_declined')->count());

        // A finished project: "Paid through 2 milestones, all approved".
        $project = Project::create(['wallet_id' => Wallet::create(['user_id' => $ngozi->id, 'type' => 'project', 'name' => 'Duplex', 'balance' => 0])->id, 'owner_id' => $ngozi->id, 'vendor_id' => $tunde->id, 'vendor_status' => 'accepted', 'title' => 'Duplex, Independence Layout', 'budget' => 2_000_000_00, 'status' => 'completed', 'meta' => ['location' => 'Independence Layout, Enugu']]);
        foreach (['Foundation', 'Roof'] as $i => $t) {
            $m = Milestone::create(['project_id' => $project->id, 'sequence' => $i + 1, 'title' => $t, 'amount' => 1_000_000_00, 'status' => 'released', 'released_at' => now()]);
            MilestoneEvidence::create(['milestone_id' => $m->id, 'user_id' => $tunde->id, 'kind' => 'image', 'url' => "https://cdn.test/{$t}.jpg", 'caption' => $t]);
        }
        VendorReview::create(['vendor_profile_id' => $profile->id, 'user_id' => $ngozi->id, 'project_id' => $project->id, 'rating' => 5, 'body' => 'Every phase came with photos.']);

        Sanctum::actingAs($tunde);
        $this->getJson('/api/v1/vendor/listing-candidates')->assertOk()
            ->assertJsonPath('data.projects.0.milestones', 2)
            ->assertJsonPath('data.projects.0.all_approved', true)
            ->assertJsonPath('data.projects.0.location', 'Enugu');
        $this->postJson('/api/v1/vendor/listings', ['project_id' => $project->id, 'title' => 'Duplex, Independence Layout', 'photos' => [['url' => 'https://evil.test/x.jpg']]])->assertStatus(422);
        $listing = $this->postJson('/api/v1/vendor/listings', ['project_id' => $project->id, 'title' => 'Duplex, Independence Layout', 'photos' => [['url' => 'https://cdn.test/Roof.jpg', 'caption' => 'Roof']], 'cost_min' => '15000000', 'cost_max' => '20000000'])
            ->assertCreated()->json('data.listing.id');

        // Not public until the family agrees.
        $other = $this->person('Ifeoma');
        Sanctum::actingAs($other);
        $this->getJson("/api/v1/vendors/{$profile->id}/listings")->assertOk()->assertJsonCount(0, 'data.listings');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/listings/{$listing}/answer", ['agree' => true])->assertOk()->assertJsonPath('data.listing.status', 'published');
        Sanctum::actingAs($other);
        $this->getJson("/api/v1/listings/{$listing}")->assertOk()
            ->assertJsonPath('data.listing.business', 'Adeyemi Builders Ltd')
            ->assertJsonPath('data.listing.milestones', 2)
            ->assertJsonPath('data.listing.cost_min', '15000000.00')
            ->assertJsonPath('data.listing.review.body', 'Every phase came with photos.')
            ->assertJsonPath('data.listing.review.by', 'Ngozi, Enugu');
    }
}
