<?php

namespace App\Console\Commands;

use App\Services\DisputeService;
use Illuminate\Console\Command;

/**
 * VDM-08 "Answer within 3 days. If you don't, Patriai may decide using the
 * family's evidence." Also a late agreed fix: remind both sides, then Patriai
 * steps in two days on.
 */
class EscalateOverdueDisputes extends Command
{
    protected $signature = 'disputes:escalate-overdue';

    protected $description = 'Send milestone disputes the builder did not answer, or fix, in time to Patriai';

    public function handle(): int
    {
        $this->info('Disputes sent to Patriai: ' . DisputeService::make()->escalateOverdue());
        $this->info('Late fixes reminded or sent to Patriai: ' . DisputeService::make()->fixOverdue());

        return self::SUCCESS;
    }
}
