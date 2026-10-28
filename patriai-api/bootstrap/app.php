<?php

use App\Http\Middleware\EnsureAdmin;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'admin' => EnsureAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // API consumers always get JSON, even without an Accept header.
        $exceptions->shouldRenderJsonWhen(
            fn ($request) => $request->is('api/*') || $request->expectsJson()
        );
    })
    ->withSchedule(function (Schedule $schedule) {
        // Sweep stale pending approval requests into 'expired' once an hour.
        $schedule->command('approvals:expire')->hourly();

        // Accrue overdue-loan penalties and notify borrowers once a day.
        $schedule->command('loans:accrue-overdue')->dailyAt('00:05');

        // Reconcile wallet balances against the banking ledger every half hour.
        $schedule->command('banking:reconcile')->everyThirtyMinutes();

        // A spending wallet's new period: move the leftover before the top-up runs
        // (same minute, registered first, so it runs first).
        $schedule->command('budgets:roll')->dailyAt('00:00');

        // Run due automation rules (scheduled auto-transfers). Idempotent per period,
        // so an hourly cadence safely fires daily/weekly/monthly rules.
        $schedule->command('automations:run')->hourly();

        // SPD-06 weekly summary, Sunday evening.
        $schedule->command('budgets:weekly-summary')->weeklyOn(0, '18:00')->timezone('Africa/Lagos');

        // Giving dates go at 7:00 am Nigeria time; hourly after that catches a missed tick.
        $schedule->command('giving:run')->hourly()->between('07:00', '20:00')->timezone('Africa/Lagos');
        // Thanksgiving reminders on Saturday evening; statements on 2 January.
        $schedule->command('giving:remind')->weeklyOn(6, '17:00')->timezone('Africa/Lagos');
        $schedule->command('giving:statements')->yearlyOn(1, 2, '08:00')->timezone('Africa/Lagos');

        // Monthly "time to save" reminders on each wallet's chosen day (WCR-11).
        $schedule->command('wallets:remind-savers')->dailyAt('09:00');
    })->create();
