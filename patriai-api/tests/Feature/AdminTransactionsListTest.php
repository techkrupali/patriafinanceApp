<?php

namespace Tests\Feature;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Admin → Transactions: money in and out for the filters, status counts, search by owner, direction and period. */
class AdminTransactionsListTest extends TestCase
{
    use RefreshDatabase;

    private function txn(Wallet $w, string $type, string $dir, int $kobo, string $status = 'successful', string $desc = 'x', ?string $at = null): Transaction
    {
        $t = Transaction::create(['wallet_id' => $w->id, 'user_id' => $w->user_id, 'type' => $type, 'direction' => $dir, 'amount' => $kobo, 'fee' => 0, 'balance_after' => 0, 'status' => $status, 'reference' => 'PTX-' . uniqid(), 'description' => $desc]);
        if ($at) {
            $t->forceFill(['created_at' => $at])->save();
        }

        return $t;
    }

    public function test_summary_status_counts_search_direction_and_period(): void
    {
        $ngozi = User::factory()->create(['first_name' => 'Ngozi', 'last_name' => 'Okafor']);
        $kemi = User::factory()->create(['first_name' => 'Kemi', 'last_name' => 'Adebayo']);
        $main = Wallet::create(['user_id' => $ngozi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);
        $kmain = Wallet::create(['user_id' => $kemi->id, 'type' => 'main', 'name' => 'Main', 'balance' => 0]);
        $this->txn($main, 'fund', 'credit', 4_500_000, 'successful', 'Salary');
        $this->txn($main, 'withdrawal', 'debit', 1_000_000, 'successful', 'Rent');
        $this->txn($main, 'withdrawal', 'debit', 500_000, 'failed', 'Shoprite');
        $this->txn($kmain, 'fund', 'credit', 200_000, 'pending', 'Gift');
        $this->txn($kmain, 'fund', 'credit', 900_000, 'successful', 'Old', now()->subDays(40)->toDateTimeString());
        Sanctum::actingAs(User::factory()->create(['role' => 'admin']));

        $d = $this->getJson('/api/v1/admin/transactions')->assertOk()->json('data');
        $this->assertSame(['money_in' => '54000.00', 'money_out' => '10000.00', 'net' => '44000.00'], array_intersect_key($d['summary'], ['money_in' => 1, 'money_out' => 1, 'net' => 1]));
        $this->assertSame(['successful' => 3, 'pending' => 1, 'failed' => 1], $d['summary']['by_status']);

        $f = $this->getJson('/api/v1/admin/transactions?status=failed')->json('data');
        $this->assertSame(['Shoprite'], array_column($f['transactions'], 'description'));
        $this->assertSame(5, $f['summary']['all']);

        $this->assertSame(3, $this->getJson('/api/v1/admin/transactions?search=ngozi okafor')->json('data.pagination.total'));
        $this->assertEqualsCanonicalizing(['Rent', 'Shoprite'], array_column($this->getJson('/api/v1/admin/transactions?direction=debit')->json('data.transactions'), 'description'));
        $this->assertSame(4, $this->getJson('/api/v1/admin/transactions?period=30d')->json('data.pagination.total'));
    }
}
