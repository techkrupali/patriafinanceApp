<?php

namespace Tests\Feature;

use App\Models\AppNotification;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorDirector;
use App\Models\VendorProfile;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A business account from the client prototype (VON-01…10, VDM-01/02/07):
 * business details, the owner's identity, ID, CAC papers, directors (one
 * verifies from an SMS link), proof of address and the business bank account;
 * Patriai checks each item and sends one back; when all are approved the
 * business is verified and shows in the directory (VND-01/02).
 */
class VendorAccountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        Http::fake(function ($request) {
            if (str_contains($request->url(), 'verify-bank-account')) {
                return Http::response(['status' => true, 'data' => ['first_name' => 'ADEYEMI BUILDERS', 'last_name' => 'LIMITED', 'bank_name' => 'GTBank']]);
            }

            return Http::response(['status' => true, 'data' => []]);
        });
    }

    private function builder(): User
    {
        $user = User::factory()->create(['first_name' => 'Tunde', 'last_name' => 'Adeyemi', 'phone' => '+2348050001111']);
        $main = Wallet::create(['user_id' => $user->id, 'type' => 'main', 'name' => 'Main wallet', 'balance' => 0]);
        WalletMember::create(['wallet_id' => $main->id, 'user_id' => $user->id, 'role' => 'owner', 'status' => 'active']);

        return $user;
    }

    private function upload(string $item, ?UploadedFile $file = null)
    {
        return $this->post('/api/v1/vendors/me/documents', ['item' => $item, 'file' => $file ?? UploadedFile::fake()->image("{$item}.jpg")], ['Accept' => 'application/json']);
    }

    /** VDM-01 → VON-07: everything a business sends before "Submit for review". */
    private function signUp(User $tunde): VendorProfile
    {
        Sanctum::actingAs($tunde);
        $this->putJson('/api/v1/vendors/me', [
            'business_name' => 'Adeyemi Builders Ltd',
            'rc_number' => 'rc 1234567',
            'category' => 'building',
            'location' => 'Enugu',
            'areas' => 'Enugu, Nsukka, Lagos',
        ])->assertOk()
            ->assertJsonPath('data.profile.status', 'draft')
            ->assertJsonPath('data.profile.rc_number', 'RC1234567')
            ->assertJsonPath('data.profile.verified', false)
            ->assertJsonPath('data.profile.verification.directors.0.is_owner', true);

        // Not ready yet: everything still to send.
        $this->postJson('/api/v1/vendors/me/submit')->assertStatus(422)->assertJsonValidationErrors('submit');

        $this->postJson('/api/v1/vendors/me/owner', ['bvn' => '22212345678', 'nin' => '12345678901', 'id_type' => 'drivers_licence', 'share_percent' => 70])->assertOk();
        $this->upload('selfie')->assertCreated();
        $this->upload('id_front')->assertCreated();
        $this->upload('id_back')->assertCreated();
        $this->upload('cac_certificate', UploadedFile::fake()->create('cac.pdf', 300, 'application/pdf'))->assertCreated();
        $this->upload('cac_status_report', UploadedFile::fake()->create('status.pdf', 300, 'application/pdf'))->assertCreated();
        $this->postJson('/api/v1/vendors/me/directors', ['name' => 'Bola Adeyemi', 'phone' => '0803 555 0101', 'share_percent' => 30])->assertCreated()
            ->assertJsonPath('data.profile.verification.directors.1.status', 'waiting');
        $this->postJson('/api/v1/vendors/me/address', ['address' => '14 Zik Avenue, Uwani, Enugu'])->assertOk();
        $this->upload('address_proof')->assertCreated();
        $this->postJson('/api/v1/vendors/me/bank', ['account_number' => '0123454410', 'bank_code' => '058'])->assertOk()
            ->assertJsonPath('data.profile.bank.last4', '4410')
            ->assertJsonPath('data.profile.bank.account_name', 'ADEYEMI BUILDERS LIMITED');

        return VendorProfile::where('user_id', $tunde->id)->sole();
    }

    public function test_a_business_is_checked_item_by_item_and_verified(): void
    {
        $tunde = $this->builder();
        $profile = $this->signUp($tunde);

        // BVN and NIN are never sent back, and the files stay private.
        $me = $this->getJson('/api/v1/vendors/me')->assertOk()->json('data.profile');
        $this->assertArrayNotHasKey('owner_bvn', $me);
        $this->assertTrue($me['verification']['has']['bvn']);
        $doc = $profile->documents()->where('item', 'id_front')->sole();
        Storage::disk('local')->assertExists($doc->url);
        Storage::disk('public')->assertMissing($doc->url);

        // The bank account in the business name is approved straight away.
        $this->assertSame('approved', $profile->refresh()->checks['bank']['status']);

        // VON-05: the other director verifies from the SMS link, no app needed.
        $director = VendorDirector::where('name', 'Bola Adeyemi')->sole();
        $token = $director->token;
        $this->get("/d/{$token}")->assertOk()->assertSee('Verify as a director')->assertSee('Adeyemi Builders Ltd');
        $this->post("/d/{$token}", ['bvn' => '123'])->assertSessionHasErrors(['bvn', 'selfie']);
        $this->post("/d/{$token}", ['bvn' => '22298765432', 'selfie' => UploadedFile::fake()->image('me.jpg')])->assertRedirect("/d/{$token}");
        $this->assertSame('submitted', $director->refresh()->status);
        $this->assertNull($director->token);
        $this->get("/d/{$token}")->assertOk()->assertSee('Details sent');
        $this->get("/d/{$token}")->assertOk()->assertSee('This link has been used');
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'vendor_director_verified')->count());

        // VON-09 "Submit for review": every item that isn't approved is now being checked.
        $this->postJson('/api/v1/vendors/me/submit')->assertOk()
            ->assertJsonPath('data.profile.status', 'submitted')
            ->assertJsonPath('data.profile.verification.items.0.status', 'pending');

        // A family can't see an unverified business as payable.
        $family = User::factory()->create();
        Sanctum::actingAs($family);
        $this->getJson('/api/v1/vendors?verified=1')->assertOk()->assertJsonCount(0, 'data.vendors');

        // Admin: approve most, send the proof of address back with a note.
        $admin = User::factory()->create(['role' => 'admin']);
        Sanctum::actingAs($family);
        $this->getJson('/api/v1/admin/vendors')->assertForbidden();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/vendors')->assertOk()->assertJsonPath('data.vendors.0.status', 'submitted');
        $detail = $this->getJson("/api/v1/admin/vendors/{$profile->id}")->assertOk()
            ->assertJsonPath('data.vendor.owner_bvn', '•••••••5678')
            ->assertJsonPath('data.directors.1.status', 'submitted')
            ->json('data');
        // The private files open for an admin only.
        $this->get($detail['documents'][0]['url'])->assertOk();
        $this->get($detail['directors'][1]['selfie_url'])->assertOk();

        foreach (['owner', 'id_document', 'cac', 'directors'] as $item) {
            $this->postJson("/api/v1/admin/vendors/{$profile->id}/review", ['item' => $item, 'approve' => true])->assertOk();
        }
        $this->postJson("/api/v1/admin/vendors/{$profile->id}/review", ['item' => 'address', 'approve' => false])->assertStatus(422);
        $this->postJson("/api/v1/admin/vendors/{$profile->id}/review", ['item' => 'address', 'approve' => false, 'note' => 'NEPA bill is over 3 months old'])->assertOk()
            ->assertJsonPath('data.vendor.status', 'needs_changes');
        $this->assertSame('verified', $director->refresh()->status);
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'vendor_needs_changes')->count());

        // The builder sees what to fix, uploads a new bill, and it's checked again.
        Sanctum::actingAs($tunde);
        $items = collect($this->getJson('/api/v1/vendors/me')->json('data.profile.verification.items'))->keyBy('item');
        $this->assertSame('redo', $items['address']['status']);
        $this->assertSame('NEPA bill is over 3 months old', $items['address']['note']);
        $this->upload('address_proof')->assertCreated();
        $this->assertSame('pending', $profile->refresh()->checks['address']['status']);
        $this->assertFalse($profile->verified);

        // The last item approved: verified, and families can find it.
        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/vendors/{$profile->id}/review", ['item' => 'address', 'approve' => true])->assertOk()
            ->assertJsonPath('data.vendor.status', 'verified')
            ->assertJsonPath('data.vendor.verified', true);
        $this->assertSame(1, AppNotification::where('user_id', $tunde->id)->where('type', 'vendor_verified')->count());

        Sanctum::actingAs($family);
        $this->getJson('/api/v1/vendors?verified=1&category=building&near=nsukka')->assertOk()
            ->assertJsonCount(1, 'data.vendors')
            ->assertJsonPath('data.vendors.0.business_name', 'Adeyemi Builders Ltd')
            ->assertJsonPath('data.vendors.0.initials', 'AB');
        $this->getJson('/api/v1/vendors?category=tiling')->assertOk()->assertJsonCount(0, 'data.vendors');
        // Families never get the full address.
        $this->assertArrayNotHasKey('address', $this->getJson("/api/v1/vendors/{$profile->id}")->assertOk()->json('data.vendor'));
    }

    public function test_the_public_profile_logo_and_past_work(): void
    {
        $tunde = $this->builder();
        $this->signUp($tunde);

        // VDM-07: what families see.
        $this->putJson('/api/v1/vendors/me', ['bio' => 'Family builders since 2014.', 'services' => ['New buildings', 'Renovation', 'Roofing'], 'since_year' => 2014])->assertOk()
            ->assertJsonPath('data.profile.services.2', 'Roofing');
        $this->post('/api/v1/vendors/me/logo', ['file' => UploadedFile::fake()->image('logo.png')], ['Accept' => 'application/json'])->assertOk();
        $this->post('/api/v1/vendors/me/past-work', ['file' => UploadedFile::fake()->image('duplex.jpg'), 'caption' => 'Duplex, Enugu'], ['Accept' => 'application/json'])->assertCreated();
        $this->post('/api/v1/vendors/me/past-work', ['file' => UploadedFile::fake()->image('roof.jpg'), 'caption' => 'Roof, Awka'], ['Accept' => 'application/json'])->assertCreated();
        $profile = $this->deleteJson('/api/v1/vendors/me/past-work/0')->assertOk()->json('data.profile');
        $this->assertSame(['Roof, Awka'], array_column($profile['past_work'], 'caption'));
        $this->assertStringContainsString('/storage/vendor-logos/', $profile['logo_url']);

        // A badge can't be set by the business itself.
        $this->putJson('/api/v1/vendors/me', ['verified' => true])->assertOk()->assertJsonPath('data.profile.verified', false);

        // VDM-06: automatic withdrawal can be turned off.
        $this->patchJson('/api/v1/vendors/me/payouts', ['auto_withdraw' => false])->assertOk()->assertJsonPath('data.payouts.auto_withdraw', false)
            ->assertJsonPath('data.payouts.account.last4', '4410');
    }

    public function test_a_family_invite_by_phone_is_linked_when_the_business_signs_up(): void
    {
        config(['app.debug' => true]);
        $ngozi = User::factory()->create(['last_name' => 'Eze']);
        $wallet = Wallet::create(['user_id' => $ngozi->id, 'type' => 'project', 'name' => 'House', 'balance' => 0]);
        $project = Project::create(['owner_id' => $ngozi->id, 'wallet_id' => $wallet->id, 'title' => 'Our house in Enugu', 'budget' => 100_000_000, 'status' => 'active', 'meta' => ['vendor_invite' => '+2348034127790']]);

        // VON-01 "use the same phone number they invited, and we'll link it".
        $code = $this->postJson('/api/v1/auth/phone/start', ['phone' => '+2348034127790', 'channel' => 'sms'])->assertOk()->json('data.debug_otp');
        $token = $this->postJson('/api/v1/auth/phone/verify', ['phone' => '+2348034127790', 'code' => $code])->assertOk()->json('data.phone_token');
        $this->postJson('/api/v1/auth/phone/register', [
            'phone_token' => $token, 'first_name' => 'Tunde', 'last_name' => 'Adeyemi', 'email' => 'tunde@example.com', 'date_of_birth' => '1980-01-01', 'pin' => '482915',
        ])->assertCreated();

        $tunde = User::where('phone', '+2348034127790')->sole();
        $project->refresh();
        $this->assertSame($tunde->id, $project->vendor_id);
        $this->assertSame('invited', $project->vendor_status);
        $this->assertArrayNotHasKey('vendor_invite', $project->meta);
    }
}
