<?php

namespace App\Console\Commands;

use App\Models\Wallet;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * WCR-11 "Remind members on the 25th": on a wallet's reminder day, tell everyone
 * who saves into it (owner, co-owners, contributors) how much to add this month
 * to reach the target on time. Runs daily; sends at most once per wallet a month.
 */
class RemindSavers extends Command
{
    protected $signature = 'wallets:remind-savers';

    protected $description = 'Send the monthly save reminder for wallets whose reminder day is today';

    public function handle(NotificationService $notifications): int
    {
        $today = now();
        $period = $today->format('Y-m');
        $sent = 0;

        Wallet::with(['members' => fn ($q) => $q->where('status', 'active')->with('user'), 'owner'])
            ->where('status', 'active')
            ->whereNotNull('meta')
            ->chunkById(200, function ($wallets) use ($today, $period, $notifications, &$sent) {
                foreach ($wallets as $wallet) {
                    if ($wallet->reminderDay() !== $today->day || ($wallet->meta['reminded_period'] ?? null) === $period) {
                        continue;
                    }
                    if ($wallet->target_amount && $wallet->balance >= $wallet->target_amount) {
                        continue;
                    }

                    $savers = $wallet->members
                        ->filter(fn ($m) => in_array($m->role, ['owner', 'co_owner', 'admin', 'contributor'], true))
                        ->pluck('user')
                        ->push($wallet->owner)
                        ->filter()
                        ->unique('id')
                        ->values();

                    $body = $this->message($wallet, $savers->count());
                    foreach ($savers as $user) {
                        $notifications->push($user, 'savings_reminder', "Time to save for {$wallet->name}", $body, ['wallet_id' => $wallet->id]);
                        $sent++;
                    }

                    $wallet->update(['meta' => array_merge($wallet->meta ?? [], ['reminded_period' => $period])]);
                }
            });

        $this->info("Sent {$sent} save reminder(s).");

        return self::SUCCESS;
    }

    /** "Add about ₦94,500 this month to reach ₦850,000 by 8 Jan." */
    private function message(Wallet $wallet, int $savers): string
    {
        $naira = fn (int $kobo) => '₦' . number_format($kobo / 100);

        if (!$wallet->target_amount) {
            return "Your monthly reminder to add to {$wallet->name}.";
        }

        $remaining = $wallet->target_amount - $wallet->balance;
        if (!$wallet->target_date || $wallet->target_date->isPast()) {
            return "{$wallet->name} needs {$naira($remaining)} more to reach {$naira($wallet->target_amount)}. Add what you can this month.";
        }

        $months = max(1, (int) ceil(now()->diffInDays($wallet->target_date) / 30.44));
        // Round up to the nearest ₦100, like the plan shown when the wallet was made.
        $each = (int) (ceil($remaining / $months / max(1, $savers) / 10000) * 10000);

        return "Add about {$naira($each)} this month to reach {$naira($wallet->target_amount)} by {$wallet->target_date->format('j M')}.";
    }
}
