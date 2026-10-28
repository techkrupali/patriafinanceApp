<?php

namespace App\Console\Commands;

use App\Services\GivingService;
use Illuminate\Console\Command;

/** GIV-04 "Thanksgiving and special Sundays — remind me to add a one-off". Saturdays. */
class GivingReminders extends Command
{
    protected $signature = 'giving:remind';

    protected $description = 'Remind givers to add a one-off for a thanksgiving or special Sunday';

    public function handle(): int
    {
        $this->info('Reminders sent: ' . GivingService::make()->remindThanksgiving());

        return self::SUCCESS;
    }
}
