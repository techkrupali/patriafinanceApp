<?php

namespace App\Console\Commands;

use App\Services\InviteFlowService;
use Illuminate\Console\Command;

/** INV-A1 "Access ends 31 Mar 2027": an accountant's read-only access closes on its date. */
class EndAccess extends Command
{
    protected $signature = 'access:end';

    protected $description = 'End read-only access (accountants) that has passed its date';

    public function handle(): int
    {
        $this->info('Access ended: ' . InviteFlowService::make()->endExpiredAccess());

        return self::SUCCESS;
    }
}
