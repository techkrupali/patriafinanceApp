<?php

namespace App\Console\Commands;

use App\Models\ApprovalRequest;
use Illuminate\Console\Command;

/**
 * Sweep pending approval requests whose expiry window has passed and mark them
 * 'expired'. Runs hourly (registered in bootstrap/app.php). This complements the
 * inline expiry guard in ApprovalService::respond so stale requests are cleaned up
 * even if no approver ever acts on them.
 */
class ExpireApprovals extends Command
{
    protected $signature = 'approvals:expire';

    protected $description = 'Mark pending approval requests whose expiry has passed as expired';

    public function handle(): int
    {
        $count = ApprovalRequest::where('status', 'pending')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired']);

        $this->info("Expired {$count} approval request(s).");

        return self::SUCCESS;
    }
}
