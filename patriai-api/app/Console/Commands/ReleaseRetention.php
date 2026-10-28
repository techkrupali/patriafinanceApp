<?php

namespace App\Console\Commands;

use App\Services\ProjectSetupService;
use Illuminate\Console\Command;

/** PRW-06 "Held back: 10% until 3 months after handover", then paid to the builder. */
class ReleaseRetention extends Command
{
    protected $signature = 'projects:release-retention';

    protected $description = 'Pay builders the retention held back once its months after handover are up';

    public function handle(): int
    {
        $this->info('Retention released: ' . ProjectSetupService::make()->releaseRetention());

        return self::SUCCESS;
    }
}
