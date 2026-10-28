<?php

namespace App\Services;

use App\Models\CharityDonation;
use App\Models\Organisation;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Str;

/**
 * What a wallet's own rules add when money leaves it — on a direct spend and
 * again when an approved request executes:
 *  - spending wallets: the budget (category allowed, daily, category and total
 *    limits — over one an owner approves or it stops), then the payment is tagged
 *    and alerts go out (BudgetService)
 *  - locked savings broken early: the early-break fee (SAV-05 "5% of the amount
 *    is kept as a fee"), half to the charity the saver picked (BRK-01/04)
 *  - joint wallets: over what one partner may spend alone, to a new account or
 *    out to a personal wallet, the other says yes; afterwards both hear (JointService)
 * Amounts are kobo.
 */
class SpendRules
{
    /** SAV-05: the early-break fee, and the charity's share of it. */
    public const EARLY_BREAK_FEE_PERCENT = 5;

    public const CHARITY_SHARE_PERCENT = 50;

    public function __construct(
        private readonly BudgetService $budgets,
        private readonly WalletService $wallets,
    ) {}

    public static function make(): self
    {
        return new self(BudgetService::make(), WalletService::make());
    }

    /**
     * Before: may throw (category not allowed, or over a "stop" limit). $to is
     * where it goes, for the joint checks: {kind: bank, account_number} |
     * {kind: wallet, wallet_id} | {kind: user, user_id}.
     *
     * @return array{category_id: ?int, over: ?string, fee: int, net: int}
     */
    public function plan(Wallet $from, User $user, int $amount, ?int $categoryId, bool $approved = false, ?array $to = null): array
    {
        $budget = $this->budgets->check($from, $user, $amount, $categoryId, $approved);
        if (!$approved && $budget['over'] === null) {
            $budget['over'] = JointService::make()->check($from, $user, $amount, $to);
        }
        $fee = $this->earlyBreakFee($from, $amount);

        return $budget + ['fee' => $fee, 'net' => $amount - $fee];
    }

    /** After the money left (reference of its debit): tag it, take the fee, send alerts. */
    public function settle(Wallet $from, User $user, ?string $reference, array $plan): void
    {
        if (($plan['fee'] ?? 0) > 0) {
            $this->chargeEarlyBreak($from, $user, (int) $plan['fee']);
        }
        try {
            $this->budgets->recorded($from, $reference, $plan['category_id'] ?? null);
            JointService::make()->paid($from, $user, (int) ($plan['net'] ?? 0), $reference);
        } catch (\Throwable $e) {
            report($e); // never undo a payment that already left
        }
    }

    /** SAV-05: taking money out of locked savings before they open costs the fee. */
    public function earlyBreakFee(Wallet $wallet, int $amount): int
    {
        if (!in_array($wallet->type, SavingsService::TYPES, true) || !$wallet->isGoalLocked()) {
            return 0;
        }
        $percent = (int) ($wallet->meta['lock']['fee_percent'] ?? 0);

        return $percent > 0 ? (int) round($amount * $percent / 100) : 0;
    }

    /** The charity the saver picked for half the fee, if it's still listed. */
    public function charityFor(Wallet $wallet): ?Organisation
    {
        $id = $wallet->meta['lock']['charity_id'] ?? null;

        return $id ? Organisation::where('id', $id)->where('active', true)->first() : null;
    }

    /** BRK-04: the fee leaves the wallet; the charity's half is owed to it, with a receipt. */
    private function chargeEarlyBreak(Wallet $wallet, User $user, int $fee): void
    {
        $charity = $this->charityFor($wallet);
        $txn = $this->wallets->debit($wallet, $fee, 0, 'fee', array_filter([
            'kind' => 'early_break_fee',
            'charity' => $charity?->name,
        ]), 'Early-break fee (' . ($wallet->meta['lock']['fee_percent'] ?? self::EARLY_BREAK_FEE_PERCENT) . '%)', $user->id);

        if ($charity) {
            $initials = collect(preg_split('/\s+/', $charity->name))->take(2)->map(fn ($w) => Str::upper(Str::substr($w, 0, 1)))->join('');
            CharityDonation::create([
                'organisation_id' => $charity->id,
                'user_id' => $user->id,
                'wallet_id' => $wallet->id,
                'transaction_id' => $txn->id,
                'amount' => intdiv($fee * self::CHARITY_SHARE_PERCENT, 100),
                'receipt_no' => $initials . '-' . now()->format('Y') . '-' . random_int(1000, 9999),
            ]);
        }
    }
}
