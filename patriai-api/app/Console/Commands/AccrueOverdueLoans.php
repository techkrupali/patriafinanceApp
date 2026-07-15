<?php

namespace App\Console\Commands;

use App\Services\LoanService;
use Illuminate\Console\Command;

/**
 * Sweep active loans for overdue installments: mark rows 'overdue', accrue the
 * daily late penalty, and notify affected borrowers. Runs daily (registered in
 * bootstrap/app.php). Delegates all money/state changes to LoanService::accrueOverdue.
 */
class AccrueOverdueLoans extends Command
{
    protected $signature = 'loans:accrue-overdue';

    protected $description = 'Mark overdue loan installments, accrue late penalties, and notify borrowers';

    public function handle(): int
    {
        $result = LoanService::make()->accrueOverdue();

        $this->info(
            "Processed {$result['loans_processed']} loan(s); penalised {$result['loans_penalized']}; charged ₦{$result['penalty_charged']}."
        );

        return self::SUCCESS;
    }
}
