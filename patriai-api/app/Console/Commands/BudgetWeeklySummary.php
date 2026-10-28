<?php

namespace App\Console\Commands;

use App\Services\BudgetService;
use Illuminate\Console\Command;

/** SPD-06 "Weekly summary — Sunday evening" for spending wallets that asked for one. */
class BudgetWeeklySummary extends Command
{
    protected $signature = 'budgets:weekly-summary';

    protected $description = 'Send each spending wallet\'s weekly summary to its owners';

    public function handle(): int
    {
        $this->info('Weekly summaries sent for ' . BudgetService::make()->weeklySummary() . ' wallet(s).');

        return self::SUCCESS;
    }
}
