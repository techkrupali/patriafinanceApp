<?php

namespace App\Console\Commands;

use App\Services\JointService;
use Illuminate\Console\Command;

/** JNT-04/05: notice periods that ended, the Sunday summary and the statement on the 1st. */
class RunJointWallets extends Command
{
    protected $signature = 'joint:run';

    protected $description = 'Joint wallets: end notice periods, send weekly summaries and monthly statements';

    public function handle(): int
    {
        $done = JointService::make()->runDaily();
        $this->info("Joint wallets: {$done['left']} left, {$done['summaries']} summaries, {$done['statements']} statements.");

        return self::SUCCESS;
    }
}
