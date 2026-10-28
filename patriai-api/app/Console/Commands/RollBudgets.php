<?php

namespace App\Console\Commands;

use App\Services\BudgetService;
use Illuminate\Console\Command;

/**
 * A spending wallet's new week or month began: what's left stays, goes back to
 * Main or moves to the chosen wallet (SPD-02). Idempotent per period; runs just
 * before automations:run so the top-up sees the emptied wallet.
 */
class RollBudgets extends Command
{
    protected $signature = 'budgets:roll';

    protected $description = 'Start each spending wallet\'s new budget period and move what was left over';

    public function handle(): int
    {
        $results = BudgetService::make()->roll();
        $moved = collect($results)->whereNotNull('moved')->count();
        $this->info('Budgets: ' . count($results) . " new period(s), {$moved} with a leftover moved.");

        return self::SUCCESS;
    }
}
