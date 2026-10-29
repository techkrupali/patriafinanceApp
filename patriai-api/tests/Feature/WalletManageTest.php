<?php

namespace Tests\Feature;

use App\Models\AutomationRule;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use App\Models\WalletMember;
use App\Services\AutomationService;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Managing a wallet (client prototype WAL-03…15): activity totals, who put in
 * what, pausing, the lock and asking to unlock, closing or archiving with what's
 * left moved out, statements and the audit log.
 */
class WalletManageTest extends TestCase
{
    use RefreshDatabase;

    /** School fees 2027: Ngozi (owner), Emeka (co-owner), Aunty Ada (contributor), each with a Main. */
    private function family(): array
    {
        Http::fake();
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $ada = User::factory()->create(['first_name' => 'Ada', 'last_name' => 'Eze', 'kyc_tier' => 2]);
        $mains = [];
        foreach ([$ngozi, $emeka, $ada] as $u) {
            $mains[$u->id] = Wallet::create(['user_id' => $u->id, 'type' => 'main', 'name' => 'Main', 'balance' => 1_000_000_00]);
        }
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees 2027', 'balance' => 0, 'target_amount' => 850_000_00, 'target_date' => '2027-01-08']);
        foreach ([[$ngozi, 'owner'], [$emeka, 'co_owner'], [$ada, 'contributor']] as [$u, $role]) {
            WalletMember::create(['wallet_id' => $fees->id, 'user_id' => $u->id, 'role' => $role, 'status' => 'active']);
        }
        $svc = WalletService::make();
        $svc->transferBetweenWallets($mains[$ngozi->id], $fees, 300_000_00, $ngozi);
        $svc->transferBetweenWallets($mains[$emeka->id], $fees, 280_000_00, $emeka);
        $svc->transferBetweenWallets($mains[$ada->id], $fees, 100_000_00, $ada);

        return [$ngozi, $emeka, $ada, $fees->fresh(), $mains];
    }

    public function test_activity_totals_and_who_put_in_what(): void
    {
        [$ngozi, $emeka, $ada, $fees] = $this->family();
        Sanctum::actingAs($ngozi);

        $this->getJson("/api/v1/wallets/{$fees->id}/transactions?direction=credit")
            ->assertOk()
            ->assertJsonPath('data.summary.in_since_start', '680000.00')
            ->assertJsonPath('data.summary.in_this_month', '680000.00')
            ->assertJsonCount(3, 'data.transactions');

        // WAL-04: Owner · ₦300,000 · 44%, then Emeka 41%, then Ada 15%.
        $this->getJson("/api/v1/wallets/{$fees->id}/members")
            ->assertOk()
            ->assertJsonPath('data.members.0.name', 'Ngozi Okafor')
            ->assertJsonPath('data.members.0.put_in', '300000.00')
            ->assertJsonPath('data.members.0.share', 44)
            ->assertJsonPath('data.members.1.share', 41)
            ->assertJsonPath('data.members.2.share', 15);

        // WAL-07 "See who paid what" off: Ada sees no amounts.
        $adaMember = WalletMember::where('wallet_id', $fees->id)->where('user_id', $ada->id)->first();
        $this->patchJson("/api/v1/wallets/{$fees->id}/members/{$adaMember->id}", ['permissions' => ['see_contributions' => false]])
            ->assertOk()->assertJsonPath('data.member.permissions.see_contributions', false);
        Sanctum::actingAs($ada);
        $this->getJson("/api/v1/wallets/{$fees->id}/members")->assertOk()
            ->assertJsonPath('data.members.0.put_in', null)
            ->assertJsonPath('data.contributions', null);
    }

    public function test_a_paused_wallet_takes_money_in_but_nothing_goes_out(): void
    {
        [$ngozi, $emeka, $ada, $fees, $mains] = $this->family();
        $rule = AutomationRule::create([
            'user_id' => $ngozi->id, 'name' => 'Save from every salary', 'from_wallet_id' => $mains[$ngozi->id]->id, 'to_wallet_id' => $fees->id,
            'amount' => 45_000_00, 'frequency' => 'monthly', 'day_of_month' => (int) now()->day, 'enabled' => true, 'trigger' => 'schedule',
        ]);
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$fees->id}/freeze")->assertOk();
        $this->getJson("/api/v1/wallets/{$fees->id}")
            ->assertJsonPath('data.state.kind', 'paused')
            ->assertJsonPath('data.state.by', 'Ngozi')
            ->assertJsonPath('data.my_can_spend', false);

        // Money still comes in…
        WalletService::make()->transferBetweenWallets($mains[$ada->id], $fees->fresh(), 10_000_00, $ada);
        $this->assertSame(690_000_00, $fees->fresh()->balance);
        // …rules stop…
        $this->assertSame('skipped', AutomationService::make()->runRule($rule, force: true)['status']);
        // …and Emeka resumes it.
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/wallets/{$fees->id}/unfreeze")->assertOk();
        $this->assertSame('active', $fees->fresh()->status);

        // Patriai's suspension is not the family's to lift.
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/wallets/{$fees->id}/status", ['status' => 'suspended', 'reason' => 'Unusual activity'])->assertOk();
        $this->getJson("/api/v1/admin/wallets/{$fees->id}")->assertOk()
            ->assertJsonPath('data.state.kind', 'suspended')
            ->assertJsonPath('data.audit_log.0.title', 'Patriai suspended the wallet');
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$fees->id}/unfreeze")->assertStatus(422);
        $this->postJson("/api/v1/wallets/{$fees->id}/freeze")->assertStatus(422);
        Sanctum::actingAs($admin);
        $this->patchJson("/api/v1/admin/wallets/{$fees->id}/status", ['status' => 'active'])->assertOk();
        $this->assertNull($fees->fresh()->meta['suspended'] ?? null);
    }

    public function test_lock_and_ask_to_unlock_with_everyones_yes(): void
    {
        [$ngozi, $emeka, $ada, $fees, $mains] = $this->family();
        WalletMember::where('wallet_id', $fees->id)->where('user_id', $emeka->id)->update(['can_approve' => true]);
        Sanctum::actingAs($ngozi);

        $this->postJson("/api/v1/wallets/{$fees->id}/lock", ['mode' => 'date', 'until' => now()->subDay()->toDateString()])->assertStatus(422);
        $until = now()->addMonths(2)->startOfDay();
        $this->postJson("/api/v1/wallets/{$fees->id}/lock", ['mode' => 'date', 'until' => $until->toDateString(), 'pay_payee' => true])
            ->assertOk()
            ->assertJsonPath('data.wallet.lock.mode', 'date')
            ->assertJsonPath('data.wallet.lock.locked', true);
        $this->postJson("/api/v1/wallets/{$fees->id}/lock", ['mode' => 'target'])->assertStatus(422); // already locked
        $this->getJson("/api/v1/wallets/{$fees->id}")
            ->assertJsonPath('data.state.kind', 'locked')
            ->assertJsonPath('data.state.until', $until->toDateString())
            ->assertJsonPath('data.state.can_ask', true);

        // WAL-11: Ngozi needs ₦35,000 for Tolu's BECE fee; Emeka says yes.
        $id = $this->postJson("/api/v1/wallets/{$fees->id}/unlock-requests", ['amount' => '35000', 'purpose' => "Tolu's BECE registration fee", 'pay_to' => 'main'])
            ->assertCreated()
            ->assertJsonPath('data.approval.unlock.purpose', "Tolu's BECE registration fee")
            ->assertJsonPath('data.approval.approver_names.0', 'Emeka')
            ->assertJsonPath('data.approval.pays_to', "Ngozi's Main wallet")
            ->assertJsonPath('data.approval.required_approvals', 1)
            ->json('data.approval.id');
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk()->assertJsonPath('data.approval.status', 'executed');
        $this->assertSame(1_000_000_00 - 300_000_00 + 35_000_00, $mains[$ngozi->id]->fresh()->balance);
        $this->assertTrue($fees->fresh()->isGoalLocked());

        // WAL-14 lists the lock and the yes.
        $this->getJson("/api/v1/wallets/{$fees->id}/audit-log?category=rules")->assertJsonPath('data.audit_log.0.title', 'Ngozi set a lock')
            ->assertJsonPath('data.audit_log.0.detail', 'Until ' . $until->format('j M Y'));
        $this->getJson("/api/v1/wallets/{$fees->id}/audit-log?category=approvals")->assertJsonPath('data.audit_log.0.title', 'Emeka said yes');
    }

    public function test_until_we_both_agree_and_a_solo_lock_holds(): void
    {
        [$ngozi, $emeka, $ada, $fees] = $this->family();
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$fees->id}/lock", ['mode' => 'agree'])->assertOk()->assertJsonPath('data.wallet.lock.mode', 'agree');
        $this->getJson("/api/v1/wallets/{$fees->id}")->assertJsonPath('data.state.agree', 'Ngozi and Emeka');
        $id = $this->postJson("/api/v1/wallets/{$fees->id}/unlock")->assertOk()->json('data.approval.id');
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk();
        $this->assertNull($fees->fresh()->savingsLock());

        // Alone: nothing leaves before it opens, and it can't be closed with money in it.
        $solo = Wallet::create(['user_id' => $ada->id, 'type' => 'savings', 'name' => 'Rent', 'balance' => 50_000_00]);
        WalletMember::create(['wallet_id' => $solo->id, 'user_id' => $ada->id, 'role' => 'owner', 'status' => 'active']);
        Sanctum::actingAs($ada);
        $this->postJson("/api/v1/wallets/{$solo->id}/lock", ['mode' => 'agree'])->assertStatus(422);
        $this->postJson("/api/v1/wallets/{$solo->id}/lock", ['mode' => 'date', 'until' => now()->addMonth()->toDateString()])->assertOk();
        $this->assertTrue($solo->fresh()->isHardLocked());
        $this->postJson("/api/v1/wallets/{$solo->id}/unlock")->assertStatus(422);
        $this->postJson("/api/v1/wallets/{$solo->id}/close", ['mode' => 'archive', 'move_to' => 'main'])->assertStatus(422);
    }

    public function test_close_moves_whats_left_back_to_each_person_after_the_co_owner_confirms(): void
    {
        [$ngozi, $emeka, $ada, $fees, $mains] = $this->family();
        // Greenfield School was paid; ₦20,000 is left.
        $fees->update(['balance' => 20_000_00]);
        Sanctum::actingAs($ngozi);

        $this->getJson("/api/v1/wallets/{$fees->id}/close")->assertOk()
            ->assertJsonPath('data.balance', '20000.00')
            ->assertJsonPath('data.each.0.name', 'Ngozi')
            ->assertJsonPath('data.each.0.amount', '8824.00')
            ->assertJsonPath('data.needs.0', 'Emeka');

        // Locked until both agree: closing together lifts it too.
        $this->postJson("/api/v1/wallets/{$fees->id}/lock", ['mode' => 'agree'])->assertOk();
        $id = $this->postJson("/api/v1/wallets/{$fees->id}/close", ['mode' => 'archive', 'move_to' => 'each'])
            ->assertOk()->assertJsonPath('data.done', false)->json('data.approval.id');
        $this->assertSame('active', $fees->fresh()->status);
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$id}/respond", ['decision' => 'approve'])->assertOk();

        $fees->refresh();
        $this->assertSame('closed', $fees->status);
        $this->assertSame(0, $fees->balance);
        $this->assertNull($fees->savingsLock());
        $this->assertSame(1_000_000_00 - 100_000_00 + 2_941_00, $mains[$ada->id]->fresh()->balance);
        $this->getJson("/api/v1/wallets/{$fees->id}")->assertJsonPath('data.state.kind', 'archived');
        // Admin sees where it went, in naira.
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));
        $this->getJson("/api/v1/admin/wallets/{$fees->id}")->assertOk()
            ->assertJsonPath('data.closed.mode', 'archive')
            ->assertJsonPath('data.closed.moved.0.to', 'Ngozi Okafor')
            ->assertJsonPath('data.closed.moved.0.amount', '8824.00');

        // Archived can be restored by the owner; closed for good cannot.
        Sanctum::actingAs($ngozi);
        $this->postJson("/api/v1/wallets/{$fees->id}/unarchive")->assertOk();
        $this->postJson("/api/v1/wallets/{$fees->id}/close", ['mode' => 'close'])->assertOk()->assertJsonPath('data.done', false);
        $this->assertSame('active', $fees->fresh()->status); // waiting for Emeka
    }

    public function test_statement_summary_download_and_email(): void
    {
        [$ngozi, $emeka, $ada, $fees] = $this->family();
        Mail::fake();
        Sanctum::actingAs($ngozi);

        // Money from before the wallet's own start date still counts "since start".
        $fees->forceFill(['created_at' => now()->addDay()])->save();
        $this->getJson("/api/v1/wallets/{$fees->id}/statement?period=since_start")->assertOk()
            ->assertJsonPath('data.count', 3)
            ->assertJsonPath('data.in', '680000.00')
            ->assertJsonPath('data.can_include_audit', true);

        $url = $this->postJson("/api/v1/wallets/{$fees->id}/statement/link", ['period' => 'since_start', 'format' => 'csv', 'contributions' => true])
            ->assertOk()->json('data.url');
        $csv = $this->get($url)->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')->getContent();
        $this->assertStringContainsString('Who put in what', $csv);
        $this->assertStringContainsString('"Ngozi Okafor","300,000.00",44%', $csv);

        $pdfUrl = $this->postJson("/api/v1/wallets/{$fees->id}/statement/link", ['period' => 'this_month', 'format' => 'pdf', 'audit' => true])->json('data.url');
        $pdf = $this->get($pdfUrl)->assertOk()->getContent();
        $this->assertStringStartsWith('%PDF-1.4', $pdf);
        $this->assertStringContainsString('School fees 2027', $pdf);
        // A tampered link is refused.
        $this->get(str_replace('format=pdf', 'format=csv', $pdfUrl))->assertForbidden();

        $this->postJson("/api/v1/wallets/{$fees->id}/statement/email", ['period' => 'last_3_months', 'format' => 'pdf'])
            ->assertOk()->assertJsonPath('data.sent_to', $ngozi->email);
    }

    public function test_audit_log_says_who_did_what_from_which_device(): void
    {
        [$ngozi, $emeka] = $this->family();
        Sanctum::actingAs($ngozi);
        $created = WalletService::make()->createWallet($ngozi, 'goal', 'House rent', ['target_amount' => 1_200_000_00, 'target_date' => '2027-03-01']);
        $this->withHeader('User-Agent', 'Patriai/1 CFNetwork/1490 Darwin/23.0.0')->postJson("/api/v1/wallets/{$created->id}/freeze")->assertOk();

        $rows = $this->getJson("/api/v1/wallets/{$created->id}/audit-log")->assertOk()->json('data.audit_log');
        $this->assertSame('Ngozi paused the wallet', $rows[0]['title']);
        $this->assertSame('iPhone', $rows[0]['device']);
        $this->assertSame('Ngozi created the wallet', $rows[1]['title']);
        $this->assertSame('Goal ₦1,200,000 by 1 Mar 2027', $rows[1]['detail']);
        $this->assertSame('NO', $rows[1]['actor']['initials']);
        $this->assertSame(0, WalletAuditLog::where('wallet_id', $created->id)->where('event', 'approval_approved')->count());

        // Only owners and co-owners read it.
        Sanctum::actingAs($emeka);
        $this->getJson("/api/v1/wallets/{$created->id}/audit-log")->assertNotFound();
    }
}
