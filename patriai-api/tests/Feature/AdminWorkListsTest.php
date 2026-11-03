<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\Loan;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin → Approvals, Loans, Projects, Vendors and Disputes: the summaries above each list and search on any database. */
class AdminWorkListsTest extends TestCase
{
    use RefreshDatabase;

    private function loan(User $user, string $status, int $outstanding, string $category = 'rent'): Loan
    {
        return Loan::create([
            'reference' => Loan::generateReference(), 'user_id' => $user->id, 'category' => $category,
            'principal' => 100_000_00, 'interest_bps' => 500, 'fee' => 0, 'total_repayable' => 105_000_00,
            'outstanding' => $outstanding, 'penalty_accrued' => 0, 'tenor_days' => 30, 'repayment_frequency' => 'once',
            'status' => $status, 'disbursed_at' => in_array($status, ['active', 'defaulted', 'repaid'], true) ? now()->subDays(3) : null,
        ]);
    }

    public function test_work_list_summaries_and_search(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor']);
        $tunde = User::factory()->create(['first_name' => 'Tunde', 'last_name' => 'Adeyemi']);
        $shared = Wallet::create(['user_id' => $ngozi->id, 'type' => 'shared', 'name' => 'Family pot', 'balance' => 0]);
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        // Approvals
        foreach ([['pending', 15_000_00], ['executed', 40_000_00], ['rejected', 5_000_00]] as [$status, $amount]) {
            ApprovalRequest::create(['wallet_id' => $shared->id, 'initiator_id' => $ngozi->id, 'action' => 'transfer_bank', 'amount' => $amount, 'fee' => 0, 'required_approvals' => 2, 'approvals_count' => 1, 'status' => $status, 'payload' => [], 'expires_at' => now()->addHours(5)]);
        }
        $a = $this->getJson('/api/v1/admin/approvals?search=family')->assertOk()->json('data');
        $this->assertSame(3, $a['pagination']['total']);
        $this->assertSame(['pending_all' => 1, 'pending_amount' => '15000.00', 'expiring_24h' => 1, 'executed_30d' => 1, 'executed_30d_amount' => '40000.00'], array_intersect_key($a['summary'], array_flip(['pending_all', 'pending_amount', 'expiring_24h', 'executed_30d', 'executed_30d_amount'])));
        $this->assertSame(0, $this->getJson('/api/v1/admin/approvals?search=nobody')->json('data.pagination.total'));

        // Loans
        $this->loan($ngozi, 'active', 60_000_00);
        $this->loan($tunde, 'defaulted', 20_000_00, 'business');
        $this->loan($tunde, 'pending', 105_000_00);
        $l = $this->getJson('/api/v1/admin/loans?search=adeyemi')->assertOk()->json('data');
        $this->assertSame(2, $l['pagination']['total']);
        $this->assertSame(['outstanding' => '80000.00', 'live' => 2, 'waiting' => 1, 'defaulted' => 1, 'defaulted_amount' => '20000.00'], array_intersect_key($l['summary'], array_flip(['outstanding', 'live', 'waiting', 'defaulted', 'defaulted_amount'])));
        $this->assertSame(['pending' => 1, 'defaulted' => 1], array_filter($l['summary']['by_status']));
        $this->assertSame(1, $this->getJson('/api/v1/admin/loans?category=business')->json('data.pagination.total'));

        // Projects
        $escrow = Wallet::create(['user_id' => $ngozi->id, 'type' => 'project', 'name' => 'House', 'balance' => 500_000_00]);
        $house = Project::create(['owner_id' => $ngozi->id, 'vendor_id' => $tunde->id, 'wallet_id' => $escrow->id, 'title' => 'Our house in Enugu', 'budget' => 2_000_000_00, 'status' => 'active']);
        Milestone::create(['project_id' => $house->id, 'sequence' => 1, 'title' => 'Foundation', 'amount' => 300_000_00, 'status' => 'released']);
        Milestone::create(['project_id' => $house->id, 'sequence' => 2, 'title' => 'Walls', 'amount' => 400_000_00, 'status' => 'submitted']);
        $p = $this->getJson('/api/v1/admin/projects?search=adeyemi')->assertOk()->json('data');
        $this->assertSame(1, $p['pagination']['total']);
        $this->assertSame(['milestones_count' => 2, 'milestones_released' => 1, 'milestones_submitted' => 1], array_intersect_key($p['projects'][0], array_flip(['milestones_count', 'milestones_released', 'milestones_submitted'])));
        $this->assertSame(['in_escrow' => '500000.00', 'released' => '300000.00', 'proof_waiting' => 1], array_intersect_key($p['summary'], array_flip(['in_escrow', 'released', 'proof_waiting'])));

        // Vendors
        VendorProfile::create(['user_id' => $tunde->id, 'business_name' => 'Adeyemi Builders Ltd', 'category' => 'building', 'location' => 'Enugu', 'verified' => false, 'status' => 'submitted', 'submitted_at' => now()->subDay(), 'auto_withdraw' => false]);
        $v = $this->getJson('/api/v1/admin/vendors?q=tunde&category=building')->assertOk()->json('data');
        $this->assertSame(1, $v['pagination']['total']);
        $this->assertSame(['building' => 1], $v['summary']['by_category']);
        $this->assertNotNull($v['summary']['oldest_waiting_at']);
        $this->assertSame(1, $v['summary']['projects_active']);

        // Disputes: summary is there even with none.
        $d = $this->getJson('/api/v1/admin/disputes?status=active&search=house')->assertOk()->json('data');
        $this->assertSame(['all' => 0, 'active' => 0, 'on_hold' => '0.00', 'overdue' => 0], array_intersect_key($d['summary'], array_flip(['all', 'active', 'on_hold', 'overdue'])));
    }
}
