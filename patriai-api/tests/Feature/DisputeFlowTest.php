<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\Dispute;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\VendorProfile;
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
 * Disputes from the client prototype (DSP-01…09, VDM-08): opening one holds
 * the milestone payment; the builder offers a fix, a partial refund, or
 * disagrees; the family accepts or asks Patriai to step in; Patriai decides.
 */
class DisputeFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0]]));
        // Tuesday 27 Oct 2026.
        Carbon::setTestNow(Carbon::parse('2026-10-27 09:02:00'));
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

    /** Tiling and plaster (₦1,900,000) submitted on Mama's house renovation; 10% held back. */
    private function submittedTiling(string $approvers = 'owner', ?User $coOwner = null): array
    {
        $ngozi = $this->person('Ngozi', 'Eze', 100_000_00);
        $tunde = $this->person('Tunde', 'Adeyemi');
        $profile = VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'location' => 'Enugu', 'verified' => true, 'status' => 'verified', 'auto_withdraw' => false]);
        $savings = Wallet::create(['user_id' => $ngozi->id, 'type' => 'savings', 'name' => 'House money', 'balance' => 5_000_000_00]);
        WalletMember::create(['wallet_id' => $savings->id, 'user_id' => $ngozi->id, 'role' => 'owner', 'status' => 'active']);

        Sanctum::actingAs($ngozi);
        $id = $this->postJson('/api/v1/projects', [
            'title' => "Mama's house renovation",
            'kind' => 'renovation',
            'location' => 'Nsukka',
            'budget' => '3500000',
            'milestones' => [['title' => 'Tiling and plaster', 'amount' => '1900000'], ['title' => 'Painting', 'amount' => '1600000']],
            'vendor' => ['vendor_profile_id' => $profile->id],
            'move_in_wallet_id' => $savings->id,
            'funders' => $coOwner ? [['user_id' => $coOwner->id, 'role' => 'co_owner', 'amount' => '100000']] : [],
            'release' => ['photos' => true, 'video' => false, 'receipts' => false, 'approvers' => $approvers, 'retention_percent' => 10, 'retention_months' => 3],
        ])->assertCreated()->json('data.project.id');
        $project = Project::find($id);
        if ($coOwner) {
            Sanctum::actingAs($coOwner);
            $this->postJson('/api/v1/invitations/' . WalletInvitation::where('invitee_user_id', $coOwner->id)->sole()->id . '/accept')->assertOk();
        }
        $tiling = $project->milestones()->orderBy('sequence')->first();

        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/projects/{$project->id}/accept")->assertOk();
        $this->post("/api/v1/milestones/{$tiling->id}/evidence", ['file' => UploadedFile::fake()->image('kitchen.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$tiling->id}/submit", ['note' => 'All floors tiled.'])->assertOk();

        return [$project, $tiling, $ngozi, $tunde];
    }

    /** DSP-02…04: "Kitchen tiles uneven", with two photos. */
    private function open(Milestone $tiling, string $remedy = 'fix')
    {
        return $this->post('/api/v1/disputes', [
            'kind' => 'milestone',
            'milestone_id' => $tiling->id,
            'subject' => 'Kitchen tiles uneven',
            'reason' => 'poor_quality',
            'remedy' => $remedy,
            'description' => 'The kitchen floor is uneven and two tiles are cracked.',
            'files' => [UploadedFile::fake()->image('crack1.jpg'), UploadedFile::fake()->image('crack2.jpg')],
        ], ['Accept' => 'application/json']);
    }

    private function offer(array $dispute): int
    {
        return (int) collect($dispute['messages'])->where('kind', 'offer')->last()['id'];
    }

    public function test_the_builder_offers_a_fix_and_it_resolves_once_paid(): void
    {
        [$project, $tiling, $ngozi, $tunde] = $this->submittedTiling();
        $stranger = $this->person('Stranger');

        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/disputes', ['kind' => 'milestone', 'milestone_id' => $tiling->id, 'reason' => 'poor_quality', 'description' => 'x'])->assertStatus(422)->assertJsonValidationErrors('remedy');
        $d = $this->open($tiling)->assertCreated()->json('data.dispute');
        $this->assertSame('PT-' . (20000 + $d['id']), $d['number']);
        $this->assertSame('open', $d['status']);
        $this->assertSame('1900000.00', $d['amount_on_hold']);
        $this->assertSame('2026-10-30', substr($d['reply_by'], 0, 10));
        // The end of that day in Lagos, whatever the phone's timezone.
        $this->assertSame('2026-10-30T23:59:59+01:00', $d['reply_by']);
        $this->assertCount(2, $d['files']);
        $this->assertSame('Adeyemi Builders Ltd', $d['against']['name']);
        $this->assertSame('family', $d['viewer']);
        $this->assertTrue($d['can']['escalate']);
        $this->assertFalse($d['can']['reply']);

        // One open dispute per milestone, and its payment is on hold.
        $this->open($tiling)->assertStatus(422)->assertJsonValidationErrors('milestone_id');
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertStatus(422)->assertJsonValidationErrors('milestone');
        $this->getJson("/api/v1/projects/{$project->id}")->assertOk()->assertJsonPath('data.milestones.0.dispute.number', $d['number']);
        // DSP-01: open list.
        $this->getJson('/api/v1/disputes?status=open')->assertOk()
            ->assertJsonPath('data.disputes.0.status_label', 'Waiting for builder')
            ->assertJsonPath('data.disputes.0.against', 'Adeyemi Builders Ltd');
        $this->getJson('/api/v1/disputes?status=closed')->assertOk()->assertJsonCount(0, 'data.disputes');

        // Others can't see it.
        Sanctum::actingAs($stranger);
        $this->getJson("/api/v1/disputes/{$d['id']}")->assertNotFound();
        $this->postJson("/api/v1/disputes/{$d['id']}/messages", ['body' => 'hi'])->assertNotFound();

        // VDM-08: the builder's list says when to reply by.
        Sanctum::actingAs($tunde);
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'dispute_against_you')->count());
        $this->getJson('/api/v1/vendor/disputes')->assertOk()->assertJsonPath('data.disputes.0.status_label', 'Reply by 30 Oct');
        $this->assertSame('dispute', collect($this->getJson('/api/v1/vendor/home')->json('data.needs'))->last()['kind']);

        // DSP-07 "Offer to fix it" by a date.
        $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'fix'])->assertStatus(422)->assertJsonValidationErrors('fix_by');
        $d = $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'fix', 'fix_by' => '2026-11-02', 'body' => "We'll inspect on Monday and re-lay the kitchen."])->assertOk()
            ->assertJsonPath('data.dispute.status', 'responded')
            ->assertJsonPath('data.dispute.viewer', 'vendor')
            ->json('data.dispute');
        $this->post("/api/v1/disputes/{$d['id']}/files", ['file' => UploadedFile::fake()->image('site.jpg')], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.dispute.files.2.from', 'vendor');

        // DSP-06: the family accepts the fix; the builder redoes it and submits again.
        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/disputes/{$d['id']}")->assertOk()->assertJsonPath('data.dispute.can.answer_offer', true)->assertJsonPath('data.dispute.status_label', null);
        $this->postJson("/api/v1/disputes/{$d['id']}/offers/{$this->offer($d)}/answer", ['accept' => true])->assertOk()->assertJsonPath('data.dispute.status', 'fixing');
        $this->assertSame('funded', $tiling->refresh()->status);
        Sanctum::actingAs($tunde);
        $this->assertSame('redo', collect($this->getJson('/api/v1/vendor/home')->json('data.needs'))->firstWhere('milestone_id', $tiling->id)['kind']);
        $this->postJson("/api/v1/milestones/{$tiling->id}/submit", ['note' => 'Kitchen re-laid.'])->assertOk();

        // DSP-09: approved and paid, so the dispute closes as fixed.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
        $closed = $this->getJson("/api/v1/disputes/{$d['id']}")->assertOk()->json('data.dispute');
        $this->assertSame('resolved', $closed['status']);
        $this->assertSame('fixed', $closed['outcome']);
        $this->assertSame('1710000.00', $closed['released_amount']);
        $this->assertTrue($closed['can']['rate']);
        $this->getJson('/api/v1/disputes?status=closed')->assertOk()->assertJsonPath('data.disputes.0.status_label', 'Resolved · fixed at no cost');
        $this->assertSame(171_000_000, $tunde->mainWallet()->refresh()->balance);
    }

    public function test_a_partial_refund_is_paid_less_the_refund(): void
    {
        [$project, $tiling, $ngozi, $tunde] = $this->submittedTiling();
        Sanctum::actingAs($ngozi);
        $d = $this->open($tiling, 'partial_refund')->assertCreated()->json('data.dispute');

        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'partial_refund', 'amount' => '1900000'])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'partial_refund', 'amount' => '200000'])->assertOk();
        // A better offer replaces the first.
        $d = $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'partial_refund', 'amount' => '300000', 'body' => 'We can take ₦300,000 off.'])->assertOk()->json('data.dispute');
        $this->assertSame(['replaced', 'open'], collect($d['messages'])->where('kind', 'offer')->pluck('offer.status')->values()->all());
        $this->assertSame('300000.00', collect($d['messages'])->where('kind', 'offer')->last()['offer']['amount']);

        // "Not yet" first, then the family accepts the same offer… which is closed now, so the builder offers again.
        Sanctum::actingAs($ngozi);
        $offer = $this->offer($d);
        $this->postJson("/api/v1/disputes/{$d['id']}/offers/{$offer}/answer", ['accept' => false])->assertOk();
        $this->postJson("/api/v1/disputes/{$d['id']}/offers/{$offer}/answer", ['accept' => true])->assertStatus(422);
        Sanctum::actingAs($tunde);
        $d = $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'partial_refund', 'amount' => '300000'])->assertOk()->json('data.dispute');

        $before = $project->wallet->refresh()->balance;
        Sanctum::actingAs($ngozi);
        $done = $this->postJson("/api/v1/disputes/{$d['id']}/offers/{$this->offer($d)}/answer", ['accept' => true])->assertOk()->json('data.dispute');
        $this->assertSame('resolved', $done['status']);
        $this->assertSame('partial_refund', $done['outcome']);
        // ₦1,600,000 released, less 10% held back = ₦1,440,000 paid now; ₦300,000 stays.
        $this->assertSame('1440000.00', $done['released_amount']);
        $this->assertSame('300000.00', $done['refund_amount']);
        $this->assertSame($before - 144_000_000, $project->wallet->refresh()->balance);
        $this->assertSame(144_000_000, $tunde->mainWallet()->refresh()->balance);
        $tiling->refresh();
        $this->assertSame('released', $tiling->status);
        $this->assertSame(16_000_000, $tiling->retention);
        $this->assertSame('1600000.00', $this->getJson("/api/v1/projects/{$project->id}")->json('data.project.released'));
        $this->getJson('/api/v1/disputes?status=closed')->assertOk()->assertJsonPath('data.disputes.0.status_label', 'Refunded ₦300,000');
    }

    public function test_patriai_decides_when_they_cant_agree(): void
    {
        $chidi = $this->person('Chidi');
        [$project, $tiling, $ngozi, $tunde] = $this->submittedTiling('all', $chidi);
        $admin = User::factory()->create(['role' => 'admin']);

        // Ngozi had already said yes; the dispute stops that approval.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$tiling->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'approved');
        Sanctum::actingAs($chidi);
        $d = $this->open($tiling, 'full_refund')->assertCreated()->json('data.dispute');
        $this->assertSame('cancelled', ApprovalRequest::sole()->status);
        $this->assertSame('submitted', $tiling->refresh()->status);
        // Both owners hear the builder's reply.
        Sanctum::actingAs($tunde);
        $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'disagree'])->assertStatus(422)->assertJsonValidationErrors('body');
        $this->postJson("/api/v1/disputes/{$d['id']}/respond", ['type' => 'disagree', 'body' => 'The floor was level when we finished.'])->assertOk();
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'dispute_reply')->count());
        $this->assertSame(1, AppNotification::where('user_id', $chidi->id)->where('type', 'dispute_reply')->count());

        // DSP-08 "Send to Patriai": a decision within 5 working days, evidence for 2 more days.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/disputes/{$d['id']}/messages", ['body' => 'Please come and see it.'])->assertCreated();
        $d = $this->postJson("/api/v1/disputes/{$d['id']}/escalate", ['note' => 'We disagree on the quality.'])->assertOk()->json('data.dispute');
        $this->assertSame('escalated', $d['status']);
        $this->assertSame('2026-11-03', substr($d['decision_due'], 0, 10));
        $this->assertSame('2026-10-29', substr($d['evidence_until'], 0, 10));
        $this->assertFalse($d['can']['answer_offer']);
        Carbon::setTestNow(Carbon::parse('2026-10-30 10:00:00'));
        $this->post("/api/v1/disputes/{$d['id']}/files", ['file' => UploadedFile::fake()->image('late.jpg')], ['Accept' => 'application/json'])->assertStatus(422);

        // Admin: the case, a note to both sides, then the decision.
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/admin/disputes')->assertForbidden();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/disputes?status=active')->assertOk()->assertJsonPath('data.disputes.0.status', 'escalated');
        $this->getJson("/api/v1/admin/disputes/{$d['id']}")->assertOk()->assertJsonPath('data.dispute.viewer', 'admin');
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/messages", ['body' => 'Our inspector visits on Monday.'])->assertCreated()
            ->assertJsonPath('data.dispute.messages.' . (count($d['messages'])) . '.from', 'patriai');
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'resolved', 'note' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'partial_refund', 'note' => 'x'])->assertStatus(422)->assertJsonValidationErrors('refund');
        $before = $project->wallet->refresh()->balance;
        $decided = $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'full_refund', 'note' => 'The inspector found the kitchen floor must be redone. Nothing is paid for it.'])->assertOk()->json('data.dispute');
        $this->assertSame('resolved', $decided['status']);
        $this->assertSame('full_refund', $decided['outcome']);
        $this->assertSame('decision', collect($decided['messages'])->last()['kind']);
        $this->assertSame('cancelled', $tiling->refresh()->status);
        $this->assertSame($before, $project->wallet->refresh()->balance);
        $this->assertSame(0, $tunde->mainWallet()->refresh()->balance);
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'release_full', 'note' => 'again'])->assertStatus(422);

        // The cancelled milestone doesn't count: once painting is paid the project is complete.
        $painting = $project->milestones()->where('title', 'Painting')->sole();
        Sanctum::actingAs($tunde);
        $this->post("/api/v1/milestones/{$painting->id}/evidence", ['file' => UploadedFile::fake()->image('wall.jpg')], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/milestones/{$painting->id}/submit", ['note' => 'Painted'])->assertOk();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/milestones/{$painting->id}/approve", ['pin' => '1234'])->assertOk();
        Sanctum::actingAs($chidi);
        $this->postJson("/api/v1/milestones/{$painting->id}/approve", ['pin' => '1234'])->assertOk()->assertJsonPath('data.milestone.status', 'released');
        $this->assertSame('completed', $project->refresh()->status);
    }

    public function test_patriai_releases_in_full_or_with_a_refund(): void
    {
        [$project, $tiling, $ngozi, $tunde] = $this->submittedTiling();
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($ngozi);
        $d = $this->open($tiling)->assertCreated()->json('data.dispute');
        $this->postJson("/api/v1/disputes/{$d['id']}/escalate")->assertOk();

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'partial_refund', 'refund' => '1900000', 'note' => 'x'])->assertStatus(422);
        $decided = $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'partial_refund', 'refund' => '400000', 'note' => 'Two rooms need re-laying; ₦400,000 stays with the family.'])->assertOk()->json('data.dispute');
        $this->assertSame('partial_refund', $decided['outcome']);
        $this->assertSame('1350000.00', $decided['released_amount']);
        $this->assertSame(135_000_000, $tunde->mainWallet()->refresh()->balance);
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'dispute_resolved')->count());
    }

    public function test_an_unanswered_dispute_goes_to_patriai_after_three_days(): void
    {
        [, $tiling, $ngozi, $tunde] = $this->submittedTiling();
        Sanctum::actingAs($ngozi);
        $d = $this->open($tiling)->assertCreated()->json('data.dispute');

        $this->artisan('disputes:escalate-overdue')->assertSuccessful();
        $this->assertSame('open', Dispute::find($d['id'])->status);
        Carbon::setTestNow(Carbon::parse('2026-10-31 00:30:00'));
        $this->artisan('disputes:escalate-overdue')->assertSuccessful();
        $dispute = Dispute::find($d['id']);
        $this->assertSame('escalated', $dispute->status);
        $this->assertSame("Adeyemi Builders Ltd didn't reply in time, so Patriai is stepping in", $dispute->messages()->where('kind', 'system')->get()->last()->body);
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'dispute_escalated')->count());
    }

    public function test_a_payment_dispute_and_the_older_form(): void
    {
        $ngozi = $this->person('Ngozi', 'Eze', 50_000_00);
        $other = $this->person('Other', 'Person', 50_000_00);
        $admin = User::factory()->create(['role' => 'admin']);
        $mine = Transaction::create(['wallet_id' => $ngozi->mainWallet()->id, 'user_id' => $ngozi->id, 'type' => 'withdrawal', 'direction' => 'debit', 'amount' => 1_840_000, 'fee' => 0, 'balance_before' => 5_000_000, 'balance_after' => 3_160_000, 'status' => 'successful', 'reference' => 'PTX-SHOPRITE-1', 'description' => 'Shoprite']);
        $theirs = Transaction::create(['wallet_id' => $other->mainWallet()->id, 'user_id' => $other->id, 'type' => 'withdrawal', 'direction' => 'debit', 'amount' => 100, 'fee' => 0, 'balance_before' => 100, 'balance_after' => 0, 'status' => 'successful', 'reference' => 'PTX-OTHER-1', 'description' => 'x']);

        Sanctum::actingAs($ngozi);
        // DSP-02 "A payment I made": one of my own transactions.
        $this->postJson('/api/v1/disputes', ['kind' => 'payment_made', 'reference' => $theirs->reference, 'reason' => 'overcharged', 'description' => 'Charged twice'])->assertStatus(422);
        $d = $this->postJson('/api/v1/disputes', ['kind' => 'payment_made', 'reference' => $mine->reference, 'reason' => 'overcharged', 'subject' => 'Double charge at Shoprite', 'description' => 'I was charged twice.'])->assertCreated()
            ->assertJsonPath('data.dispute.kind', 'payment_made')
            ->assertJsonPath('data.dispute.can.escalate', false)
            ->json('data.dispute');
        $this->postJson("/api/v1/disputes/{$d['id']}/escalate")->assertStatus(422);
        $this->getJson('/api/v1/disputes?status=open')->assertOk()->assertJsonPath('data.disputes.0.status_label', 'Patriai is looking into it');

        // The older form (and the assistant's "flag this transaction") still works.
        $this->postJson('/api/v1/disputes', ['subject' => 'Flagged transaction', 'category' => 'transaction', 'reference' => 'PTX-SHOPRITE-1', 'description' => 'Looks wrong'])->assertCreated()
            ->assertJsonPath('data.dispute.status', 'open');
        $this->assertSame(2, Dispute::where('user_id', $ngozi->id)->count());

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'full_refund', 'note' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/admin/disputes/{$d['id']}/decide", ['outcome' => 'resolved', 'note' => 'Refunded ₦18,400 to your wallet.'])->assertOk()->assertJsonPath('data.dispute.status', 'resolved');
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/disputes?status=closed')->assertOk()->assertJsonPath('data.disputes.0.status_label', 'Resolved');
    }
}
