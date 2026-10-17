<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Guided wallet creation (client: "wallet creation should be a process that
 * guides users through the creation journey for each type of wallet"). One call
 * creates the wallet with its type-specific purpose, applies emergency access
 * rules, moves the initial deposit from the chosen funding source and sets up
 * monthly auto-funding — all in one transaction, so a failed step (e.g. not
 * enough money in the source) leaves nothing half-created. Amounts are kobo.
 */
class WalletSetupService
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly EmergencyService $emergency,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), EmergencyService::make());
    }

    /**
     * $data keys: type, name, description?, target_amount?, purpose?,
     * initial_deposit?, source_wallet_id?, monthly_amount?, monthly_day?, emergency?
     */
    public function create(User $user, array $data): Wallet
    {
        $deposit = (int) ($data['initial_deposit'] ?? 0);
        $monthly = (int) ($data['monthly_amount'] ?? 0);
        $source = ($deposit > 0 || $monthly > 0) ? $this->resolveSource($user, $data['source_wallet_id'] ?? null, $deposit) : null;

        $wallet = DB::transaction(function () use ($user, $data, $deposit, $monthly, $source) {
            $opts = array_filter([
                'description' => $data['description'] ?? null,
                'target_amount' => $data['target_amount'] ?? null,
                'meta' => !empty($data['purpose']) ? ['purpose' => $data['purpose']] : null,
            ], fn ($v) => $v !== null);

            $wallet = $this->wallets->createWallet($user, $data['type'], $data['name'], $opts);

            if ($data['type'] === 'emergency' && !empty($data['emergency'])) {
                $this->emergency->configure($wallet, $user, $data['emergency']);
            }

            if ($deposit > 0) {
                $this->wallets->transferBetweenWallets($source, $wallet, $deposit, $user, "Initial deposit to {$wallet->name}");
            }

            if ($monthly > 0) {
                AutomationService::make()->createRule($user, [
                    'name' => "{$wallet->name} monthly funding",
                    'from_wallet_id' => $source->id,
                    'to_wallet_id' => $wallet->id,
                    'amount' => $monthly,
                    'frequency' => 'monthly',
                    'day_of_month' => $data['monthly_day'] ?? min((int) now()->format('j'), 28),
                ]);
            }

            return $wallet->refresh();
        });

        if ($wallet->type === 'emergency') {
            $this->emergency->notifyConfigured($wallet, $user);
        }

        return $wallet;
    }

    /** The funding source must be the user's own spendable wallet with enough available. */
    private function resolveSource(User $user, mixed $sourceId, int $deposit): Wallet
    {
        $source = $sourceId ? Wallet::where('id', (int) $sourceId)->where('user_id', $user->id)->first() : null;
        if (!$source) {
            throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your wallets to fund this from.']);
        }
        if ($deposit <= 0) {
            return $source;
        }
        if (!$source->canSpend($user)) {
            throw ValidationException::withMessages(['source_wallet_id' => "Money can't leave {$source->name} right now — choose another wallet."]);
        }
        if ($source->approvalRequiredFor($deposit) && $source->eligibleApprovers($user->id)->isNotEmpty()) {
            throw ValidationException::withMessages(['source_wallet_id' => "Moves out of {$source->name} need approval — fund the new wallet after it's created."]);
        }
        if ($deposit > $source->availableToSpend()) {
            throw ValidationException::withMessages(['initial_deposit' => "{$source->name} doesn't have enough available for this deposit."]);
        }

        return $source;
    }
}
