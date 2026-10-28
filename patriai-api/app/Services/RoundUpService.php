<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\Wallet;

/**
 * SAV-02 "Round-ups: spend ₦4,650, save ₦350 to make it ₦5,000". Spending from a
 * Main wallet adds its round-up to every round-up rule saving from that wallet;
 * the daily automation run moves what has built up. Recording never moves money.
 */
class RoundUpService
{
    public static function make(): self
    {
        return new self();
    }

    /** What rounds $amount up to the next multiple of $step (0 when it's exact). */
    public static function roundUp(int $amount, int $step): int
    {
        return $step > 0 ? ($step - $amount % $step) % $step : 0;
    }

    /**
     * Money left $from as spending. Automation moves (savings, round-up sweeps)
     * and moves between your own wallets aren't spending.
     */
    public function record(Wallet $from, int $amountKobo, ?Wallet $to = null, ?string $description = null): void
    {
        if ($from->type !== 'main' || $amountKobo <= 0) {
            return;
        }
        if ($to && $to->user_id === $from->user_id) {
            return;
        }
        if (str_starts_with((string) $description, 'Automation:')) {
            return;
        }

        AutomationRule::where('from_wallet_id', $from->id)
            ->where('trigger', 'roundup')
            ->where('enabled', true)
            ->get()
            ->each(function (AutomationRule $rule) use ($amountKobo) {
                $up = self::roundUp($amountKobo, (int) $rule->roundup_to);
                if ($up > 0) {
                    $rule->increment('pending_amount', $up);
                }
            });
    }
}
