<?php

namespace App\Console\Commands;

use App\Services\AutomationService;
use Illuminate\Console\Command;

/**
 * Fire every enabled automation rule that is due this period (recurring
 * auto-transfers between a user's own wallets). Delegates all money/idempotency
 * handling to AutomationService::runDue — each rule is guarded by a FOR UPDATE
 * re-check of last_run_period, so re-running this command within the same period
 * moves no money twice. Intended to run hourly (registered in bootstrap/app.php).
 */
class RunAutomations extends Command
{
    protected $signature = 'automations:run';

    protected $description = 'Execute due automation rules (scheduled auto-transfers between a user\'s own wallets)';

    public function handle(): int
    {
        $results = AutomationService::make()->runDue();

        $ran = collect($results)->where('status', 'ran')->count();
        $skipped = collect($results)->where('status', 'skipped')->count();
        $errors = collect($results)->where('status', 'error')->count();

        $this->info("Automations: {$ran} ran, {$skipped} skipped, {$errors} error(s) from " . count($results) . ' due rule(s).');

        return self::SUCCESS;
    }
}
