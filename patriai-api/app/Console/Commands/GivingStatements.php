<?php

namespace App\Console\Commands;

use App\Services\GivingService;
use Illuminate\Console\Command;

/** GIV-06 "Yearly giving statement — every January", by email, for the year before. */
class GivingStatements extends Command
{
    protected $signature = 'giving:statements {year? : The year to report (default: last year)}';

    protected $description = 'Email each giver their yearly giving statement';

    public function handle(): int
    {
        $year = (int) ($this->argument('year') ?: now()->subYear()->year);
        $this->info("{$year} statements sent: " . GivingService::make()->sendStatements($year));

        return self::SUCCESS;
    }
}
