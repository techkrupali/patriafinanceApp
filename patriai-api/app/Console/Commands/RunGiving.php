<?php

namespace App\Console\Commands;

use App\Services\GivingService;
use Illuminate\Console\Command;

/**
 * Giving dates that fall today, from 7:00 am (GIV-04 "Payments go at 7:00 am so
 * they arrive before service"). Each date is paid once — the schedule row is
 * re-checked under a lock and payments are unique per recipient and date.
 */
class RunGiving extends Command
{
    protected $signature = 'giving:run';

    protected $description = 'Send today\'s giving payments (or ask first, where the giver wants that)';

    public function handle(): int
    {
        $results = collect(GivingService::make()->runDue());
        $this->info("Giving: {$results->where('status', 'paid')->count()} paid, {$results->where('status', 'awaiting')->count()} waiting for a yes, {$results->where('status', 'failed')->count()} failed.");

        return self::SUCCESS;
    }
}
