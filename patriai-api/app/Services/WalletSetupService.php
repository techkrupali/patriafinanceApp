<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletDraft;
use App\Models\WalletInvitation;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Guided wallet creation (client: "wallet creation should be a process that
 * guides users through the creation journey for each type of wallet"). One call
 * creates the wallet with its type-specific purpose, applies emergency access
 * rules or the savings-goal setup (milestones, contributors, savings plan), moves
 * the initial deposit from the chosen funding source, sets up monthly
 * auto-funding and clears the draft it came from — all in one transaction, so a
 * failed step (e.g. not enough money in the source) leaves nothing half-created.
 * Amounts are kobo.
 */
class WalletSetupService
{
    public function __construct(
        private readonly WalletService $wallets,
        private readonly EmergencyService $emergency,
        private readonly SavingsService $savings,
        private readonly InvitationService $invitations,
        private readonly BudgetService $budgets,
        private readonly GivingService $giving,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), EmergencyService::make(), SavingsService::make(), InvitationService::make(), BudgetService::make(), GivingService::make());
    }

    /**
     * $data keys: type, name, description?, target_amount?, target_date?, purpose?,
     * initial_deposit?, source_wallet_id?, monthly_amount?, monthly_day?,
     * emergency?, milestones?, contributors?, savings_plan?, mode?, members?,
     * approval? {threshold, mode, lock_until_goal, expiry_hours}, reminder_day?,
     * budget? (spending), giving? (giving), draft_id?
     */
    public function create(User $user, array $data): Wallet
    {
        $deposit = (int) ($data['initial_deposit'] ?? 0);
        $monthly = (int) ($data['monthly_amount'] ?? 0);
        $planAutoSave = !empty($data['savings_plan']) && ($data['savings_plan']['auto_save'] ?? true);
        // SPD-04: topped up from Main, or the owner's share of a split.
        $budgetFunded = $data['type'] === 'spending' && in_array($data['budget']['funding'] ?? 'manual', ['topup', 'split'], true)
            && ($data['budget']['period'] ?? 'monthly') !== 'one_off';
        $source = ($deposit > 0 || $monthly > 0 || $planAutoSave || $budgetFunded)
            ? $this->resolveSource($user, $data['source_wallet_id'] ?? null, $deposit)
            : null;

        $invited = [];
        $wallet = DB::transaction(function () use ($user, $data, $deposit, $monthly, $source, &$invited) {
            $approval = $data['approval'] ?? null;
            $meta = array_filter([
                'purpose' => $data['purpose'] ?? null,
                'mode' => $data['mode'] ?? null,
                'approval_mode' => $approval['mode'] ?? null,
                'lock_until_goal' => !empty($approval['lock_until_goal']) ? true : null,
                'approval_expiry_hours' => isset($approval['expiry_hours']) ? (int) $approval['expiry_hours'] : null,
                'reminder_day' => isset($data['reminder_day']) ? (int) $data['reminder_day'] : null,
                'colour' => $data['colour'] ?? null,
                'lock' => ($data['lock']['mode'] ?? 'none') !== 'none' ? [
                    'mode' => $data['lock']['mode'],
                    'until' => $data['lock']['mode'] === 'date' ? $data['lock']['until'] : null,
                    'early_break' => $earlyBreak = (bool) ($data['lock']['early_break'] ?? true),
                    'approval' => (bool) ($data['lock']['approval'] ?? true),
                    // SAV-05 "5% of the amount is kept as a fee", half to the charity picked.
                    'fee_percent' => $earlyBreak ? SpendRules::EARLY_BREAK_FEE_PERCENT : 0,
                    'charity_id' => $earlyBreak ? $this->charityId($data['lock']['charity_id'] ?? null) : null,
                ] : null,
            ], fn ($v) => $v !== null && $v !== '');
            $opts = array_filter([
                'description' => $data['description'] ?? null,
                'target_amount' => $data['target_amount'] ?? null,
                'target_date' => $data['target_date'] ?? null,
                'meta' => $meta ?: null,
            ], fn ($v) => $v !== null);

            $wallet = $this->wallets->createWallet($user, $data['type'], $data['name'], $opts);

            if ($approval !== null) {
                $wallet->update([
                    'approval_enabled' => true,
                    'approval_threshold' => $approval['threshold'] ?? null,
                    'required_approvals' => 1,
                ]);
            }

            // SPD-02…06 first: spenders are limited to categories by name.
            $categoryIds = $data['type'] === 'spending' && !empty($data['budget'])
                ? $this->budgets->configure($wallet, $user, $data['budget'], $source)
                : [];

            $invited = $this->inviteMembers($wallet, $user, $data['members'] ?? [], $categoryIds);

            if ($data['type'] === 'emergency' && !empty($data['emergency'])) {
                $this->emergency->configure($wallet, $user, $data['emergency']);
            }

            if (in_array($data['type'], SavingsService::TYPES, true)) {
                $this->savings->configure($wallet, $user, $data, $source);
            }

            if ($data['type'] === 'giving' && !empty($data['giving'])) {
                $this->giving->configure($wallet, $user, $data['giving']);
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

            // The draft this setup came from is done.
            if (!empty($data['draft_id'])) {
                WalletDraft::where('id', (int) $data['draft_id'])->where('user_id', $user->id)->delete();
            }

            return $wallet->refresh();
        });

        if ($wallet->type === 'emergency') {
            $this->emergency->notifyConfigured($wallet, $user);
        }
        if (in_array($wallet->type, SavingsService::TYPES, true)) {
            $this->savings->notifyInvited($wallet, $user, array_map(fn ($i) => $i[0]->id, $invited));
        }
        foreach ($invited as [$invitation, $invitee]) {
            $this->invitations->deliver($invitation, $wallet, $user, $invitee);
        }

        return $wallet;
    }

    /**
     * WCR-08: invite the people picked for the wallet, each with their role.
     * Co-owners approve by their role; contributors and viewers never do.
     *
     * @return list<array{0: WalletInvitation, 1: ?User}>
     */
    private function inviteMembers(Wallet $wallet, User $owner, array $members, array $categoryIds = []): array
    {
        $out = [];
        foreach (array_values($members) as $i => $m) {
            // SPD-05 "Food and market only · up to ₦15,000 a day": a spender's limits.
            if (isset($m['spend']) && $wallet->type === 'spending') {
                $names = $m['spend']['categories'] ?? null;
                $ids = null;
                if (is_array($names)) {
                    $ids = [];
                    foreach ($names as $name) {
                        $id = $categoryIds[strtolower(trim((string) $name))] ?? null;
                        if (!$id) {
                            throw ValidationException::withMessages(["members.{$i}.spend.categories" => "{$name} isn't one of the categories."]);
                        }
                        $ids[] = $id;
                    }
                }
                $m['permissions'] = array_merge($m['permissions'] ?? [], [
                    'withdraw' => $m['role'] === 'contributor',
                    'categories' => $ids,
                    'daily_limit' => isset($m['spend']['daily_limit']) ? (int) $m['spend']['daily_limit'] : null,
                ]);
            }
            if (!empty($m['user_id'])) {
                $invitee = User::find((int) $m['user_id']);
                if (!$invitee || $invitee->status !== 'active') {
                    throw ValidationException::withMessages(["members.{$i}.user_id" => 'Choose a Patriai user to invite.']);
                }
                $identifier = $this->invitations->identifierFor($invitee);
            } else {
                $identifier = trim((string) ($m['identifier'] ?? ''));
                if ($identifier === '') {
                    throw ValidationException::withMessages(["members.{$i}.identifier" => 'Enter a phone number to invite.']);
                }
                $invitee = $this->invitations->resolveInvitee($identifier);
            }

            if ($m['role'] === 'viewer' && !empty($m['can_approve'])) {
                throw ValidationException::withMessages(["members.{$i}.can_approve" => 'A viewer cannot approve payments.']);
            }
            try {
                $invitation = $this->invitations->create(
                    $wallet,
                    $owner,
                    $invitee,
                    $identifier,
                    $m['role'],
                    (bool) ($m['can_approve'] ?? false),
                    $m['permissions'] ?? null,
                    $m['pledge'] ?? null,
                    (bool) ($m['keyholder'] ?? false),
                );
            } catch (ValidationException $e) {
                throw ValidationException::withMessages(["members.{$i}" => collect($e->errors())->flatten()->first()]);
            }
            $out[] = [$invitation, $invitee];
        }

        return $out;
    }

    /** SAV-05/BRK-02: a charity Patriai lists, for half of any early-break fee. */
    private function charityId(mixed $id): ?int
    {
        if (!$id) {
            return null;
        }
        $charity = \App\Models\Organisation::where('id', (int) $id)->where('active', true)->first();
        if (!$charity) {
            throw ValidationException::withMessages(['lock.charity_id' => 'Choose one of the charities listed.']);
        }

        return $charity->id;
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
