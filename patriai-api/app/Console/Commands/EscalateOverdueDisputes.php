<?php

namespace App\Console\Commands;

use App\Services\DisputeService;
use Illuminate\Console\Command;

/** VDM-08 "Answer within 3 days. If you don't, Patriai may decide using the family's evidence." */
class EscalateOverdueDisputes extends Command
{
    protected $signature = 'disputes:escalate-overdue';

    protected $description = 'Send milestone disputes the builder did not answer in time to Patriai';

    public function handle(): int
    {
        $this->info('Disputes sent to Patriai: ' . DisputeService::make()->escalateOverdue());

        return self::SUCCESS;
    }
}
