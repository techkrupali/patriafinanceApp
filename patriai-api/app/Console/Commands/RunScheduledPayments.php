<?php

namespace App\Console\Commands;

use App\Services\ScheduledPaymentService;
use Illuminate\Console\Command;

/** SND-14: scheduled and repeat payments whose time has come. */
class RunScheduledPayments extends Command
{
    protected $signature = 'payments:run-scheduled';

    protected $description = 'Send scheduled and repeat payments that are due';

    public function handle(): int
    {
        $ran = ScheduledPaymentService::make()->runDue();
        $this->info('Ran ' . count($ran) . ' scheduled payment(s).');

        return self::SUCCESS;
    }
}
