<?php

namespace App\Console\Commands;

use App\Services\MoneyRequestService;
use Illuminate\Console\Command;

/** REQ-02 "We'll remind him on Thursday": requests due tomorrow. */
class RemindMoneyRequests extends Command
{
    protected $signature = 'requests:remind';

    protected $description = 'Remind payers of money requests due tomorrow';

    public function handle(): int
    {
        $this->info('Reminded ' . MoneyRequestService::make()->remindDue() . ' request(s).');

        return self::SUCCESS;
    }
}
