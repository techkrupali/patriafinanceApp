<?php

namespace App\Services;

use App\Models\EmergencyBeneficiary;
use App\Models\EmergencySetting;
use App\Models\EmergencyUnlockRequest;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletMember;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Emergency Wallet engine (client video "Emergency Wallet instructions",
 * 2026-10-17). A wallet set up through the guided emergency journey starts
 * LOCKED — anyone may fund it, nobody may spend from it — until one of the
 * owner's rules fires:
 *   - manual:        the owner enters the emergency PIN chosen during setup
 *   - dual approval: two different authorised people (owner, the named
 *                    approver, recipients) agree — one requests, another approves
 *   - document:      a death certificate / legal notice that an admin verifies
 *   - overrides:     owner + transaction PIN while the balance is above the
 *                    threshold, or an admin national-crisis override (opt-in)
 * Once unlocked, recipients withdraw to their own main wallet within their limit
 * and access delay. This service NEVER touches balances directly — every move is
 * replayed through WalletService.
 */
class EmergencyService
{
    private const PIN_MAX_ATTEMPTS = 5;

    /** Keyholders besides the owner (EMG-03). */
    private const MAX_KEYHOLDERS = 6;

    /** EMG-04: keyholders check a fast release within 48 hours. */
    private const FAST_RELEASE_REVIEW_HOURS = 48;

    private const PIN_LOCK_MINUTES = 15;

    private const VIA_LABELS = [
        'manual' => 'the owner\'s emergency PIN',
        'dual_approval' => 'dual approval',
        'document' => 'a verified document',
        'high_balance' => 'the high-balance override',
        'national_crisis' => 'a national-crisis override',
    ];

    public function __construct(
        private readonly WalletService $wallets,
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make(), NotificationService::make());
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    // ------------------------------------------------------------------ setup

    /** Member roles that exist only because of the emergency rules. */
    private const RULE_ROLES = ['beneficiary', 'emergency_approver'];

    /**
     * Persist the access rules of a freshly created emergency wallet. Runs inside
     * the caller's transaction, so any rejection here rolls the wallet back too.
     * Amounts arrive in kobo.
     */
    public function configure(Wallet $wallet, User $owner, array $rules): EmergencySetting
    {
        [$keyholders, $people] = $this->validateRules($owner, $rules);

        $setting = EmergencySetting::create(['wallet_id' => $wallet->id] + $this->settingAttributes($rules, $keyholders));
        $this->syncBeneficiaries($wallet, $rules['beneficiaries'] ?? []);
        $this->syncMembers($wallet, $owner, $people, $keyholders);

        AuditService::make()->log($wallet, $owner, 'emergency_rules_set', 'Emergency access rules activated — wallet locked', [
            'dual_approval' => $setting->dual_approval,
            'unlock_on_document' => $setting->unlock_on_document,
            'manual_unlock' => $setting->manual_unlock,
            'beneficiaries' => count($people),
        ]);

        return $setting;
    }

    /**
     * The owner changes the rules after creation — unlock methods, overrides,
     * beneficiaries (order, limits, access) and the custom PIN. Guarded by the
     * owner's transaction PIN. Beneficiaries who stay keep what they've withdrawn.
     */
    public function updateRules(Wallet $wallet, User $owner, array $rules, string $pin): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        $this->requireOwner($wallet, $owner);
        app(PinService::class)->verify($owner, $pin);
        [$keyholders, $people] = $this->validateRules($owner, $rules, $setting);
        $previousKeyholders = $setting->keyholders($wallet->user_id);

        $added = DB::transaction(function () use ($wallet, $owner, $rules, $setting, $keyholders, $people) {
            $setting->update($this->settingAttributes($rules, $keyholders, $setting));
            $added = $this->syncBeneficiaries($wallet, $rules['beneficiaries'] ?? []);
            $this->syncMembers($wallet, $owner, $people, $keyholders);

            // Requests for an unlock method that's now off can never succeed.
            $off = array_keys(array_filter(['dual_approval' => !$setting->dual_approval, 'document' => !$setting->unlock_on_document]));
            if ($off) {
                $wallet->emergencyUnlockRequests()
                    ->where('status', 'pending')
                    ->whereIn('method', $off)
                    ->update(['status' => 'cancelled', 'review_note' => 'The owner turned this unlock method off', 'decided_at' => now()]);
            }

            return $added;
        });
        $wallet->unsetRelation('emergencySetting');

        AuditService::make()->log($wallet, $owner, 'emergency_rules_updated', 'Emergency access rules updated', [
            'dual_approval' => $setting->dual_approval,
            'unlock_on_document' => $setting->unlock_on_document,
            'manual_unlock' => $setting->manual_unlock,
            'beneficiaries' => count($people),
            'pin_changed' => !empty($rules['emergency_pin']),
        ]);

        $setting->refresh();
        $newKeyholders = array_values(array_diff($setting->keyholders($wallet->user_id), $previousKeyholders));
        $this->notifyPeople($wallet, $owner, $added, $newKeyholders);

        // Keyholders always hear when the release rules change.
        foreach (User::whereIn('id', array_diff($setting->keyholders($wallet->user_id), [$owner->id], $newKeyholders))->get() as $keyholder) {
            $this->notifications->push(
                $keyholder,
                'emergency_rules_changed',
                "{$owner->fullName()} changed the rules of {$wallet->name}",
                'A release now needs ' . $setting->requiredYeses($wallet->user_id) . ' of ' . count($setting->keyholders($wallet->user_id)) . ' keyholders.',
                ['wallet_id' => $wallet->id],
            );
        }

        return $setting;
    }

    /**
     * Check a set of rules. Returns [approver|null, beneficiaries keyed by user id].
     * $existing is the current setting when editing: a custom PIN is then only
     * required if manual unlock didn't have one yet.
     */
    private function validateRules(User $owner, array $rules, ?EmergencySetting $existing = null): array
    {
        $dual = (bool) ($rules['dual_approval'] ?? false);
        $document = (bool) ($rules['unlock_on_document'] ?? false);
        $manual = (bool) ($rules['manual_unlock'] ?? false);
        $beneficiaries = array_values($rules['beneficiaries'] ?? []);

        // EMG-03 keyholders; the original dual approval named one approver.
        $keyholders = [];
        if (array_key_exists('keyholders', $rules)) {
            foreach (array_values(array_unique(array_map('intval', $rules['keyholders'] ?? []))) as $i => $id) {
                $keyholders[] = $this->resolvePerson($id, $owner, "emergency.keyholders.{$i}", 'keyholder');
            }
            if (count($keyholders) > self::MAX_KEYHOLDERS) {
                throw ValidationException::withMessages(['emergency.keyholders' => 'You can choose up to ' . self::MAX_KEYHOLDERS . ' keyholders besides you.']);
            }
        } elseif ($dual) {
            $keyholders[] = $this->resolvePerson($rules['approver_user_id'] ?? null, $owner, 'emergency.approver_user_id', 'approver');
        }

        if (!$keyholders && !$document && !$manual) {
            throw ValidationException::withMessages([
                'emergency' => 'Choose at least one way this wallet can be unlocked.',
            ]);
        }


        if ($manual) {
            if (trim((string) ($rules['unlock_reason'] ?? '')) === '') {
                throw ValidationException::withMessages(['emergency.unlock_reason' => 'Add the reason this wallet may be unlocked manually.']);
            }
            $newPin = (string) ($rules['emergency_pin'] ?? '');
            if ($newPin !== '' && !preg_match('/^\d{4}$/', $newPin)) {
                throw ValidationException::withMessages(['emergency.emergency_pin' => 'Your custom PIN must be 4 digits.']);
            }
            if ($newPin === '' && !$existing?->emergency_pin) {
                throw ValidationException::withMessages(['emergency.emergency_pin' => 'Create a 4-digit custom PIN.']);
            }
        }

        if (count($beneficiaries) > 3) {
            throw ValidationException::withMessages(['emergency.beneficiaries' => 'You can add up to 3 beneficiaries.']);
        }

        $people = [];
        foreach ($beneficiaries as $i => $b) {
            $user = $this->resolvePerson($b['user_id'] ?? null, $owner, "emergency.beneficiaries.{$i}.user_id", 'beneficiary');
            if (isset($people[$user->id])) {
                throw ValidationException::withMessages(["emergency.beneficiaries.{$i}.user_id" => "{$user->fullName()} is already a beneficiary."]);
            }
            $people[$user->id] = $user;
        }

        // Someone other than the owner has to be able to present the document.
        if ($document && empty($people) && !$keyholders) {
            throw ValidationException::withMessages([
                'emergency.unlock_on_document' => 'Add a beneficiary or an approver who can submit the death certificate or legal notice.',
            ]);
        }

        return [$keyholders, $people];
    }

    /** @param list<User> $keyholders */
    private function settingAttributes(array $rules, array $keyholders, ?EmergencySetting $existing = null): array
    {
        $manual = (bool) ($rules['manual_unlock'] ?? false);
        $newPin = (string) ($rules['emergency_pin'] ?? '');
        $explicit = array_key_exists('keyholders', $rules);
        $ids = array_map(fn (User $u) => $u->id, $keyholders);
        $fast = (int) ($rules['fast_release_limit'] ?? 0);

        return [
            'purpose' => $rules['purpose'] ?? $existing?->purpose,
            'purposes' => array_key_exists('purposes', $rules) ? array_values($rules['purposes'] ?? []) : $existing?->purposes,
            'dual_approval' => count($ids) > 0,
            'approver_user_id' => $ids[0] ?? null,
            'keyholder_ids' => $explicit ? $ids : null,
            // "2 of 3": the owner plus the keyholders; a request counts as the asker's yes.
            'required_keyholders' => $explicit && $ids ? max(1, min(count($ids) + 1, (int) ($rules['required_keyholders'] ?? 2))) : null,
            'request_expiry_hours' => isset($rules['request_expiry_hours']) ? (int) $rules['request_expiry_hours'] : $existing?->request_expiry_hours,
            'fast_release_limit' => $fast > 0 ? $fast : null,
            'fast_release_every_days' => (int) ($rules['fast_release_every_days'] ?? $existing?->fast_release_every_days ?? 30),
            'unlock_on_document' => (bool) ($rules['unlock_on_document'] ?? false),
            'manual_unlock' => $manual,
            'unlock_reason' => $manual ? trim((string) $rules['unlock_reason']) : null,
            // A new custom PIN replaces the old one; leaving it blank keeps it.
            'emergency_pin' => $manual ? ($newPin !== '' ? Hash::make($newPin) : $existing?->emergency_pin) : null,
            'override_national_crisis' => (bool) ($rules['override_national_crisis'] ?? false),
            'override_high_balance' => (bool) ($rules['override_high_balance'] ?? false),
            'beneficiary_note' => ($rules['beneficiary_note'] ?? null) ?: null,
        ];
    }

    /**
     * Beneficiaries in the owner's order (client sheet: "first beneficiary, second
     * fallback beneficiary, up to third"): the 1st is the beneficiary, the 2nd and
     * 3rd are fallbacks, who default to the 7-day delay. Returns newly added user ids.
     */
    private function syncBeneficiaries(Wallet $wallet, array $beneficiaries): array
    {
        $existing = EmergencyBeneficiary::where('wallet_id', $wallet->id)->get()->keyBy('user_id');
        $keep = [];
        $added = [];

        foreach (array_values($beneficiaries) as $i => $b) {
            $userId = (int) $b['user_id'];
            $keep[] = $userId;
            $attributes = [
                'position' => $i + 1,
                'role' => $i === 0 ? 'beneficiary' : 'fallback',
                'relationship' => ($b['relationship'] ?? null) ?: null,
                'withdrawal_limit' => $b['withdrawal_limit'] ?? null,
                'access_type' => $b['access_type'] ?? ($i === 0 ? 'immediate' : 'delay_7d'),
            ];
            if ($row = $existing->get($userId)) {
                $row->update($attributes); // keeps what they've already withdrawn
            } else {
                EmergencyBeneficiary::create($attributes + ['wallet_id' => $wallet->id, 'user_id' => $userId]);
                $added[] = $userId;
            }
        }

        EmergencyBeneficiary::where('wallet_id', $wallet->id)->whereNotIn('user_id', $keep ?: [0])->delete();

        return $added;
    }

    /**
     * Beneficiaries and the approver see the wallet (and its rules) from their own
     * wallet list as read-only members — never spenders. People dropped from the
     * rules lose that access, unless they also hold a real role on the wallet.
     */
    /** @param list<User> $keyholders */
    private function syncMembers(Wallet $wallet, User $owner, array $people, array $keyholders): void
    {
        $desired = [];
        foreach ($people as $user) {
            $desired[$user->id] = 'beneficiary';
        }
        foreach ($keyholders as $keyholder) {
            $desired[$keyholder->id] ??= 'emergency_approver';
        }

        WalletMember::where('wallet_id', $wallet->id)
            ->whereIn('role', self::RULE_ROLES)
            ->whereNotIn('user_id', array_keys($desired) ?: [0])
            ->delete();

        foreach ($desired as $userId => $role) {
            $member = WalletMember::where('wallet_id', $wallet->id)->where('user_id', $userId)->first();
            if ($member && $member->status === 'active' && !in_array($member->role, self::RULE_ROLES, true)) {
                continue; // already a real member — don't downgrade them
            }
            WalletMember::updateOrCreate(
                ['wallet_id' => $wallet->id, 'user_id' => $userId],
                ['role' => $role, 'status' => 'active', 'can_approve' => false, 'invited_by' => $owner->id],
            );
        }
    }

    /** Tell the approver and beneficiaries what they were named for. Call after commit. */
    public function notifyConfigured(Wallet $wallet, User $owner): void
    {
        $setting = $wallet->emergencySetting;
        $this->notifyPeople($wallet, $owner, null, $setting ? array_values(array_diff($setting->keyholders($wallet->user_id), [$owner->id])) : []);
    }

    /** Notify beneficiaries ($onlyUserIds, or all when null) and the keyholders in $keyholderIds. */
    private function notifyPeople(Wallet $wallet, User $owner, ?array $onlyUserIds, array $keyholderIds): void
    {
        $setting = $wallet->emergencySetting;
        if (!$setting) {
            return;
        }

        $beneficiaries = $wallet->emergencyBeneficiaries()->with('user')->get();
        foreach ($beneficiaries as $b) {
            if (!$b->user || ($onlyUserIds !== null && !in_array($b->user_id, $onlyUserIds, true))) {
                continue;
            }
            $limit = $b->withdrawal_limit !== null ? 'up to ₦' . $this->naira($b->withdrawal_limit) : 'from the balance';
            $when = $b->access_type === 'delay_7d' ? '7 days after it unlocks' : 'as soon as it unlocks';
            $rank = $b->position === 1 ? 'beneficiary' : 'fallback beneficiary';
            $this->notifications->push(
                $b->user,
                'emergency_recipient_added',
                "{$owner->fullName()} named you an emergency {$rank}",
                "If {$wallet->name} is ever unlocked, you can receive {$limit}, {$when}.",
                ['wallet_id' => $wallet->id],
            );
        }

        $needed = $setting->requiredYeses($wallet->user_id);
        $of = count($setting->keyholders($wallet->user_id));
        foreach (User::whereIn('id', $keyholderIds)->get() as $keyholder) {
            $this->notifications->push(
                $keyholder,
                'emergency_approver_added',
                "{$owner->fullName()} made you a keyholder of {$wallet->name}",
                "In an emergency you help decide when money is released — a release needs {$needed} of {$of} keyholders.",
                ['wallet_id' => $wallet->id],
            );
        }
    }

    private function resolvePerson(mixed $userId, User $owner, string $field, string $label): User
    {
        $user = $userId ? User::find((int) $userId) : null;
        if (!$user || $user->status !== 'active') {
            throw ValidationException::withMessages([$field => "Choose a Patriai user as the {$label}."]);
        }
        if ($user->id === $owner->id) {
            throw ValidationException::withMessages([$field => "You can't add yourself as the {$label}."]);
        }

        return $user;
    }

    // ------------------------------------------------------------- authority

    /** Who may ask for a release: the keyholders and every beneficiary (EMG-05 "if you can't ask yourself"). */
    public function authorizedUserIds(Wallet $wallet): Collection
    {
        $setting = $wallet->emergencySetting;
        $ids = collect($setting ? $setting->keyholders($wallet->user_id) : [$wallet->user_id]);
        if ($setting && !$setting->dual_approval) {
            $ids = collect([$wallet->user_id]);
        }

        return $ids->concat($wallet->emergencyBeneficiaries()->pluck('user_id'))->unique()->values();
    }

    /**
     * Whose yes counts towards a release: the keyholders. Rules made before
     * keyholders let any authorised person (owner, approver, beneficiaries) agree.
     */
    public function approverIds(Wallet $wallet, EmergencySetting $setting): Collection
    {
        return $setting->keyholder_ids === null
            ? $this->authorizedUserIds($wallet)
            : collect($setting->keyholders($wallet->user_id));
    }

    public function isKeyholder(Wallet $wallet, User $user): bool
    {
        $setting = $wallet->emergencySetting;

        return $setting !== null && in_array($user->id, $setting->keyholders($wallet->user_id), true);
    }

    public function isAuthorized(Wallet $wallet, User $user): bool
    {
        return $this->authorizedUserIds($wallet)->contains($user->id);
    }

    private function requireSetting(Wallet $wallet): EmergencySetting
    {
        $setting = $wallet->emergencySetting;
        if ($wallet->type !== 'emergency' || !$setting) {
            throw ValidationException::withMessages(['wallet' => 'This wallet has no emergency access rules.']);
        }

        return $setting;
    }

    private function requireLocked(EmergencySetting $setting): void
    {
        if (!$setting->isLocked()) {
            throw ValidationException::withMessages(['wallet' => 'This emergency wallet is already unlocked.']);
        }
    }

    private function requireOwner(Wallet $wallet, User $user): void
    {
        if ($wallet->user_id !== $user->id) {
            throw ValidationException::withMessages(['wallet' => 'Only the wallet owner can do this.']);
        }
    }

    // --------------------------------------------------------------- unlocking

    /**
     * Owner unlocks with the custom PIN chosen during setup and a reason (client:
     * "the person must provide reason for unlock and an emergency pin"). The reason
     * defaults to the one set up front and is shared with the beneficiaries.
     */
    public function manualUnlock(Wallet $wallet, User $owner, string $pin, ?string $reason = null): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        $this->requireOwner($wallet, $owner);
        if (!$setting->manual_unlock) {
            throw ValidationException::withMessages(['pin' => 'Manual unlock is not enabled for this wallet.']);
        }
        $this->requireLocked($setting);
        $reason = trim((string) ($reason ?: $setting->unlock_reason));
        if ($reason === '') {
            throw ValidationException::withMessages(['reason' => 'Say why you are unlocking this wallet.']);
        }
        $this->verifyEmergencyPin($wallet, $setting, $pin);

        return $this->unlock($wallet, $owner, 'manual', null, $reason);
    }

    /** Owner override with the transaction PIN while the balance is above the threshold. */
    public function highBalanceOverride(Wallet $wallet, User $owner, string $pin): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        $this->requireOwner($wallet, $owner);
        if (!$setting->override_high_balance) {
            throw ValidationException::withMessages(['pin' => 'The high-balance override is not enabled for this wallet.']);
        }
        $this->requireLocked($setting);
        if ($wallet->balance <= $setting->override_balance_threshold) {
            throw ValidationException::withMessages([
                'pin' => 'The override only applies while the balance is above ₦' . number_format($setting->override_balance_threshold / 100) . '.',
            ]);
        }
        app(PinService::class)->verify($owner, $pin);

        return $this->unlock($wallet, $owner, 'high_balance');
    }

    /** Owner puts the wallet back under its rules. Recipients' allowances reset. */
    public function lock(Wallet $wallet, User $owner): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        $this->requireOwner($wallet, $owner);
        if ($setting->isLocked()) {
            throw ValidationException::withMessages(['wallet' => 'This emergency wallet is already locked.']);
        }

        DB::transaction(function () use ($wallet, $setting) {
            $setting->update(['unlocked_at' => null, 'unlocked_via' => null, 'unlocked_by' => null]);
            EmergencyBeneficiary::where('wallet_id', $wallet->id)->update(['withdrawn' => 0]);
        });
        $wallet->unsetRelation('emergencySetting');

        AuditService::make()->log($wallet, $owner, 'emergency_locked', 'Emergency wallet locked again');

        return $setting->refresh();
    }

    /**
     * Ask the keyholders to release the fund (EMG-03; with one approver this is the
     * original dual approval). A keyholder's own request counts as their yes, so
     * "1 of 3" releases at once. Requests expire after the hours the owner chose.
     */
    public function requestDualApproval(Wallet $wallet, User $requester, ?string $note): EmergencyUnlockRequest
    {
        $setting = $this->requireSetting($wallet);
        if (!$setting->dual_approval) {
            throw ValidationException::withMessages(['method' => 'Release by keyholders is not set up for this wallet.']);
        }
        $this->requireLocked($setting);
        if (!$this->isAuthorized($wallet, $requester)) {
            throw ValidationException::withMessages(['wallet' => 'You are not one of the people who can unlock this wallet.']);
        }
        $this->expireOldRequests($wallet);
        $pending = $wallet->emergencyUnlockRequests()
            ->where('method', 'dual_approval')
            ->where('status', 'pending')
            ->exists();
        if ($pending) {
            throw ValidationException::withMessages(['method' => 'An unlock request is already waiting for approval.']);
        }

        $approvers = $this->approverIds($wallet, $setting);
        $required = $setting->keyholder_ids === null ? 2 : $setting->requiredYeses($wallet->user_id);
        $yes = $approvers->contains($requester->id) ? [$requester->id] : [];

        $request = EmergencyUnlockRequest::create([
            'wallet_id' => $wallet->id,
            'requested_by' => $requester->id,
            'method' => 'dual_approval',
            'note' => $note ?: null,
            'approvals' => $yes,
            'required_approvals' => $required,
            'expires_at' => $setting->request_expiry_hours ? now()->addHours($setting->request_expiry_hours) : null,
        ]);

        AuditService::make()->log($wallet, $requester, 'emergency_unlock_requested', "{$requester->fullName()} asked to release the wallet", ['request_id' => $request->id]);

        if (count($yes) >= $required) {
            $request->update(['status' => 'approved', 'approved_by' => $requester->id, 'decided_at' => now()]);
            $this->unlock($wallet, $requester, 'dual_approval', $request->id, $note);

            return $request->refresh();
        }

        $still = $required - count($yes);
        foreach ($approvers->reject(fn ($id) => $id === $requester->id) as $id) {
            if ($user = User::find($id)) {
                $this->notifications->push(
                    $user,
                    'emergency_unlock_requested',
                    "{$requester->fullName()} asked to release {$wallet->name}",
                    "Your yes is needed — {$still} more of " . $approvers->count() . ' keyholders must agree.' . ($note ? " Note: {$note}" : ''),
                    ['wallet_id' => $wallet->id, 'emergency_request_id' => $request->id],
                );
            }
        }

        return $request;
    }

    /** Pending requests past their expiry stop counting. */
    private function expireOldRequests(Wallet $wallet): void
    {
        $wallet->emergencyUnlockRequests()
            ->where('status', 'pending')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->update(['status' => 'expired', 'decided_at' => now()]);
    }

    /** Submit a death certificate / legal notice for admin verification. */
    public function submitDocument(Wallet $wallet, User $requester, string $documentType, UploadedFile $file, ?string $note): EmergencyUnlockRequest
    {
        $setting = $this->requireSetting($wallet);
        if (!$setting->unlock_on_document) {
            throw ValidationException::withMessages(['method' => 'This wallet does not unlock on a death certificate or legal notice.']);
        }
        $this->requireLocked($setting);
        if (!$this->isAuthorized($wallet, $requester)) {
            throw ValidationException::withMessages(['wallet' => 'You are not one of the people who can unlock this wallet.']);
        }

        $path = $file->store('emergency-documents', 'local');

        $request = EmergencyUnlockRequest::create([
            'wallet_id' => $wallet->id,
            'requested_by' => $requester->id,
            'method' => 'document',
            'document_type' => $documentType,
            'document_path' => $path,
            'note' => $note ?: null,
        ]);

        $label = $documentType === 'death_certificate' ? 'death certificate' : 'legal notice';
        AuditService::make()->log($wallet, $requester, 'emergency_document_submitted', "{$requester->fullName()} submitted a {$label} for review", ['request_id' => $request->id]);

        // The owner is always told — if they're well, this is how they catch a false claim.
        foreach ($this->authorizedUserIds($wallet)->reject(fn ($id) => $id === $requester->id) as $id) {
            if ($user = User::find($id)) {
                $this->notifications->push(
                    $user,
                    'emergency_document_submitted',
                    "A {$label} was submitted for {$wallet->name}",
                    "{$requester->fullName()} submitted it. Patriai will verify it before the wallet unlocks.",
                    ['wallet_id' => $wallet->id, 'emergency_request_id' => $request->id],
                );
            }
        }

        return $request;
    }

    /** A keyholder says yes; enough yeses release the fund. */
    public function approveRequest(EmergencyUnlockRequest $request, User $approver): EmergencyUnlockRequest
    {
        $wallet = $request->wallet;
        $setting = $this->requireSetting($wallet);
        if ($request->method !== 'dual_approval' || $request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => 'This request can no longer be approved.']);
        }
        if ($request->expires_at && $request->expires_at->isPast()) {
            $request->update(['status' => 'expired', 'decided_at' => now()]);
            throw ValidationException::withMessages(['request' => 'This request has expired. Ask again if it is still needed.']);
        }
        if (!$setting->dual_approval || !$this->approverIds($wallet, $setting)->contains($approver->id)) {
            throw ValidationException::withMessages(['request' => 'You are not one of the people who can unlock this wallet.']);
        }
        if ($request->requested_by === $approver->id) {
            throw ValidationException::withMessages(['request' => 'Someone other than the requester has to approve.']);
        }

        return DB::transaction(function () use ($request, $approver, $wallet, $setting) {
            $locked = EmergencyUnlockRequest::whereKey($request->id)->lockForUpdate()->first();
            // Requests from before keyholders counted the asker implicitly.
            $yes = $locked->approvals ?? [$locked->requested_by];
            if (in_array($approver->id, $yes, true)) {
                throw ValidationException::withMessages(['request' => 'You already said yes.']);
            }
            $yes[] = $approver->id;
            $required = $locked->required_approvals ?? 2;

            if (count($yes) < $required) {
                $locked->update(['approvals' => $yes]);

                return $locked->refresh();
            }

            $locked->update(['approvals' => $yes, 'status' => 'approved', 'approved_by' => $approver->id, 'decided_at' => now()]);
            if ($setting->isLocked()) {
                $this->unlock($wallet, $approver, 'dual_approval', $locked->id);
            }

            return $locked->refresh();
        });
    }

    /** Decline a release request — or flag a fast release for the family to look at. */
    public function rejectRequest(EmergencyUnlockRequest $request, User $user, ?string $note): EmergencyUnlockRequest
    {
        $wallet = $request->wallet;
        if ($request->method === 'fast_release') {
            return $this->flagFastRelease($request, $user, $note);
        }
        if ($request->method !== 'dual_approval' || $request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => 'This request can no longer be declined.']);
        }
        if (!$this->isAuthorized($wallet, $user) || $request->requested_by === $user->id) {
            throw ValidationException::withMessages(['request' => 'You cannot decline this request.']);
        }

        $request->update(['status' => 'rejected', 'approved_by' => $user->id, 'review_note' => $note ?: null, 'decided_at' => now()]);
        $this->notifyDeclined($request, "{$user->fullName()} declined", $note);

        return $request->refresh();
    }

    /** The requester withdraws their own pending request. */
    public function cancelRequest(EmergencyUnlockRequest $request, User $user): EmergencyUnlockRequest
    {
        if ($request->status !== 'pending' || $request->requested_by !== $user->id) {
            throw ValidationException::withMessages(['request' => 'Only the requester can cancel a pending request.']);
        }
        $request->update(['status' => 'cancelled', 'decided_at' => now()]);

        return $request->refresh();
    }

    // ------------------------------------------------------------ fast release

    /**
     * EMG-04 "When every minute counts": a keyholder releases up to the limit at
     * once, with a photo of the bill, once every N days. The money goes to their
     * own Main wallet; the other keyholders check it within 48 hours.
     */
    public function fastRelease(Wallet $wallet, User $user, int $amountKobo, string $pin, UploadedFile $proof, ?string $note): EmergencyUnlockRequest
    {
        $setting = $this->requireSetting($wallet);
        if (!$setting->fast_release_limit) {
            throw ValidationException::withMessages(['amount' => 'Fast release is not set up for this fund.']);
        }
        if (!$setting->isLocked()) {
            throw ValidationException::withMessages(['amount' => 'This fund is already released — pay from it directly.']);
        }
        if (!$this->isKeyholder($wallet, $user)) {
            throw ValidationException::withMessages(['wallet' => 'Only keyholders can release money fast.']);
        }
        if ($amountKobo <= 0 || $amountKobo > $setting->fast_release_limit) {
            throw ValidationException::withMessages(['amount' => 'Fast release is up to ₦' . number_format($setting->fast_release_limit / 100) . '.']);
        }
        $last = $this->lastFastRelease($wallet);
        $next = $last?->created_at->copy()->addDays($setting->fast_release_every_days);
        if ($next && $next->isFuture()) {
            throw ValidationException::withMessages(['amount' => "Fast release was used on {$last->created_at->format('j M')}. The next one opens on {$next->format('j M')}."]);
        }
        $to = $user->mainWallet();
        if (!$to) {
            throw ValidationException::withMessages(['amount' => 'You need an active main wallet to receive this money.']);
        }
        if ($amountKobo > $wallet->availableToSpend()) {
            throw ValidationException::withMessages(['amount' => 'That is more than the fund holds right now.']);
        }

        app(PinService::class)->verify($user, $pin);
        $path = $proof->store('emergency-documents', 'local');

        $request = DB::transaction(function () use ($wallet, $user, $to, $amountKobo, $path, $note) {
            $moved = $this->wallets->transferBetweenWallets($wallet, $to, $amountKobo, $user, "Fast release from {$wallet->name}");

            return EmergencyUnlockRequest::create([
                'wallet_id' => $wallet->id,
                'requested_by' => $user->id,
                'method' => 'fast_release',
                'document_type' => 'proof',
                'document_path' => $path,
                'note' => $note ?: null,
                'amount' => $amountKobo,
                'reference' => $moved['reference'],
                'status' => 'released',
                'decided_at' => now(),
                'expires_at' => now()->addHours(self::FAST_RELEASE_REVIEW_HOURS),
            ]);
        });

        AuditService::make()->log($wallet, $user, 'emergency_fast_release', "{$user->fullName()} released ₦{$this->naira($amountKobo)} fast, with proof", ['request_id' => $request->id, 'amount' => $amountKobo]);

        $setting = $wallet->emergencySetting;
        foreach (User::whereIn('id', array_diff($setting->keyholders($wallet->user_id), [$user->id]))->get() as $keyholder) {
            $this->notifications->push(
                $keyholder,
                'emergency_fast_release',
                "{$user->fullName()} released ₦{$this->naira($amountKobo)} from {$wallet->name}",
                'Check the proof within ' . self::FAST_RELEASE_REVIEW_HOURS . ' hours. You can flag it if something looks wrong.' . ($note ? " Note: {$note}" : ''),
                ['wallet_id' => $wallet->id, 'emergency_request_id' => $request->id],
            );
        }

        return $request;
    }

    /** The latest fast release that counts towards "once every N days". */
    private function lastFastRelease(Wallet $wallet): ?EmergencyUnlockRequest
    {
        return $wallet->emergencyUnlockRequests()
            ->where('method', 'fast_release')
            ->whereIn('status', ['released', 'flagged'])
            ->latest()
            ->first();
    }

    /** Another keyholder flags a fast release inside the review window. */
    private function flagFastRelease(EmergencyUnlockRequest $request, User $user, ?string $note): EmergencyUnlockRequest
    {
        $wallet = $request->wallet;
        if ($request->status !== 'released' || ($request->expires_at && $request->expires_at->isPast())) {
            throw ValidationException::withMessages(['request' => 'The review window for this release has closed.']);
        }
        if (!$this->isKeyholder($wallet, $user) || $request->requested_by === $user->id) {
            throw ValidationException::withMessages(['request' => 'Only another keyholder can flag this release.']);
        }

        $request->update(['status' => 'flagged', 'approved_by' => $user->id, 'review_note' => $note ?: null]);
        AuditService::make()->log($wallet, $user, 'emergency_fast_release_flagged', "{$user->fullName()} flagged a fast release", ['request_id' => $request->id]);

        foreach (User::whereIn('id', array_unique([$wallet->user_id, $request->requested_by]))->where('id', '!=', $user->id)->get() as $person) {
            $this->notifications->push(
                $person,
                'emergency_fast_release_flagged',
                "{$user->fullName()} flagged a release from {$wallet->name}",
                '₦' . $this->naira((int) $request->amount) . ' released on ' . $request->created_at->format('j M') . '.' . ($note ? " Note: {$note}" : ''),
                ['wallet_id' => $wallet->id, 'emergency_request_id' => $request->id],
            );
        }

        return $request->refresh();
    }

    // ------------------------------------------------------------------- admin

    /** Admin verified the death certificate / legal notice → unlock. */
    public function adminApproveDocument(EmergencyUnlockRequest $request, User $admin, ?string $note): EmergencyUnlockRequest
    {
        if ($request->method !== 'document' || $request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => 'This request is not awaiting review.']);
        }
        $setting = $this->requireSetting($request->wallet);

        $request->update(['status' => 'approved', 'reviewed_by' => $admin->id, 'review_note' => $note ?: null, 'decided_at' => now()]);
        if ($setting->isLocked()) {
            $this->unlock($request->wallet, $admin, 'document', $request->id);
        }

        return $request->refresh();
    }

    public function adminRejectDocument(EmergencyUnlockRequest $request, User $admin, ?string $note): EmergencyUnlockRequest
    {
        if ($request->method !== 'document' || $request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => 'This request is not awaiting review.']);
        }
        $request->update(['status' => 'rejected', 'reviewed_by' => $admin->id, 'review_note' => $note ?: null, 'decided_at' => now()]);
        $this->notifyDeclined($request, 'Patriai could not verify the document', $note);

        return $request->refresh();
    }

    /** Admin national-crisis override — only for wallets whose owner opted in. */
    public function adminCrisisUnlock(Wallet $wallet, User $admin, string $reason): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        if (!$setting->override_national_crisis) {
            throw ValidationException::withMessages(['wallet' => 'The owner did not allow a national-crisis override on this wallet.']);
        }
        $this->requireLocked($setting);

        AuditService::make()->log($wallet, $admin, 'emergency_crisis_override', "National-crisis override: {$reason}");

        return $this->unlock($wallet, $admin, 'national_crisis');
    }

    private function notifyDeclined(EmergencyUnlockRequest $request, string $who, ?string $note): void
    {
        if ($requester = $request->requester) {
            $this->notifications->push(
                $requester,
                'emergency_request_declined',
                "Unlock request for {$request->wallet->name} declined",
                $who . '.' . ($note ? " Note: {$note}" : ''),
                ['wallet_id' => $request->wallet_id, 'emergency_request_id' => $request->id],
            );
        }
    }

    /** Flip the wallet to unlocked, close other pending requests and tell everyone. */
    private function unlock(Wallet $wallet, User $by, string $via, ?int $requestId = null, ?string $reason = null): EmergencySetting
    {
        $setting = DB::transaction(function () use ($wallet, $by, $via, $requestId) {
            $setting = EmergencySetting::where('wallet_id', $wallet->id)->lockForUpdate()->first();
            if (!$setting->isLocked()) {
                return $setting;
            }
            $setting->update(['unlocked_at' => now(), 'unlocked_via' => $via, 'unlocked_by' => $by->id]);
            EmergencyBeneficiary::where('wallet_id', $wallet->id)->update(['withdrawn' => 0]);
            $wallet->emergencyUnlockRequests()
                ->where('status', 'pending')
                ->when($requestId, fn ($q) => $q->where('id', '!=', $requestId))
                ->update(['status' => 'cancelled', 'review_note' => 'Wallet was unlocked another way', 'decided_at' => now()]);

            return $setting;
        });
        $wallet->unsetRelation('emergencySetting');

        $how = self::VIA_LABELS[$via] ?? $via;
        $why = $reason ? " Reason: {$reason}." : '';
        AuditService::make()->log($wallet, $by, 'emergency_unlocked', "Emergency wallet unlocked via {$how}" . ($reason ? " — {$reason}" : ''), ['via' => $via, 'reason' => $reason]);

        $owner = $wallet->owner;
        if ($owner && $owner->id !== $by->id) {
            $this->notifications->push($owner, 'emergency_unlocked', "{$wallet->name} was unlocked", "It was unlocked via {$how}.{$why}", ['wallet_id' => $wallet->id]);
        }
        // Keyholders may now withdraw on the owner's behalf.
        foreach (User::whereIn('id', array_diff($setting->dual_approval ? $setting->keyholders($wallet->user_id) : [], [$wallet->user_id, $by->id]))->get() as $keyholder) {
            $this->notifications->push(
                $keyholder,
                'emergency_unlocked',
                "{$wallet->name} is unlocked",
                "As a keyholder you can now withdraw or transfer from it.{$why}",
                ['wallet_id' => $wallet->id],
            );
        }
        foreach ($wallet->emergencyBeneficiaries()->with('user')->get() as $b) {
            if (!$b->user || $b->user_id === $by->id) {
                continue;
            }
            $when = $b->access_type === 'delay_7d'
                ? 'from ' . $b->accessAvailableAt($setting->unlocked_at)->format('j M Y')
                : 'now';
            $this->notifications->push(
                $b->user,
                'emergency_unlocked',
                "{$wallet->name} is unlocked",
                "You can withdraw your share {$when}.{$why}",
                ['wallet_id' => $wallet->id],
            );
        }

        return $setting->refresh();
    }

    // -------------------------------------------------------------- recipients

    /** A recipient moves money to their own main wallet within limit and delay. */
    public function beneficiaryWithdraw(Wallet $wallet, User $user, int $amountKobo, string $pin): array
    {
        $setting = $this->requireSetting($wallet);
        if ($setting->isLocked()) {
            throw ValidationException::withMessages(['amount' => 'This emergency wallet is still locked.']);
        }
        $beneficiary = $wallet->emergencyBeneficiaries()->where('user_id', $user->id)->first();
        if (!$beneficiary) {
            throw ValidationException::withMessages(['amount' => 'You are not a beneficiary of this wallet.']);
        }
        $availableAt = $beneficiary->accessAvailableAt($setting->unlocked_at);
        if ($availableAt && $availableAt->isFuture()) {
            throw ValidationException::withMessages(['amount' => 'Your access opens on ' . $availableAt->format('j M Y, g:i A') . '.']);
        }
        $to = $user->mainWallet();
        if (!$to) {
            throw ValidationException::withMessages(['amount' => 'You need an active main wallet to receive this money.']);
        }

        app(PinService::class)->verify($user, $pin);

        $result = DB::transaction(function () use ($wallet, $beneficiary, $amountKobo, $to, $user) {
            $locked = EmergencyBeneficiary::whereKey($beneficiary->id)->lockForUpdate()->first();
            $remaining = $locked->remainingLimit();
            if ($remaining !== null && $amountKobo > $remaining) {
                throw ValidationException::withMessages(['amount' => 'That is more than your remaining allowance of ₦' . $this->naira($remaining) . '.']);
            }
            if ($amountKobo > $wallet->fresh()->availableToSpend()) {
                throw ValidationException::withMessages(['amount' => 'That is more than the wallet holds right now.']);
            }

            $result = $this->wallets->transferBetweenWallets($wallet, $to, $amountKobo, $user, "Emergency release from {$wallet->name}");
            $locked->increment('withdrawn', $amountKobo);

            return $result;
        });

        AuditService::make()->log($wallet, $user, 'emergency_withdrawal', "{$user->fullName()} received ₦{$this->naira($amountKobo)} as a beneficiary", ['amount' => $amountKobo]);
        if ($owner = $wallet->owner) {
            $this->notifications->push(
                $owner,
                'emergency_withdrawal',
                "{$user->fullName()} received ₦{$this->naira($amountKobo)}",
                "Paid from {$wallet->name} to their Patriai wallet.",
                ['wallet_id' => $wallet->id, 'reference' => $result['reference']],
            );
        }

        return $result;
    }

    // ------------------------------------------------------------ verification

    private function verifyEmergencyPin(Wallet $wallet, EmergencySetting $setting, string $pin): void
    {
        $key = "emergency-pin:{$wallet->id}";
        $attempts = (int) Cache::get($key, 0);
        if ($attempts >= self::PIN_MAX_ATTEMPTS) {
            throw ValidationException::withMessages([
                'pin' => 'Too many incorrect custom PIN attempts. Try again in ' . self::PIN_LOCK_MINUTES . ' minutes.',
            ]);
        }
        if (!$setting->emergency_pin || !Hash::check($pin, $setting->emergency_pin)) {
            Cache::add($key, 0, now()->addMinutes(self::PIN_LOCK_MINUTES));
            Cache::increment($key);
            throw ValidationException::withMessages(['pin' => 'Incorrect custom PIN.']);
        }
        Cache::forget($key);
    }

    // ----------------------------------------------------------- serialization

    /** Compact state for GET /wallets/{wallet}. */
    public function summary(Wallet $wallet, User $viewer): ?array
    {
        $setting = $wallet->emergencySetting;
        if ($wallet->type !== 'emergency' || !$setting) {
            return null;
        }

        return [
            'purpose' => $setting->purpose,
            'locked' => $setting->isLocked(),
            'unlocked_at' => $setting->unlocked_at?->toIso8601String(),
            'unlocked_via' => $setting->unlocked_via,
            'my_emergency_role' => $this->roleOf($wallet, $setting, $viewer),
            // "2 of 3 to release"
            'keyholders' => $setting->dual_approval ? count($setting->keyholders($wallet->user_id)) : 0,
            'required' => $setting->dual_approval ? $setting->requiredYeses($wallet->user_id) : 0,
        ];
    }

    private function roleOf(Wallet $wallet, EmergencySetting $setting, User $user): ?string
    {
        if ($wallet->user_id === $user->id) {
            return 'owner';
        }
        if ($wallet->emergencyBeneficiaries()->where('user_id', $user->id)->exists()) {
            return 'recipient';
        }
        if ($setting->dual_approval && in_array($user->id, $setting->keyholders($wallet->user_id), true)) {
            return 'approver';
        }

        return null;
    }

    /** Full rules + the viewer's own permissions for GET /wallets/{wallet}/emergency. */
    public function detail(Wallet $wallet, User $viewer): array
    {
        $setting = $this->requireSetting($wallet);
        $locked = $setting->isLocked();
        $isOwner = $wallet->user_id === $viewer->id;
        $authorized = $this->isAuthorized($wallet, $viewer);
        $beneficiaries = $wallet->emergencyBeneficiaries()->with('user')->get();
        $mine = $beneficiaries->firstWhere('user_id', $viewer->id);
        $this->expireOldRequests($wallet);
        $pendingDual = $wallet->emergencyUnlockRequests()->where('method', 'dual_approval')->where('status', 'pending')->exists();
        $keyholderIds = $setting->dual_approval ? $setting->keyholders($wallet->user_id) : [$wallet->user_id];
        $isKeyholder = in_array($viewer->id, $keyholderIds, true);
        $lastFast = $this->lastFastRelease($wallet);
        $nextFast = $lastFast?->created_at->copy()->addDays($setting->fast_release_every_days);

        $myBeneficiary = null;
        if ($mine) {
            $availableAt = $mine->accessAvailableAt($setting->unlocked_at);
            $remaining = $mine->remainingLimit();
            $myBeneficiary = [
                'withdrawal_limit' => $mine->withdrawal_limit !== null ? $this->naira($mine->withdrawal_limit) : null,
                'withdrawn' => $this->naira($mine->withdrawn),
                'remaining' => $remaining !== null ? $this->naira($remaining) : null,
                'access_type' => $mine->access_type,
                'access_available_at' => $availableAt?->toIso8601String(),
                'can_withdraw_now' => !$locked && $availableAt !== null && !$availableAt->isFuture() && ($remaining === null || $remaining > 0),
            ];
        }

        $requests = $wallet->emergencyUnlockRequests()
            ->with(['requester', 'approver'])
            ->latest()
            ->limit(10)
            ->get();

        return [
            'purpose' => $setting->purpose,
            'purposes' => $setting->purposes ?? [$setting->purpose],
            'locked' => $locked,
            'unlocked_at' => $setting->unlocked_at?->toIso8601String(),
            'unlocked_via' => $setting->unlocked_via,
            'balance' => $wallet->balanceNaira(),
            'rules' => [
                'dual_approval' => $setting->dual_approval,
                'approver' => $setting->dual_approval && $setting->approver ? $this->person($setting->approver) : null,
                'unlock_on_document' => $setting->unlock_on_document,
                'manual_unlock' => $setting->manual_unlock,
                'unlock_reason' => $setting->unlock_reason,
                // Owner only: whether a custom PIN is already set (editing may keep it).
                'has_custom_pin' => $isOwner && (bool) $setting->emergency_pin,
                'override_national_crisis' => $setting->override_national_crisis,
                'override_high_balance' => $setting->override_high_balance,
                'override_balance_threshold' => $this->naira($setting->override_balance_threshold),
                // EMG-03: the owner plus these people hold keys; a release needs `required_keyholders` of them.
                'keyholders' => User::whereIn('id', array_values(array_diff($keyholderIds, [$wallet->user_id])))->get()->map(fn (User $u) => $this->person($u))->values(),
                'required_keyholders' => $setting->dual_approval ? $setting->requiredYeses($wallet->user_id) : 0,
                'request_expiry_hours' => $setting->request_expiry_hours,
                'fast_release' => $setting->fast_release_limit ? [
                    'limit' => $this->naira($setting->fast_release_limit),
                    'every_days' => $setting->fast_release_every_days,
                    'last_at' => $lastFast?->created_at?->toIso8601String(),
                    'next_at' => $nextFast && $nextFast->isFuture() ? $nextFast->toIso8601String() : null,
                ] : null,
            ],
            'beneficiaries' => $beneficiaries->map(fn (EmergencyBeneficiary $b) => [
                'id' => $b->id,
                'user' => $b->user ? $this->person($b->user) : null,
                'position' => $b->position,
                'relationship' => $b->relationship,
                'role' => $b->role,
                'withdrawal_limit' => $b->withdrawal_limit !== null ? $this->naira($b->withdrawal_limit) : null,
                'access_type' => $b->access_type,
                'withdrawn' => $this->naira($b->withdrawn),
            ])->values(),
            // The personal message is for the moment of unlock; the owner always sees it.
            'beneficiary_note' => $isOwner || !$locked ? $setting->beneficiary_note : null,
            'requests' => $requests->map(fn ($r) => $this->serializeRequest($r, $viewer))->values(),
            'me' => [
                'role' => $this->roleOf($wallet, $setting, $viewer),
                'can_edit_rules' => $isOwner,
                // Owner, or the approver once unlocked: may withdraw/transfer directly.
                'can_spend' => $wallet->canSpend($viewer),
                'can_manual_unlock' => $isOwner && $locked && $setting->manual_unlock,
                'can_override' => $isOwner && $locked && $setting->override_high_balance
                    && $wallet->balance > $setting->override_balance_threshold,
                'can_lock' => $isOwner && !$locked,
                'can_request_dual' => $authorized && $locked && $setting->dual_approval && !$pendingDual,
                'is_keyholder' => $isKeyholder,
                'can_fast_release' => $isKeyholder && $locked && (bool) $setting->fast_release_limit && !($nextFast && $nextFast->isFuture()),
                'can_submit_document' => $authorized && !$isOwner && $locked && $setting->unlock_on_document,
                'beneficiary' => $myBeneficiary,
            ],
        ];
    }

    public function serializeRequest(EmergencyUnlockRequest $request, ?User $viewer = null): array
    {
        $wallet = $request->wallet;
        $setting = $wallet->emergencySetting;
        $yes = $request->approvals ?? [$request->requested_by];
        $open = $request->status === 'pending' && !($request->expires_at && $request->expires_at->isPast());
        $canDecide = $viewer
            && $open
            && $request->method === 'dual_approval'
            && $request->requested_by !== $viewer->id
            && !in_array($viewer->id, $yes, true)
            && $setting && $this->approverIds($wallet, $setting)->contains($viewer->id);
        $canFlag = $viewer
            && $request->method === 'fast_release'
            && $request->status === 'released'
            && $request->expires_at && $request->expires_at->isFuture()
            && $request->requested_by !== $viewer->id
            && $this->isKeyholder($wallet, $viewer);

        return [
            'id' => $request->id,
            'wallet_id' => $request->wallet_id,
            'method' => $request->method,
            'document_type' => $request->document_type,
            'has_document' => (bool) $request->document_path,
            'note' => $request->note,
            'status' => $request->status,
            'requested_by' => $request->requester ? $this->person($request->requester) : null,
            'approved_by' => $request->approver ? $this->person($request->approver) : null,
            'review_note' => $request->review_note,
            'amount' => $request->amount !== null ? $this->naira($request->amount) : null,
            'approvals' => count($yes),
            'required_approvals' => $request->required_approvals ?? ($request->method === 'dual_approval' ? 2 : null),
            'expires_at' => $request->expires_at?->toIso8601String(),
            'created_at' => $request->created_at?->toIso8601String(),
            'decided_at' => $request->decided_at?->toIso8601String(),
            'can_approve' => $canDecide,
            'can_reject' => $canDecide || $canFlag,
            'can_flag' => $canFlag,
            'can_cancel' => $viewer && $request->status === 'pending' && $request->requested_by === $viewer->id,
        ];
    }

    private function person(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->fullName(),
            'username' => $user->username,
            'avatar_url' => $user->avatar_url,
        ];
    }
}
