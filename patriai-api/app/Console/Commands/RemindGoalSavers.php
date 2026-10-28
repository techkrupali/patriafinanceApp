<?php

namespace App\Console\Commands;

use App\Services\GoalService;
use Illuminate\Console\Command;

/** GLW-04 "2 days before each save": a heads-up to everyone whose save is due. */
class RemindGoalSavers extends Command
{
    protected $signature = 'goals:remind';

    protected $description = 'Remind goal savers two days before their save';

    public function handle(): int
    {
        $this->info('Goal reminders sent: ' . GoalService::make()->remindBeforeSaves());

        return self::SUCCESS;
    }
}
