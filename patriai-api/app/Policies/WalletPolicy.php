<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Wallet;

/**
 * Central authorization rules for wallets. Thin wrappers over the Wallet
 * model's existing access helpers so controllers and future callers share ONE
 * definition of view/manage/spend instead of re-deriving membership checks.
 */
class WalletPolicy
{
    /** Can the user see this wallet at all (owner or any active member)? */
    public function view(User $user, Wallet $wallet): bool
    {
        return $wallet->isAccessibleBy($user);
    }

    /** Can the user administer the wallet (settings, locks)? Owner/co_owner only. */
    public function manage(User $user, Wallet $wallet): bool
    {
        return in_array($wallet->roleOf($user), Wallet::SPENDING_ROLES, true);
    }

    /** Can the user move money OUT of this wallet right now? */
    public function spend(User $user, Wallet $wallet): bool
    {
        return $wallet->canSpend($user);
    }
}
