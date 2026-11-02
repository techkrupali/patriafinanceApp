<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** VDM-06 "Withdraw ₦1,260,000": only ever to the verified business account on file. */
class VendorWithdrawTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_builder_withdraws_to_the_business_account_only(): void
    {
        Http::fake(fn () => Http::response(['status' => true, 'statuscode' => '00', 'data' => ['balance' => 0, 'reference' => 'BANK-1']]));
        $tunde = User::factory()->create(['first_name' => 'Tunde', 'last_name' => 'Adeyemi', 'kyc_tier' => 3]);
        $main = Wallet::create(['user_id' => $tunde->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 1_260_000_00, 'virtual_account' => '9000000001']);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $tunde->id, 'role' => 'owner', 'status' => 'active']);
        $profile = VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'verified' => false, 'status' => 'submitted']);

        Sanctum::actingAs($tunde);
        // Not verified yet: nowhere to send it.
        $this->postJson('/api/v1/vendor/payouts/withdraw', ['amount' => '1000', 'pin' => '1234'])->assertStatus(422)->assertJsonValidationErrors('amount');

        $profile->update(['verified' => true, 'status' => 'verified', 'bank_code' => '058', 'bank_name' => 'GTBank', 'account_number' => '0123454410', 'account_name' => 'ADEYEMI BUILDERS LTD']);
        $this->getJson('/api/v1/vendor/payouts')->assertOk()->assertJsonPath('data.payouts.fee', '20.00');
        $this->postJson('/api/v1/vendor/payouts/withdraw', ['amount' => '1000', 'pin' => '9999'])->assertStatus(422)->assertJsonValidationErrors('pin');
        // The ₦20 fee comes out too.
        $this->postJson('/api/v1/vendor/payouts/withdraw', ['amount' => '1260000', 'pin' => '1234'])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->postJson('/api/v1/vendor/payouts/withdraw', ['amount' => '1259980', 'pin' => '1234'])->assertOk();

        $tx = $main->transactions()->where('type', 'withdrawal')->sole();
        $this->assertSame(1_259_980_00, $tx->amount);
        $this->assertSame('0123454410', $tx->counterparty['account_number']);
        $this->assertSame(0, $main->refresh()->balance);
    }
}
