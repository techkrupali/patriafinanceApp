<?php

namespace App\Console\Commands;

use App\Services\AjoService;
use Illuminate\Console\Command;

/**
 * Ajo circles from 7:00 am: each round opens on its due day and payments go
 * from Main; late fees after a few days; each turn is paid on its payout day.
 * Safe to run every hour — rows are unique per round and turns are paid under
 * a lock.
 */
class RunAjo extends Command
{
    protected $signature = 'ajo:run';

    protected $description = 'Open ajo rounds, take payments, add late fees and pay out turns';

    public function handle(): int
    {
        $results = collect(AjoService::make()->runDue());
        $this->info("Ajo: {$results->count()} circles, {$results->sum('paid')} payments, {$results->sum('late')} late, {$results->sum('payouts')} turns paid.");

        return self::SUCCESS;
    }
}
