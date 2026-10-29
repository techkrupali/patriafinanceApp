<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorTeamMember;
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
 * The family and the builder on a project (client sheet "Projects, vendors,
 * disputes"): the invitation answered (INV-V1…V5, PRJ-12), new milestones from
 * the builder (VDM-09, PRJ-11), the family's edits (PRJ-05), the builder's
 * team (VDM-10/11, INV-VT1), submitting with photos and receipts (VDM-05),
 * approving with a PIN and paying out (PRJ-06/07, VDM-06), reviews (VND-04),
 * budget vs actual (PRJ-10), documents (PRJ-09) and chat.
 */
class VendorProjectFlowTest extends TestCase
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
        // Phone sign-ups store numbers as +234…
        $user = User::factory()->create(['first_name' => $first, 'last_name' => $last, 'kyc_tier' => 3, 'phone' => '+234803' . fake()->unique()->numerify('#######')]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $mainKobo, 'virtual_account' => '90' . str_pad((string) $user->id, 8, '0', STR_PAD_LEFT)]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function builder(bool $verified = true): array
    {
        $tunde = $this->person('Tunde', 'Adeyemi');
        $profile = VendorProfile::create([
            'user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'location' => 'Enugu', 'areas' => 'Nsukka, Enugu',
            'verified' => $verified, 'status' => $verified ? 'verified' : 'submitted',
            'account_number' => '0123454410', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_name' => 'ADEYEMI BUILDERS LTD', 'auto_withdraw' => true,
        ]);

        return [$tunde, $profile];
    }

    /**
     * Mama's house renovation: ₦6,800,000 over 3 milestones, ₦4,000,000 in the
     * wallet, photos and receipts before a release, 10% held back.
     */
    private function renovation(array $release = [], bool $verified = true, ?User $coOwner = null): array
    {
        $ngozi = $this->person('Ngozi', 'Eze', 1_000_000_00);
        [$tunde, $profile] = $this->builder($verified);
        $savings = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House money', 'balance' => 4_000_000_00]);
        WalletMember::create(['wallet_id' => $savings->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);

        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/projects', [
            'title' => "Mama's house renovation",
            'kind' => 'renovation',
            'location' => 'Nsukka',
            'budget' => '6800000',
            'buffer_percent' => 5,
            'milestones' => [
                ['title' => 'Roof repair', 'amount' => '1600000'],
                ['title' => 'Tiling and plaster', 'amount' => '1900000'],
                ['title' => 'Painting and fittings', 'amount' => '3300000'],
            ],
            'vendor' => ['vendor_profile_id' => $profile->id],
            'move_in_wallet_id' => $savings->id,
            'funders' => $coOwner ? [['user_id' => $coOwner->id, 'role' => 'co_owner', 'amount' => '100000']] : [],
            'release' => array_merge(['photos' => true, 'video' => false, 'receipts' => true, 'approvers' => 'all', 'retention_percent' => 10, 'retention_months' => 3], $release),
        ])->assertCreated()->json('data.project.id');
        if ($coOwner) {
            Sanctum::actingAs($coOwner);
            $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $coOwner->id)->sole()->id . '/accept')->assertOk();
        }

        return [Project::find($id), $ngozi, $tunde, $profile];
    }

    private function photo(Milestone $m, ?string $kind = null): void
    {
        $this->post("/api/v1/milestones/{$m->id}/evidence", array_filter(['file' => $kind === 'receipt' ? UploadedFile::fake()->create('receipt.pdf', 80, 'application/pdf') : UploadedFile::fake()->image('floor.jpg'), 'kind' => $kind, 'caption' => $kind ? 'Cement' : 'Kitchen floor']), ['Accept' => 'application/json'])->assertOk();
    }

    public function test_the_builder_asks_for_a_change_and_the_family_agrees(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        [, $tiling] = $project->milestones()->orderBy('sequence')->get();

        // INV-V1: the invite is waiting on the builder's home.
        Sanctum::actingAs($tunde);
        $home = $this->getJson('/api/v1/vendor/home')->assertOk()->json('data');
        $this->assertSame('invite', $home['needs'][0]['kind']);
        $this->assertSame('Eze family · invite to accept', $home['projects'][0]['sub']);
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->assertJsonPath('data.can.accept', true)->assertJsonPath('data.project.family', 'Eze family');

        // Nothing can be submitted before accepting.
        $this->postJson("/api/v1/milestones/{$tiling->id}/submit")->assertStatus(422);

        // INV-V3/V4: a higher price for tiling, with why; then sent back to the family.
        $this->postJson("/api/v1/milestones/{$tiling->id}/change", [])->assertStatus(422);
        $this->postJson("/api/v1/milestones/{$tiling->id}/change", ['amount' => '2100000', 'why' => 'Tile prices went up'])->assertOk()
            ->assertJsonPath('data.milestone.change_request.amount', '2100000.00');
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertStatus(422);
        $this->postJson("/api/v1/projects/{$project->id}/send-changes")->assertOk()->assertJsonPath('data.project.vendor_status', 'changes_proposed');
        $this->assertStringContainsString('Tiling and plaster ₦1,900,000 → ₦2,100,000', AppNotification::where('user_id', $ngozi->id)->where('type', 'project_vendor_changes')->sole()->body);

        // The family agrees: the price changes and the project starts.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/projects/{$project->id}/changes/answer", ['agree' => true])->assertOk()
            ->assertJsonPath('data.project.vendor_status', 'accepted')
            ->assertJsonPath('data.project.plan_total', '7000000.00');
        $this->assertSame(2_100_000_00, $tiling->refresh()->amount);
        $this->assertNull($tiling->change_request);
        // ₦4,000,000 in: roof and tiling are set aside, painting waits.
        $this->assertSame(['funded', 'funded', 'planned'], $project->milestones()->orderBy('sequence')->pluck('status')->all());
    }

    public function test_the_family_keeps_the_original_then_the_builder_declines(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        [$roof] = $project->milestones()->orderBy('sequence')->get();
        // Another builder in Nsukka with good reviews, for "Find another verified builder".
        $other = $this->person('Obi', 'Nnaji');
        $otherProfile = VendorProfile::create(['user_id' => $other->id, 'business_name' => 'Nnaji Homes', 'category' => 'building', 'location' => 'Nsukka', 'verified' => true, 'status' => 'verified']);
        $fenceWallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'project', 'name' => 'Fence', 'balance' => 0]);
        $done = Project::create(['owner_id' => $ngozi->id, 'vendor_id' => $other->id, 'vendor_status' => 'accepted', 'wallet_id' => $fenceWallet->id, 'title' => 'Fence', 'budget' => 1, 'status' => 'completed']);
        $paid = Milestone::create(['project_id' => $done->id, 'sequence' => 1, 'title' => 'Fence', 'amount' => 1, 'status' => 'released']);
        \App\Models\VendorReview::create(['vendor_profile_id' => $otherProfile->id, 'user_id' => $ngozi->id, 'project_id' => $done->id, 'milestone_id' => $paid->id, 'rating' => 5, 'first_name_only' => true]);

        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/milestones/{$roof->id}/change", ['due_date' => '2027-03-31'])->assertOk();
        $this->postJson("/api/v1/projects/{$project->id}/send-changes")->assertOk();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/projects/{$project->id}/changes/answer", ['agree' => false])->assertOk()->assertJsonPath('data.project.vendor_status', 'invited');
        $this->assertNull($roof->refresh()->change_request);

        // INV-V5: declined, with a reason and when they could start.
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/decline", ['reason' => 'busy'])->assertStatus(422);
        $this->postJson("/api/v1/projects/{$project->id}/decline", ['reason' => 'fully_booked', 'message' => "We're booked until March. Happy to quote then.", 'start_month' => '2027-03'])->assertOk();
        $this->getJson("/api/v1/projects/{$project->id}")->assertNotFound();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'project_vendor_declined')->count());

        // PRJ-12: the money stays, the milestones are kept, other builders are suggested.
        Sanctum::actingAs($ngozi);
        $show = $this->getJson("/api/v1/projects/{$project->id}")->assertOk()
            ->assertJsonPath('data.project.vendor_status', 'declined')
            ->assertJsonPath('data.project.vendor_declined.name', 'Adeyemi Builders Ltd')
            ->assertJsonPath('data.project.vendor_declined.reason', 'fully_booked')
            ->assertJsonPath('data.project.in_wallet', '4000000.00')
            ->assertJsonPath('data.project.released', '0.00')
            ->assertJsonPath('data.suggestions.near', 'Nsukka')
            ->assertJsonPath('data.suggestions.count', 1)
            ->json('data');
        $this->assertCount(3, $show['milestones']);

        // "Remind me to re-invite Adeyemi in March".
        $this->postJson("/api/v1/projects/{$project->id}/reinvite-reminder")->assertOk()->assertJsonPath('data.remind_on', '2027-03-01');
        $this->artisan('projects:reinvite-reminders')->assertSuccessful();
        $this->assertSame(0, AppNotification::where('type', 'project_reinvite')->count());
        Carbon::setTestNow(Carbon::parse('2027-03-01 09:00:00'));
        $this->artisan('projects:reinvite-reminders')->assertSuccessful();
        $this->assertSame('Time to re-invite Adeyemi Builders Ltd', AppNotification::where('user_id', $ngozi->id)->where('type', 'project_reinvite')->sole()->title);

        // A new builder from the directory is invited.
        $this->postJson("/api/v1/projects/{$project->id}/vendor", ['vendor_profile_id' => $otherProfile->id])->assertOk()
            ->assertJsonPath('data.project.vendor_status', 'invited')
            ->assertJsonPath('data.project.vendor.name', 'Nnaji Homes')
            ->assertJsonPath('data.project.vendor_declined', null);
    }

    public function test_a_milestone_is_submitted_approved_with_a_pin_and_paid_out(): void
    {
        [$project, $ngozi, $tunde, $profile] = $this->renovation(['approvers' => 'owner']);
        [$roof] = $project->milestones()->orderBy('sequence')->get();
        $outsider = $this->person('Stranger');

        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();

        // PRJ-05: the family adds what must be done; names and lists change straight away.
        Sanctum::actingAs($ngozi);
        $this->patchJson("/api/v1/milestones/{$roof->id}", ['deliverables' => ['Old sheets removed', 'New roofing sheets fitted', 'Gutters fixed'], 'proof_needed' => 'Photos of every side'])->assertOk()
            ->assertJsonPath('data.milestone.deliverables.1.text', 'New roofing sheets fitted')
            ->assertJsonPath('data.milestone.change_request', null);

        // VDM-05: photos and a receipt, the list ticked, a note — then "Submit for ₦1,600,000".
        Sanctum::actingAs($outsider);
        $this->post("/api/v1/milestones/{$roof->id}/evidence", ['file' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertNotFound();
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertStatus(422)->assertJsonValidationErrors('evidence');
        $this->photo($roof);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertStatus(422)->assertJsonValidationErrors('evidence');
        $this->photo($roof, 'receipt');
        $this->patchJson("/api/v1/milestones/{$roof->id}/deliverables", ['done' => [true, true, false]])->assertOk()->assertJsonPath('data.milestone.deliverables.2.done', false);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'All sheets replaced and gutters fixed.', 'done' => [true, true, true]])->assertOk()
            ->assertJsonPath('data.milestone.status', 'submitted')
            ->assertJsonPath('data.milestone.submitted_by', 'Tunde Adeyemi')
            ->assertJsonPath('data.milestone.deliverables.2.done', true)
            ->assertJsonPath('data.milestone.release_now', '1440000.00')
            ->assertJsonPath('data.milestone.hold_back', '160000.00');
        // Submitted photos stay.
        $this->deleteJson("/api/v1/milestones/{$roof->id}/evidence/" . $roof->evidence()->first()->id)->assertStatus(422);

        // PRJ-03: "Adeyemi Builders finished … check the photos and release ₦1,440,000".
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()
            ->assertJsonPath('data.project.phase', 'to_review')
            ->assertJsonPath('data.project.attention.title', 'Roof repair')
            ->assertJsonPath('data.project.attention.release_now', '1440000.00')
            ->assertJsonPath('data.receipts.0.caption', 'Cement')
            ->assertJsonPath('data.site_photos', 1);
        $this->getJson('/api/v1/projects')->assertOk()->assertJsonPath('data.projects.0.to_review', 1);

        // PRJ-07 "Approve with PIN": paid now less 10%, straight on to the business account.
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '0000'])->assertStatus(422);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released')
            ->assertJsonPath('data.milestone.paid_now', '1440000.00');
        $this->assertSame(4_000_000_00 - 1_440_000_00, $project->wallet->refresh()->balance);
        $this->assertSame(160_000_00, $project->refresh()->heldBack());
        $withdrawal = Transaction::where('wallet_id', $tunde->mainWallet()->id)->where('type', 'withdrawal')->sole();
        $this->assertSame('successful', $withdrawal->status);
        $this->assertSame('0123454410', $withdrawal->counterparty['account_number']);
        // What the bank fee left is all that remains in the Patriai balance.
        $this->assertSame(0, $tunde->mainWallet()->refresh()->balance);

        // VDM-06 / VDM-04: the builder's money.
        Sanctum::actingAs($tunde);
        $payouts = $this->getJson('/api/v1/vendor/payouts')->assertOk()->json('data.payouts');
        $this->assertSame('160000.00', $payouts['held_back']);
        $this->assertSame(1, $payouts['held_back_projects']);
        $this->assertSame(['withdrawal', 'payout'], array_column($payouts['recent'], 'kind'));
        $this->assertSame('Withdrawal to •••• 4410', $payouts['recent'][0]['title']);
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()
            ->assertJsonPath('data.project.paid_so_far', '1440000.00')
            ->assertJsonPath('data.project.held_back', '160000.00');
        $this->assertSame('1440000.00', $this->getJson('/api/v1/vendor/home')->json('data.paid_this_month'));

        // VND-04: rated once, after a payment; the directory shows it.
        Sanctum::actingAs($ngozi);
        [, $tiling] = $project->milestones()->orderBy('sequence')->get();
        $this->postJson("/api/v1/vendors/{$profile->id}/reviews", ['rating' => 5, 'milestone_id' => $tiling->id])->assertStatus(422);
        $this->postJson("/api/v1/vendors/{$profile->id}/reviews", ['rating' => 5, 'tags' => ['on_time', 'good_photos'], 'body' => 'Neat roof, finished on time.', 'milestone_id' => $roof->id])->assertCreated()
            ->assertJsonPath('data.vendor.rating', 5)
            ->assertJsonPath('data.vendor.latest_review.by', 'Ngozi, Nsukka');
        $this->postJson("/api/v1/vendors/{$profile->id}/reviews", ['rating' => 4, 'milestone_id' => $roof->id])->assertStatus(422);
        Sanctum::actingAs($outsider);
        $this->postJson("/api/v1/vendors/{$profile->id}/reviews", ['rating' => 1, 'milestone_id' => $roof->id])->assertStatus(422);
        $this->getJson('/api/v1/vendors?category=building')->assertOk()->assertJsonPath('data.vendors.0.reviews', 1);
    }

    public function test_an_unverified_business_cant_be_paid(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation(['approvers' => 'owner', 'receipts' => false], verified: false);
        [$roof] = $project->milestones()->orderBy('sequence')->get();
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();
        $this->photo($roof);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertOk();

        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertStatus(422)->assertJsonValidationErrors('milestone');
        $this->assertSame('submitted', $roof->refresh()->status);
        $this->assertSame(4_000_000_00, $project->wallet->refresh()->balance);
    }

    public function test_two_approvers_and_a_co_owner_asking_for_changes(): void
    {
        $chidi = $this->person('Chidi');
        [$project, $ngozi, $tunde] = $this->renovation(['receipts' => false], coOwner: $chidi);
        [$roof] = $project->milestones()->orderBy('sequence')->get();
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();
        $this->photo($roof);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertOk();

        // PRJ-07: Ngozi approves; "Chidi · Waiting".
        Sanctum::actingAs($ngozi);
        $m = $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->json('data.milestone');
        $this->assertSame('approved', $m['status']);
        $this->assertSame([true, false], array_column($m['approval']['approvers'], 'said_yes'));
        $this->assertSame(['Ngozi', 'Chidi'], array_column($m['approval']['approvers'], 'first_name'));

        // Chidi isn't happy: "Ask for changes" stops the approval and sends it back.
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/milestones/{$roof->id}/reject", ['note' => 'Gutter at the back still leaks'])->assertOk()->assertJsonPath('data.milestone.status', 'funded')
            ->assertJsonPath('data.milestone.rejection', 'Gutter at the back still leaks');
        $this->assertSame('cancelled', ApprovalRequest::sole()->status);
        Sanctum::actingAs($tunde);
        $this->assertSame('redo', collect($this->getJson('/api/v1/vendor/home')->json('data.needs'))->firstWhere('milestone_id', $roof->id)['kind']);

        // Re-submitted, then both say yes.
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Gutter fixed'])->assertOk()->assertJsonPath('data.milestone.rejection', null);
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'approved');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$roof->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
    }

    public function test_the_family_changes_a_price_and_the_builder_proposes_a_milestone(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        [, , $painting] = $project->milestones()->orderBy('sequence')->get();
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();

        // PRJ-05: a new amount waits for the builder.
        Sanctum::actingAs($ngozi);
        $this->patchJson("/api/v1/milestones/{$painting->id}", ['title' => 'Painting, doors and fittings', 'amount' => '3000000'])->assertOk()
            ->assertJsonPath('data.milestone.title', 'Painting, doors and fittings')
            ->assertJsonPath('data.milestone.amount', '3300000.00')
            ->assertJsonPath('data.milestone.change_request.by', 'family')
            ->assertJsonPath('data.milestone.change_request.amount', '3000000.00');
        Sanctum::actingAs($tunde);
        $this->assertSame('change', collect($this->getJson('/api/v1/vendor/home')->json('data.needs'))->firstWhere('milestone_id', $painting->id)['kind']);
        $this->postJson("/api/v1/milestones/{$painting->id}/family-change/answer", ['agree' => true])->assertOk()->assertJsonPath('data.milestone.amount', '3000000.00');

        // VDM-09: the builder adds kitchen cabinets; nothing is paid until the family approves.
        $this->postJson("/api/v1/projects/{$project->id}/milestones")->assertForbidden();
        // A due date in the past is refused.
        $this->postJson("/api/v1/projects/{$project->id}/milestones/propose", ['title' => 'Old', 'amount' => '1000', 'due_date' => '2019-01-01', 'reason' => 'other'])
            ->assertStatus(422)->assertJsonValidationErrors('due_date');
        $kitchen = $this->postJson("/api/v1/projects/{$project->id}/milestones/propose", [
            'title' => 'Kitchen cabinets and worktop', 'amount' => '650000', 'due_date' => '2026-12-15',
            'deliverables' => ['Base and wall cabinets fitted', 'Granite worktop installed', 'Sink and tap connected'],
            'reason' => 'family_asked', 'why' => 'You asked for this on site',
        ])->assertCreated()->assertJsonPath('data.milestone.status', 'proposed')->json('data.milestone');
        $this->post("/api/v1/milestones/{$kitchen['id']}/evidence", ['file' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertStatus(422);
        $this->postJson("/api/v1/milestones/{$kitchen['id']}/submit", ['note' => 'x'])->assertStatus(422);

        // PRJ-11: what it does to the total.
        Sanctum::actingAs($ngozi);
        $proposal = collect($this->getJson("/api/v1/projects/{$project->id}")->json('data.milestones'))->firstWhere('id', $kitchen['id'])['proposal'];
        $this->assertSame('6500000.00', $proposal['was_total']);
        $this->assertSame('7150000.00', $proposal['new_total']);
        // The wallet target is ₦7,140,000 (₦6,800,000 + 5% buffer): ₦10,000 isn't covered yet.
        $this->assertSame('10000.00', $proposal['funding_gap']);
        $this->assertSame('Tunde Adeyemi', $proposal['by']);
        $this->postJson("/api/v1/milestones/{$kitchen['id']}/proposal/answer", ['approve' => false, 'note' => 'Use the cheaper worktop'])->assertOk()
            ->assertJsonPath('data.milestone.proposal.family_note', 'Use the cheaper worktop');
        Sanctum::actingAs($tunde);
        $this->patchJson("/api/v1/milestones/{$kitchen['id']}/proposal", ['amount' => '580000'])->assertOk()->assertJsonPath('data.milestone.proposal.family_note', null);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$kitchen['id']}/proposal/answer", ['approve' => true])->assertOk()->assertJsonPath('data.milestone.status', 'planned');

        // PRJ-10: the extra is shown against the buffer; the budget is unchanged.
        $budget = $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->json('data.budget');
        $this->assertSame('6800000.00', $budget['budget']);
        $this->assertSame('580000.00', $budget['extras_total']);
        $this->assertSame('340000.00', $budget['buffer']);
        $this->assertSame('0.00', $budget['buffer_left']);
        $this->assertSame('240000.00', $budget['over_buffer']);
        $this->assertCount(3, $budget['lines']);
    }

    public function test_the_builders_team_works_only_within_their_role(): void
    {
        [$project, $ngozi, $tunde, $profile] = $this->renovation(['approvers' => 'owner', 'receipts' => false]);
        [$roof] = $project->milestones()->orderBy('sequence')->get();
        $samuel = $this->person('Samuel', 'Okon');
        $ifeanyi = $this->person('Ifeanyi', 'Eze');
        $aisha = $this->person('Aisha', 'Abubakar');

        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();
        // VDM-11: only the business's own projects can be given.
        $this->postJson('/api/v1/vendors/me/team', ['phone' => $samuel->phone, 'role' => 'site_manager', 'project_ids' => [999]])->assertStatus(422);
        $this->postJson('/api/v1/vendors/me/team', ['phone' => $samuel->phone, 'role' => 'site_manager', 'project_ids' => [$project->id]])->assertCreated()->assertJsonPath('data.member.status', 'pending');
        $this->postJson('/api/v1/vendors/me/team', ['phone' => $samuel->phone, 'role' => 'foreman', 'project_ids' => [$project->id]])->assertStatus(422);
        $this->postJson('/api/v1/vendors/me/team', ['phone' => $ifeanyi->phone, 'role' => 'foreman', 'project_ids' => [$project->id]])->assertCreated();
        $this->postJson('/api/v1/vendors/me/team', ['phone' => $aisha->phone, 'role' => 'accounts', 'project_ids' => [$project->id]])->assertCreated();
        $this->postJson('/api/v1/vendors/me/team', ['phone' => '08031112222', 'role' => 'foreman', 'project_ids' => []])->assertCreated()->assertJsonPath('data.member.name', null);
        $this->assertCount(4, $this->getJson('/api/v1/vendors/me/team')->json('data.members'));

        // INV-VT1: pending until they join; they don't see the project before.
        Sanctum::actingAs($samuel);
        $this->getJson("/api/v1/projects/{$project->id}")->assertNotFound();
        $invite = $this->getJson('/api/v1/team-invites')->assertOk()->assertJsonPath('data.invites.0.business.name', 'Adeyemi Builders Ltd')
            ->assertJsonPath('data.invites.0.can', 'Add milestones, submit work for payment, talk to families')->json('data.invites.0');
        $this->postJson("/api/v1/team-invites/{$invite['id']}/answer", ['join' => true])->assertOk()->assertJsonPath('data.member.status', 'active');
        foreach ([$ifeanyi, $aisha] as $person) {
            Sanctum::actingAs($person);
            $this->postJson('/api/v1/team-invites/' . VendorTeamMember::where('user_id', $person->id)->sole()->id . '/answer', ['join' => true])->assertOk();
        }

        // Foreman: photos and ticks only, no family money.
        Sanctum::actingAs($ifeanyi);
        $this->getJson('/api/v1/projects')->assertOk()->assertJsonCount(1, 'data.projects');
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->assertJsonPath('data.my_role', 'foreman')
            ->assertJsonPath('data.wallet', null)->assertJsonPath('data.can.submit', false)->assertJsonPath('data.can.upload', true);
        $this->photo($roof);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertForbidden();

        // Accounts: sees payouts, can't submit or post in the chat.
        Sanctum::actingAs($aisha);
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Done'])->assertForbidden();
        $this->postJson("/api/v1/projects/{$project->id}/messages", ['body' => 'Hello'])->assertNotFound();

        // Site manager: submits for payment; the family sees who did.
        Sanctum::actingAs($samuel);
        $this->assertSame('Adeyemi Builders Ltd', $this->getJson('/api/v1/vendor/home')->json('data.business.name'));
        $this->postJson("/api/v1/milestones/{$roof->id}/submit", ['note' => 'Roof done'])->assertOk()->assertJsonPath('data.milestone.submitted_by', 'Samuel Okon');

        // Removed: the project is gone for them.
        Sanctum::actingAs($tunde);
        $this->deleteJson('/api/v1/vendors/me/team/' . VendorTeamMember::where('user_id', $ifeanyi->id)->sole()->id)->assertOk();
        Sanctum::actingAs($ifeanyi);
        $this->getJson("/api/v1/projects/{$project->id}")->assertNotFound();
    }

    public function test_documents_and_the_project_chat(): void
    {
        [$project, $ngozi, $tunde] = $this->renovation();
        $outsider = $this->person('Stranger');

        // PRJ-09: the contract and the bill of quantities.
        Sanctum::actingAs($ngozi);
        $doc = $this->post("/api/v1/projects/{$project->id}/documents", ['kind' => 'contract', 'name' => 'Contract with Adeyemi Builders', 'file' => UploadedFile::fake()->create('contract.pdf', 400, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.document.kind', 'contract')->json('data.document');
        Sanctum::actingAs($tunde);
        $this->post("/api/v1/projects/{$project->id}/documents", ['kind' => 'boq', 'file' => UploadedFile::fake()->create('boq.pdf', 400, 'application/pdf')], ['Accept' => 'application/json'])->assertCreated();
        // Only the person who added it, or the owner, removes it.
        $this->deleteJson("/api/v1/projects/{$project->id}/documents/{$doc['id']}")->assertNotFound();
        Sanctum::actingAs($outsider);
        $this->post("/api/v1/projects/{$project->id}/documents", ['kind' => 'other', 'file' => UploadedFile::fake()->create('x.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertNotFound();
        Sanctum::actingAs($ngozi);
        $this->assertCount(2, $this->getJson("/api/v1/projects/{$project->id}")->json('data.documents'));

        // Chat: both sides, everyone else on the project hears.
        $this->postJson("/api/v1/projects/{$project->id}/messages", ['body' => 'When can you start the roof?'])->assertCreated()->assertJsonPath('data.message.mine', true);
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/messages", ['body' => 'Monday morning.'])->assertCreated();
        $messages = $this->getJson("/api/v1/projects/{$project->id}/messages")->assertOk()->json('data.messages');
        $this->assertSame(['When can you start the roof?', 'Monday morning.'], array_column($messages, 'body'));
        $this->assertSame([false, true], array_column($messages, 'mine'));
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'project_message')->count());
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'project_message')->count());
        Sanctum::actingAs($outsider);
        $this->getJson("/api/v1/projects/{$project->id}/messages")->assertNotFound();
    }
}
