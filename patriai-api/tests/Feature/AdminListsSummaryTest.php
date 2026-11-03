<?php

namespace Tests\Feature;

use App\Models\KycSubmission;
use App\Models\SupportRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin → Users, KYC and Support: the summaries above each list and search that works on any database. */
class AdminListsSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_kyc_and_support_summaries(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor', 'kyc_tier' => 0]);
        $emeka = User::factory()->create(['first_name' => 'Emeka', 'last_name' => 'Okafor', 'kyc_tier' => 2]);
        $kemi = User::factory()->create(['first_name' => 'Kemi', 'last_name' => 'Adebayo', 'kyc_tier' => 1]);
        $kemi->forceFill(['status' => 'suspended'])->save();
        KycSubmission::create(['user_id' => $ngozi->id, 'target_tier' => 1, 'type' => 'personal', 'payload' => ['bvn' => '22222222222'], 'status' => 'pending']);
        KycSubmission::create(['user_id' => $emeka->id, 'target_tier' => 3, 'type' => 'personal', 'payload' => [], 'status' => 'pending']);
        SupportRequest::create(['user_id' => $ngozi->id, 'subject' => 'Transfer stuck', 'description' => 'My transfer is pending', 'category' => 'transfer', 'priority' => 'high', 'status' => 'pending']);
        SupportRequest::create(['user_id' => $kemi->id, 'subject' => 'Change my phone', 'description' => 'New number', 'category' => 'account', 'priority' => 'low', 'status' => 'resolved']);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $u = $this->getJson('/api/v1/admin/users?search=okafor')->assertOk()->json('data');
        $this->assertSame(2, $u['pagination']['total']);
        $this->assertSame(['total' => 3, 'active' => 2, 'suspended' => 1, 'verified' => 2], array_intersect_key($u['summary'], ['total' => 1, 'active' => 1, 'suspended' => 1, 'verified' => 1]));
        $this->assertSame(1, $this->getJson('/api/v1/admin/users?tier=2')->json('data.pagination.total'));

        $k = $this->getJson('/api/v1/admin/kyc?status=pending')->assertOk()->json('data');
        $this->assertSame(['pending' => 2, 'approved' => 0, 'rejected' => 0], $k['summary']['by_status']);
        $this->assertSame('Ngozi Okafor', $k['submissions'][0]['user']['name']);
        $this->assertSame('Tier 3', $k['submissions'][1]['tier_name']);
        $this->assertSame(1, $this->getJson('/api/v1/admin/kyc?search=emeka')->json('data.pagination.total'));

        $s = $this->getJson('/api/v1/admin/support-requests?search=transfer')->assertOk()->json('data');
        $this->assertSame(1, $s['pagination']['total']);
        $this->assertSame(['open' => 1, 'open_high' => 1], array_intersect_key($s['summary'], ['open' => 1, 'open_high' => 1]));
    }
}
