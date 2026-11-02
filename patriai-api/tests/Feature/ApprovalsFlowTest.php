<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\ApprovalRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Approvals from the client prototype (APR-01…09): approving takes the PIN;
 * declining can give a reason and offer less; an approver can ask a question
 * and pause the clock; the person who asked tracks who viewed it, nudges, or
 * cancels with a reason; History; and Away mode hands approvals to someone.
 */
class ApprovalsFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Tolu asks for ₦15,000 from Tolu's wallet; Ngozi owns it, Emeka co-owns it. */
    private function toluWallet(): array
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 09:41:00'));
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'kyc_tier' => 3]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'kyc_tier' => 3]);
        $tolu = User::factory()->create(['first_name' => 'Tolu', 'kyc_tier' => 2]);
        $wallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'shared', 'name' => "Tolu's wallet", 'balance' => 4_230_000]);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active']);
        WalletMember::create(['wallet_id' => $wallet->id, 'user_id' => $tolu->id, 'role' => 'contributor', 'status' => 'active']);
        $toluMain = Wallet::create(['user_id' => $tolu->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);

        return [$wallet, $ngozi, $emeka, $tolu, $toluMain];
    }

    private function ask(User $tolu, Wallet $wallet, Wallet $to, string $amount = '15000'): int
    {
        Sanctum::actingAs($tolu);

        return $this->postJson("/api/v1/wallets/{$wallet->id}/spend-requests", [
            'amount' => $amount, 'pin' => '1234', 'description' => 'School trip to Olumo Rock, Friday.',
            'destination' => ['kind' => 'wallet', 'wallet_id' => $to->id],
        ])->assertOk()->assertJsonPath('data.pending_approval', true)->json('data.approval.id');
    }

    public function test_approving_takes_the_pin_and_the_detail_says_why_you(): void
    {
        [$wallet, $ngozi, , $tolu, $toluMain] = $this->toluWallet();
        $id = $this->ask($tolu, $wallet, $toluMain);

        Sanctum::actingAs($ngozi);
        $this->getJson("/api/v1/approvals/{$id}")->assertOk()
            ->assertJsonPath('data.approval.from_balance', '42300.00')
            ->assertJsonPath('data.approval.why', 'You approve payments on this wallet');
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertStatus(422)->assertJsonValidationErrors('pin');
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve', 'pin' => '9999'])->assertStatus(422);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve', 'pin' => '1234'])->assertOk()->assertJsonPath('data.approval.status', 'executed');
        $this->assertSame(1_500_000, $toluMain->refresh()->balance);
    }

    public function test_declining_gives_a_reason_and_can_offer_less(): void
    {
        [$wallet, $ngozi, , $tolu, $toluMain] = $this->toluWallet();
        $id = $this->ask($tolu, $wallet, $toluMain);

        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'reject', 'note' => 'Ask for less', 'offer' => '20000'])->assertStatus(422)->assertJsonValidationErrors('offer');
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'reject', 'note' => 'Ask for less', 'offer' => '10000'])->assertOk()
            ->assertJsonPath('data.approval.status', 'rejected')
            ->assertJsonPath('data.approval.counter_offer', '10000.00');
        $n = AppNotification::where('user_id', $tolu->id)->where('type', 'approval_rejected')->sole();
        $this->assertStringContainsString('Note: Ask for less', $n->body);
        $this->assertStringContainsString('They offered ₦10,000 instead.', $n->body);
    }

    public function test_a_question_pauses_the_clock_until_the_answer(): void
    {
        [$wallet, $ngozi, $emeka, $tolu, $toluMain] = $this->toluWallet();
        $id = $this->ask($tolu, $wallet, $toluMain);
        $expires = ApprovalRequest::find($id)->expires_at;

        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$id}/questions", ['body' => 'Can I see the school letter?', 'pause' => true])->assertOk()
            ->assertJsonPath('data.approval.paused', true)
            ->assertJsonPath('data.approval.questions.0.by_name', 'Emeka');
        $this->assertNull(ApprovalRequest::find($id)->expires_at);
        $this->assertSame(1, AppNotification::where('user_id', $tolu->id)->where('type', 'approval_question')->count());
        // Days later, it still hasn't expired.
        Carbon::setTestNow(now()->addDays(5));
        Sanctum::actingAs($tolu);
        $this->postJson("/api/v1/approvals/{$id}/questions", ['body' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/approvals/{$id}/answer", ['body' => 'Yes, I will add a photo of it.'])->assertOk()
            ->assertJsonPath('data.approval.paused', false)
            ->assertJsonPath('data.approval.questions.0.answer.body', 'Yes, I will add a photo of it.');
        $this->assertTrue(ApprovalRequest::find($id)->expires_at->gt(now()));
        $this->assertSame(1, AppNotification::where('user_id', $emeka->id)->where('type', 'approval_answer')->count());
        $this->assertNotNull($expires);
    }

    public function test_the_person_who_asked_sees_who_viewed_it_and_can_cancel_with_a_reason(): void
    {
        [$wallet, $ngozi, $emeka, $tolu, $toluMain] = $this->toluWallet();
        $id = $this->ask($tolu, $wallet, $toluMain);
        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/approvals/{$id}")->assertOk();

        Sanctum::actingAs($tolu);
        $this->postJson("/api/v1/approvals/{$id}/remind")->assertOk();
        $this->getJson("/api/v1/approvals/{$id}")->assertOk()
            ->assertJsonPath('data.approval.viewed.0.name', 'Emeka')
            ->assertJsonPath('data.approval.reminded_at', fn ($v) => $v !== null);
        $this->postJson("/api/v1/approvals/{$id}/cancel", ['reason' => 'No longer needed'])->assertOk()
            ->assertJsonPath('data.approval.status', 'cancelled')
            ->assertJsonPath('data.approval.cancel_reason', 'No longer needed');
        $this->assertSame(1, AppNotification::where('user_id', $ngozi->id)->where('type', 'approval_cancelled')->count());

        // APR-01 History: it shows for both sides.
        $this->getJson('/api/v1/approvals?scope=history')->assertOk()->assertJsonPath('data.approvals.0.id', $id);
        Sanctum::actingAs($ngozi);
        $this->getJson('/api/v1/approvals?scope=history')->assertOk()->assertJsonPath('data.approvals.0.status', 'cancelled');
    }

    public function test_away_mode_hands_approvals_to_someone_up_to_a_limit(): void
    {
        [$wallet, $ngozi, , $tolu, $toluMain] = $this->toluWallet();
        $ada = User::factory()->create(['first_name' => 'Ada', 'kyc_tier' => 3]);
        // Only Ngozi approves here (Emeka leaves for this test).
        WalletMember::where('wallet_id', $wallet->id)->where('role', 'co_owner')->delete();

        Sanctum::actingAs($ngozi);
        $this->putJson('/api/v1/me/away', ['delegate_id' => $ada->id, 'from' => '2026-11-02', 'to' => '2026-11-09', 'max_amount' => '20000', 'pin' => '1234'])->assertOk()
            ->assertJsonPath('data.away.active', true)
            ->assertJsonPath('data.away.delegate.first_name', 'Ada');
        $this->assertSame(1, AppNotification::where('user_id', $ada->id)->where('type', 'away_delegate')->count());

        $small = $this->ask($tolu, $wallet, $toluMain);
        $big = $this->ask($tolu, $wallet, $toluMain, '25000');
        Sanctum::actingAs($ada);
        $this->assertSame([$small], collect($this->getJson('/api/v1/approvals?scope=to_me')->json('data.approvals'))->pluck('id')->all());
        $this->getJson("/api/v1/approvals/{$small}")->assertJsonPath('data.approval.acting_for', 'Ngozi');
        $this->postJson("/api/v1/approvals/{$big}/respond", ['decision' => 'approve', 'pin' => '1234'])->assertStatus(422);
        $this->postJson("/api/v1/approvals/{$small}/respond", ['decision' => 'approve', 'pin' => '1234'])->assertOk()->assertJsonPath('data.approval.status', 'executed');
        $this->assertSame('Ada for Ngozi', ApprovalRequest::find($small)->responses()->sole()->note);

        // After the dates, it's Ngozi's again.
        Carbon::setTestNow(Carbon::parse('2026-11-10 09:00:00'));
        $this->assertSame([], $this->getJson('/api/v1/approvals?scope=to_me')->json('data.approvals'));
        Sanctum::actingAs($ngozi);
        $this->deleteJson('/api/v1/me/away')->assertOk();
        $this->getJson('/api/v1/me/away')->assertOk()->assertJsonPath('data.away', null);
    }
}
