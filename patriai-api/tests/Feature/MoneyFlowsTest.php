<?php

namespace Tests\Feature;

use App\Models\SavedAccount;
use App\Models\SavedAccountGroup;
use App\Models\SupportRequest;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\WalletService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Money in and out (client prototype SND, BEN, TXN): paying Patriai users by
 * @tag, saved accounts that are people or banks, groups and their splits,
 * every transaction in one list, a transaction's detail and reporting it.
 */
class MoneyFlowsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(function ($request) {
            if (str_contains($request->url(), '/verify-bank-account')) {
                return Http::response(['status' => true, 'data' => ['first_name' => 'GREENFIELD SCHOOL', 'last_name' => 'LTD', 'bank_name' => 'Zenith Bank']]);
            }

            return Http::response(['status' => true, 'statuscode' => '00', 'data' => ['token' => 't', 'reference' => 'BANK-REF']]);
        });
    }

    private function person(string $first, string $username, int $balance = 0): array
    {
        $user = User::factory()->create(['first_name' => $first, 'last_name' => 'Okafor', 'name' => "{$first} Okafor", 'username' => $username, 'kyc_tier' => 3]);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => $balance]);

        return [$user, $main];
    }

    public function test_pay_a_patriai_user_by_tag_and_save_them(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        [$emeka, $emekaMain] = $this->person('Emeka', 'emeka');
        Sanctum::actingAs($ngozi);

        // SND-03 "Name, @tag, phone or account number".
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '2500', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => '@emeka']])
            ->assertOk()->assertJsonPath('data.recipient.name', 'Emeka Okafor');
        $this->assertSame(250_000, $emekaMain->fresh()->balance);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => '@nobody']])->assertStatus(404);

        // SND-01 "Recent": Emeka.
        $this->getJson('/api/v1/send/options')->assertOk()->assertJsonPath('data.recent.0.name', 'Emeka Okafor')->assertJsonPath('data.recent.0.identifier', '@emeka')->assertJsonPath('data.bank_fee', '20.00');

        // Saved as a Patriai user, not a bank account.
        $id = $this->postJson('/api/v1/saved-accounts', ['identifier' => '@emeka', 'category' => 'family'])->assertCreated()
            ->assertJsonPath('data.account.kind', 'patriai')->assertJsonPath('data.account.payee.username', 'emeka')->json('data.account.id');
        $this->getJson("/api/v1/saved-accounts/{$id}")->assertOk()->assertJsonPath('data.paid_this_year', '2500.00')->assertJsonPath('data.payments_this_year', 1);
        $this->patchJson("/api/v1/saved-accounts/{$id}", ['nickname' => 'My husband', 'category' => 'Partners'])->assertOk()->assertJsonPath('data.account.category', 'partners');
        $this->postJson('/api/v1/saved-accounts', ['identifier' => '@ngozi'])->assertStatus(404); // not yourself

        // A saved Patriai user is paid into their Main (giving and goal payouts use this too).
        $txn = WalletService::make()->payPayee($main->fresh(), $ngozi, SavedAccount::find($id), 1_000, 'Lunch');
        $this->assertSame('transfer_out', $txn->type);
        $this->assertSame(251_000, $emekaMain->fresh()->balance);
    }

    public function test_saved_bank_accounts_groups_and_removal(): void
    {
        [$ngozi] = $this->person('Ngozi', 'ngozi', 10_000_000);
        Sanctum::actingAs($ngozi);
        $a = $this->postJson('/api/v1/saved-accounts', ['account_number' => '0123456789', 'bank_code' => '058', 'category' => 'institutions'])->assertCreated()
            ->assertJsonPath('data.account.kind', 'bank')->assertJsonPath('data.account.account_name', 'GREENFIELD SCHOOL LTD')->json('data.account.id');
        $b = $this->postJson('/api/v1/saved-accounts', ['account_number' => '0987654321', 'bank_code' => '058', 'nickname' => 'St Jude'])->assertCreated()->json('data.account.id');
        $group = $this->postJson('/api/v1/saved-account-groups', ['name' => 'Our churches', 'saved_account_ids' => [$a, $b]])->assertCreated()
            ->assertJsonPath('data.group.split', 'even')->assertJsonPath('data.group.split_label', 'split 50/50')->json('data.group.id');

        // BEN-04: by percent must add to 100; fixed amounts are naira.
        $this->patchJson("/api/v1/saved-account-groups/{$group}", ['split' => 'percent', 'shares' => [$a => 70, $b => 20]])->assertStatus(422);
        $this->patchJson("/api/v1/saved-account-groups/{$group}", ['split' => 'percent', 'shares' => [$a => 70, $b => 30]])->assertOk()->assertJsonPath('data.group.split_label', 'split 70/30');
        $this->assertSame([$a => 7_000, $b => 3_000], SavedAccountGroup::find($group)->shares(10_000));
        $this->patchJson("/api/v1/saved-account-groups/{$group}", ['split' => 'fixed', 'shares' => [$a => 30000, $b => 15000]])->assertOk()->assertJsonPath('data.group.split_label', '₦30,000 + ₦15,000');
        $this->getJson("/api/v1/saved-account-groups/{$group}")->assertOk()->assertJsonPath('data.group.accounts.0.share', 3_000_000);

        // BEN-05: removing is a soft remove; it leaves the group.
        $this->deleteJson("/api/v1/saved-accounts/{$b}")->assertOk();
        $this->assertFalse(SavedAccount::find($b)->listed);
        $this->getJson('/api/v1/saved-accounts')->assertOk()->assertJsonCount(1, 'data.accounts');
        $other = User::factory()->create();
        Sanctum::actingAs($other);
        $this->getJson("/api/v1/saved-accounts/{$a}")->assertNotFound();
        $this->getJson("/api/v1/saved-account-groups/{$group}")->assertNotFound();
    }

    public function test_all_transactions_detail_and_report(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        [$emeka] = $this->person('Emeka', 'emeka');
        $fees = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'School fees', 'balance' => 0]);
        Sanctum::actingAs($ngozi);
        // A move between her own wallets shows once; a payment to Emeka counts as money out.
        WalletService::make()->transferBetweenWallets($main, $fees, 5_000_00, $ngozi, 'Save');
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1500', 'pin' => '1234', 'destination' => ['kind' => 'user', 'identifier' => '@emeka']])->assertOk();

        $list = $this->getJson('/api/v1/transactions')->assertOk();
        $this->assertCount(2, $list->json('data.transactions'));
        $this->assertSame('To Emeka Okafor', $list->json('data.transactions.0.title'));
        $this->assertSame('1500.00', $list->json('data.week.out'));
        $this->getJson("/api/v1/transactions?wallet_id={$fees->id}")->assertOk()->assertJsonCount(1, 'data.transactions');

        $txn = Transaction::where('wallet_id', $main->id)->where('counterparty->wallet_id', $emeka->mainWallet()->id)->first();
        $this->getJson("/api/v1/transactions/{$txn->id}")->assertOk()->assertJsonPath('data.transaction.reference', $txn->reference)->assertJsonPath('data.transaction.reported', false);

        // TXN-04 "I didn't make this payment — we'll freeze the wallet right away".
        $this->postJson("/api/v1/transactions/{$txn->id}/report", ['problem' => 'not_me', 'details' => 'Not me'])->assertOk()->assertJsonPath('data.frozen', true);
        $this->assertTrue($ngozi->fresh()->isFrozen());
        $this->assertSame('high', SupportRequest::where('reference', $txn->reference)->value('priority'));
        $this->getJson("/api/v1/transactions/{$txn->id}")->assertJsonPath('data.transaction.reported', true);

        // Someone else's transaction is not visible.
        Sanctum::actingAs(User::factory()->create());
        $this->getJson("/api/v1/transactions/{$txn->id}")->assertNotFound();
        $this->postJson("/api/v1/transactions/{$txn->id}/report", ['problem' => 'wrong_amount'])->assertNotFound();
    }

    public function test_pay_a_group_its_shares_directly_or_after_approval(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 20_000_000);
        [$emeka, $emekaMain] = $this->person('Emeka', 'emeka');
        Sanctum::actingAs($ngozi);
        $church = $this->postJson('/api/v1/saved-accounts', ['account_number' => '0123456789', 'bank_code' => '058'])->json('data.account.id');
        $husband = $this->postJson('/api/v1/saved-accounts', ['identifier' => '@emeka'])->json('data.account.id');
        $group = $this->postJson('/api/v1/saved-account-groups', ['name' => 'Tithe and Emeka', 'saved_account_ids' => [$church, $husband]])->json('data.group.id');
        $this->patchJson("/api/v1/saved-account-groups/{$group}", ['split' => 'percent', 'shares' => [$church => 60, $husband => 40]])->assertOk();

        // ₦10,000: ₦6,000 by bank (+₦20 fee) and ₦4,000 to Emeka's Main.
        $paid = $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '10000', 'pin' => '1234', 'destination' => ['kind' => 'group', 'group_id' => $group]])
            ->assertOk()->json('data.group');
        $this->assertSame(['6000.00', '4000.00'], array_column($paid, 'amount'));
        $this->assertSame(400_000, $emekaMain->fresh()->balance);
        $this->assertSame(20_000_000 - 1_000_000 - 2_000, $main->fresh()->balance);

        // Over the approval threshold on a shared wallet: one request for the whole group.
        $house = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'House', 'balance' => 50_000_000, 'approval_enabled' => true, 'approval_threshold' => 0, 'required_approvals' => 1]);
        \App\Models\WalletMember::create(['wallet_id' => $house->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active', 'can_approve' => true]);
        $approval = $this->postJson('/api/v1/transfers', ['from_wallet_id' => $house->id, 'amount' => '5000', 'pin' => '1234', 'destination' => ['kind' => 'group', 'group_id' => $group]])
            ->assertOk()->assertJsonPath('data.pending_approval', true)->assertJsonPath('data.approval.waiting_on.0', 'Emeka')->json('data.approval.id');
        $this->postJson("/api/v1/approvals/{$approval}/remind")->assertOk()->assertJsonPath('data.reminded', 1);
        $this->postJson("/api/v1/approvals/{$approval}/remind")->assertStatus(429);
        Sanctum::actingAs($emeka);
        $this->postJson("/api/v1/approvals/{$approval}/respond", ['decision' => 'approve', 'pin' => '1234'])->assertOk();
        $this->assertSame(400_000 + 200_000, $emekaMain->fresh()->balance);

        // Someone else's group can't be paid.
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $emekaMain->id, 'amount' => '100', 'pin' => '1234', 'destination' => ['kind' => 'group', 'group_id' => $group]])->assertNotFound();
    }

    public function test_receipt_pdf_and_waiting_requests_in_the_list(): void
    {
        [$ngozi, $main] = $this->person('Ngozi', 'ngozi', 10_000_000);
        [$emeka] = $this->person('Emeka', 'emeka');
        Sanctum::actingAs($ngozi);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $main->id, 'amount' => '1800', 'pin' => '1234', 'description' => 'Market', 'destination' => ['kind' => 'user', 'identifier' => '@emeka']])->assertOk();
        $txn = Transaction::where('wallet_id', $main->id)->where('direction', 'debit')->latest('id')->first();

        // TXN-03 "Download PDF": a signed link that works without the app's token.
        $url = $this->postJson("/api/v1/transactions/{$txn->id}/receipt-link")->assertOk()->json('data.url');
        $pdf = $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
        $this->get(preg_replace('/signature=[^&]+/', 'signature=bad', $url))->assertForbidden();

        // TXN-01 "Needs Emeka · Waiting": a request on a shared wallet shows at the top.
        $house = Wallet::create(['user_id' => $ngozi->id, 'type' => 'goal', 'name' => 'House', 'balance' => 50_000_000, 'approval_enabled' => true, 'approval_threshold' => 0, 'required_approvals' => 1]);
        \App\Models\WalletMember::create(['wallet_id' => $house->id, 'user_id' => $emeka->id, 'role' => 'co_owner', 'status' => 'active', 'can_approve' => true]);
        $this->postJson('/api/v1/transfers', ['from_wallet_id' => $house->id, 'amount' => '15000', 'pin' => '1234', 'description' => 'Tolu: school trip', 'destination' => ['kind' => 'user', 'identifier' => '@emeka']])->assertOk();
        $this->getJson('/api/v1/transactions')->assertOk()
            ->assertJsonPath('data.waiting.0.title', 'Tolu: school trip')
            ->assertJsonPath('data.waiting.0.waiting_on.0', 'Emeka')
            ->assertJsonPath('data.waiting.0.amount', '15000.00');
    }
}
