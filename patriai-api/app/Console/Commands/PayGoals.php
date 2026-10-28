<?php

namespace App\Console\Commands;

use App\Services\GoalService;
use Illuminate\Console\Command;

/** GLW-05 "Pay the school directly — sends ₦850,000 to Greenfield School on 6 Jan", from 7:00 am. */
class PayGoals extends Command
{
    protected $signature = 'goals:pay';

    protected $description = 'Pay goals that pay someone directly on their day';

    public function handle(): int
    {
        $results = collect(GoalService::make()->runPayouts());
        $this->info("Goals: {$results->where('status', 'paid')->count()} paid, {$results->where('status', 'short')->count()} short.");

        return self::SUCCESS;
    }
}
