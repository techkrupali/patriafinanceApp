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
            'child.scope' => \App\Http\Middleware\ChildScope::class,
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
        // REQ-02: the day before a money request is due.
        $schedule->command('requests:remind')->dailyAt('09:00')->timezone('Africa/Lagos');

        // Accrue overdue-loan penalties and notify borrowers once a day.
        $schedule->command('loans:accrue-overdue')->dailyAt('00:05');

        // Reconcile wallet balances against the banking ledger every half hour.
        $schedule->command('banking:reconcile')->everyThirtyMinutes();

        // A spending wallet's new period: move the leftover before the top-up runs
        // (same minute, registered first, so it runs first).
        $schedule->command('budgets:roll')->dailyAt('00:00');
        // PLN-02/03: trial reminders, renewals, grace days.
        $schedule->command('plans:renew')->hourly()->withoutOverlapping();

        // Run due automation rules (scheduled auto-transfers). Idempotent per period,
        // so an hourly cadence safely fires daily/weekly/monthly rules.
        $schedule->command('automations:run')->hourly();
        // SND-14: scheduled and repeat payments, close to the time they were set for.
        $schedule->command('payments:run-scheduled')->everyFiveMinutes()->withoutOverlapping();

        // SPD-06 weekly summary, Sunday evening.
        $schedule->command('budgets:weekly-summary')->weeklyOn(0, '18:00')->timezone('Africa/Lagos');

        // Giving dates go at 7:00 am Nigeria time; hourly after that catches a missed tick.
        $schedule->command('giving:run')->hourly()->between('07:00', '20:00')->timezone('Africa/Lagos');
        // Ajo circles: open rounds, take payments, add late fees and pay turns (AJO-03/04).
        $schedule->command('ajo:run')->hourly()->between('07:00', '20:00')->timezone('Africa/Lagos');
        // INV-A1: an accountant's access ends on its date.
        $schedule->command('access:end')->dailyAt('00:30')->timezone('Africa/Lagos');
        // FAM-12: a circle hand-over takes effect 24 hours after it's accepted.
        $schedule->call(fn () => \App\Services\CircleService::make()->settleAll())->name('circles:settle')->hourly();
        // Thanksgiving reminders on Saturday evening; statements on 2 January.
        $schedule->command('giving:remind')->weeklyOn(6, '17:00')->timezone('Africa/Lagos');
        $schedule->command('giving:statements')->yearlyOn(1, 2, '08:00')->timezone('Africa/Lagos');

        // Goals that pay the school directly (from 7:00 am), and save reminders two days ahead.
        $schedule->command('goals:pay')->hourly()->between('07:00', '20:00')->timezone('Africa/Lagos');
        $schedule->command('goals:remind')->dailyAt('09:00')->timezone('Africa/Lagos');

        // Joint wallets: notice periods, the Sunday-evening summary and the statement on the 1st.
        $schedule->command('joint:run')->dailyAt('18:00')->timezone('Africa/Lagos');

        // Projects: retention held back after handover goes to the builder when it's due.
        $schedule->command('projects:release-retention')->dailyAt('09:00')->timezone('Africa/Lagos');
        // A builder who declined said when they could start; the family is reminded that month.
        $schedule->command('projects:reinvite-reminders')->dailyAt('09:00')->timezone('Africa/Lagos');
        // Disputes the builder didn't answer within 3 days go to Patriai.
        $schedule->command('disputes:escalate-overdue')->hourly();

        // Monthly "time to save" reminders on each wallet's chosen day (WCR-11).
        $schedule->command('wallets:remind-savers')->dailyAt('09:00');
        // AUT-11: "2 days before" reminders, and the late check a week after reminder day.
        $schedule->call(fn () => \App\Services\ContributionRulesService::make()->runDaily())->name('contributions:daily')->dailyAt('09:05');
    })->create();
