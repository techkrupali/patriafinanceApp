<?php

namespace App\Console\Commands;

use App\Services\PlanService;
use Illuminate\Console\Command;

/** PLN-02/03: trial reminders, renewals, the grace days and going back to Free. */
class RenewPlans extends Command
{
    protected $signature = 'plans:renew';

    protected $description = 'Remind before trials end, take renewals, and end cancelled or unpaid subscriptions';

    public function handle(): int
    {
        $r = PlanService::make()->run();
        $this->info("Reminded {$r['reminded']}, renewed {$r['renewed']}, failed {$r['failed']}, ended {$r['ended']}");

        return self::SUCCESS;
    }
}
