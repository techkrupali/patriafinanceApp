<?php

namespace App\Console\Commands;

use App\Services\VendorProjectService;
use Illuminate\Console\Command;

/** PRJ-12 "Remind me to re-invite Adeyemi in March": the family hears on the month the builder suggested. */
class ReinviteReminders extends Command
{
    protected $signature = 'projects:reinvite-reminders';

    protected $description = 'Remind families to re-invite a builder who declined, on the month they suggested';

    public function handle(): int
    {
        $this->info('Reminders sent: ' . VendorProjectService::make()->sendReinviteReminders());

        return self::SUCCESS;
    }
}
