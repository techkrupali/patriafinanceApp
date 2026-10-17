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

    /**
     * Persist the access rules of a freshly created emergency wallet. Runs inside
     * the caller's transaction, so any rejection here rolls the wallet back too.
     * Amounts arrive in kobo.
     */
    public function configure(Wallet $wallet, User $owner, array $rules): EmergencySetting
    {
        $dual = (bool) ($rules['dual_approval'] ?? false);
        $document = (bool) ($rules['unlock_on_document'] ?? false);
        $manual = (bool) ($rules['manual_unlock'] ?? false);
        $beneficiaries = array_values($rules['beneficiaries'] ?? []);

        if (!$dual && !$document && !$manual) {
            throw ValidationException::withMessages([
                'emergency' => 'Choose at least one way this wallet can be unlocked.',
            ]);
        }

        $approver = null;
        if ($dual) {
            $approver = $this->resolvePerson($rules['approver_user_id'] ?? null, $owner, 'emergency.approver_user_id', 'approver');
        }

        if ($manual) {
            if (trim((string) ($rules['unlock_reason'] ?? '')) === '') {
                throw ValidationException::withMessages(['emergency.unlock_reason' => 'Add the reason this wallet may be unlocked manually.']);
            }
            if (!preg_match('/^\d{4}$/', (string) ($rules['emergency_pin'] ?? ''))) {
                throw ValidationException::withMessages(['emergency.emergency_pin' => 'Create a 4-digit emergency PIN.']);
            }
        }

        if (count($beneficiaries) > 3) {
            throw ValidationException::withMessages(['emergency.beneficiaries' => 'You can add up to 3 recipients.']);
        }

        $people = [];
        foreach ($beneficiaries as $i => $b) {
            $user = $this->resolvePerson($b['user_id'] ?? null, $owner, "emergency.beneficiaries.{$i}.user_id", 'recipient');
            if (isset($people[$user->id])) {
                throw ValidationException::withMessages(["emergency.beneficiaries.{$i}.user_id" => "{$user->fullName()} is already a recipient."]);
            }
            $people[$user->id] = $user;
        }

        // Someone other than the owner has to be able to present the document.
        if ($document && empty($people) && !$approver) {
            throw ValidationException::withMessages([
                'emergency.unlock_on_document' => 'Add a recipient or an approver who can submit the death certificate or legal notice.',
            ]);
        }

        $setting = EmergencySetting::create([
            'wallet_id' => $wallet->id,
            'purpose' => $rules['purpose'],
            'dual_approval' => $dual,
            'approver_user_id' => $approver?->id,
            'unlock_on_document' => $document,
            'manual_unlock' => $manual,
            'unlock_reason' => $manual ? trim((string) $rules['unlock_reason']) : null,
            'emergency_pin' => $manual ? Hash::make((string) $rules['emergency_pin']) : null,
            'override_national_crisis' => (bool) ($rules['override_national_crisis'] ?? false),
            'override_high_balance' => (bool) ($rules['override_high_balance'] ?? false),
            'beneficiary_note' => ($rules['beneficiary_note'] ?? null) ?: null,
        ]);

        foreach ($beneficiaries as $i => $b) {
            EmergencyBeneficiary::create([
                'wallet_id' => $wallet->id,
                'user_id' => (int) $b['user_id'],
                'position' => $i + 1,
                'relationship' => ($b['relationship'] ?? null) ?: null,
                'role' => $b['role'] ?? ($i === 0 ? 'beneficiary' : 'fallback'),
                'withdrawal_limit' => $b['withdrawal_limit'] ?? null,
                'access_type' => $b['access_type'] ?? 'immediate',
            ]);
        }

        // Recipients and the approver can see the wallet (and its rules) from their
        // own wallet list. They are read-only members: never spenders.
        foreach ($people as $user) {
            $this->addMember($wallet, $user, 'beneficiary', $owner);
        }
        if ($approver && !isset($people[$approver->id])) {
            $this->addMember($wallet, $approver, 'emergency_approver', $owner);
        }

        AuditService::make()->log($wallet, $owner, 'emergency_rules_set', 'Emergency access rules activated — wallet locked', [
            'dual_approval' => $dual,
            'unlock_on_document' => $document,
            'manual_unlock' => $manual,
            'recipients' => count($people),
        ]);

        return $setting;
    }

    /** Tell the approver and recipients what they were named for. Call after commit. */
    public function notifyConfigured(Wallet $wallet, User $owner): void
    {
        $setting = $wallet->emergencySetting;
        if (!$setting) {
            return;
        }

        foreach ($wallet->emergencyBeneficiaries()->with('user')->get() as $b) {
            if (!$b->user) {
                continue;
            }
            $limit = $b->withdrawal_limit !== null ? 'up to ₦' . $this->naira($b->withdrawal_limit) : 'from the balance';
            $when = $b->access_type === 'delay_7d' ? '7 days after it unlocks' : 'as soon as it unlocks';
            $this->notifications->push(
                $b->user,
                'emergency_recipient_added',
                "{$owner->fullName()} named you an emergency recipient",
                "If {$wallet->name} is ever unlocked, you can receive {$limit}, {$when}.",
                ['wallet_id' => $wallet->id],
            );
        }

        $approver = $setting->approver;
        if ($setting->dual_approval && $approver) {
            $this->notifications->push(
                $approver,
                'emergency_approver_added',
                "{$owner->fullName()} made you an emergency approver",
                "You can help unlock {$wallet->name} in an emergency — an unlock needs two people to agree.",
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

    private function addMember(Wallet $wallet, User $user, string $role, User $owner): void
    {
        WalletMember::updateOrCreate(
            ['wallet_id' => $wallet->id, 'user_id' => $user->id],
            ['role' => $role, 'status' => 'active', 'can_approve' => false, 'invited_by' => $owner->id],
        );
    }

    // ------------------------------------------------------------- authority

    /** Owner, the named approver (when dual approval is on) and every recipient. */
    public function authorizedUserIds(Wallet $wallet): Collection
    {
        $setting = $wallet->emergencySetting;
        $ids = collect([$wallet->user_id]);
        if ($setting?->dual_approval && $setting->approver_user_id) {
            $ids->push($setting->approver_user_id);
        }

        return $ids->concat($wallet->emergencyBeneficiaries()->pluck('user_id'))->unique()->values();
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

    /** Owner unlocks with the emergency PIN chosen during setup. */
    public function manualUnlock(Wallet $wallet, User $owner, string $pin): EmergencySetting
    {
        $setting = $this->requireSetting($wallet);
        $this->requireOwner($wallet, $owner);
        if (!$setting->manual_unlock) {
            throw ValidationException::withMessages(['pin' => 'Manual unlock is not enabled for this wallet.']);
        }
        $this->requireLocked($setting);
        $this->verifyEmergencyPin($wallet, $setting, $pin);

        return $this->unlock($wallet, $owner, 'manual');
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

    /** Ask a second authorised person to agree to unlock (dual approval). */
    public function requestDualApproval(Wallet $wallet, User $requester, ?string $note): EmergencyUnlockRequest
    {
        $setting = $this->requireSetting($wallet);
        if (!$setting->dual_approval) {
            throw ValidationException::withMessages(['method' => 'Dual approval is not enabled for this wallet.']);
        }
        $this->requireLocked($setting);
        if (!$this->isAuthorized($wallet, $requester)) {
            throw ValidationException::withMessages(['wallet' => 'You are not one of the people who can unlock this wallet.']);
        }
        $pending = $wallet->emergencyUnlockRequests()
            ->where('method', 'dual_approval')
            ->where('status', 'pending')
            ->exists();
        if ($pending) {
            throw ValidationException::withMessages(['method' => 'An unlock request is already waiting for approval.']);
        }

        $request = EmergencyUnlockRequest::create([
            'wallet_id' => $wallet->id,
            'requested_by' => $requester->id,
            'method' => 'dual_approval',
            'note' => $note ?: null,
        ]);

        AuditService::make()->log($wallet, $requester, 'emergency_unlock_requested', "{$requester->fullName()} asked to unlock the wallet (dual approval)", ['request_id' => $request->id]);

        foreach ($this->authorizedUserIds($wallet)->reject(fn ($id) => $id === $requester->id) as $id) {
            if ($user = User::find($id)) {
                $this->notifications->push(
                    $user,
                    'emergency_unlock_requested',
                    "{$requester->fullName()} asked to unlock {$wallet->name}",
                    'Your approval is needed — an emergency unlock takes two people.' . ($note ? " Note: {$note}" : ''),
                    ['wallet_id' => $wallet->id, 'emergency_request_id' => $request->id],
                );
            }
        }

        return $request;
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

    /** A second authorised person agrees to a dual-approval request → unlock. */
    public function approveRequest(EmergencyUnlockRequest $request, User $approver): EmergencyUnlockRequest
    {
        $wallet = $request->wallet;
        $setting = $this->requireSetting($wallet);
        if ($request->method !== 'dual_approval' || $request->status !== 'pending') {
            throw ValidationException::withMessages(['request' => 'This request can no longer be approved.']);
        }
        if (!$setting->dual_approval || !$this->isAuthorized($wallet, $approver)) {
            throw ValidationException::withMessages(['request' => 'You are not one of the people who can unlock this wallet.']);
        }
        if ($request->requested_by === $approver->id) {
            throw ValidationException::withMessages(['request' => 'Someone other than the requester has to approve.']);
        }

        $request->update(['status' => 'approved', 'approved_by' => $approver->id, 'decided_at' => now()]);
        if ($setting->isLocked()) {
            $this->unlock($wallet, $approver, 'dual_approval', $request->id);
        }

        return $request->refresh();
    }

    /** Decline a dual-approval request (any other authorised person). */
    public function rejectRequest(EmergencyUnlockRequest $request, User $user, ?string $note): EmergencyUnlockRequest
    {
        $wallet = $request->wallet;
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
    private function unlock(Wallet $wallet, User $by, string $via, ?int $requestId = null): EmergencySetting
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
        AuditService::make()->log($wallet, $by, 'emergency_unlocked', "Emergency wallet unlocked via {$how}", ['via' => $via]);

        $owner = $wallet->owner;
        if ($owner && $owner->id !== $by->id) {
            $this->notifications->push($owner, 'emergency_unlocked', "{$wallet->name} was unlocked", "It was unlocked via {$how}.", ['wallet_id' => $wallet->id]);
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
                "You can withdraw your share {$when}.",
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
            throw ValidationException::withMessages(['amount' => 'You are not a recipient of this wallet.']);
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

        AuditService::make()->log($wallet, $user, 'emergency_withdrawal', "{$user->fullName()} received ₦{$this->naira($amountKobo)} as a recipient", ['amount' => $amountKobo]);
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
                'pin' => 'Too many incorrect emergency PIN attempts. Try again in ' . self::PIN_LOCK_MINUTES . ' minutes.',
            ]);
        }
        if (!$setting->emergency_pin || !Hash::check($pin, $setting->emergency_pin)) {
            Cache::add($key, 0, now()->addMinutes(self::PIN_LOCK_MINUTES));
            Cache::increment($key);
            throw ValidationException::withMessages(['pin' => 'Incorrect emergency PIN.']);
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
        if ($setting->dual_approval && $setting->approver_user_id === $user->id) {
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
        $pendingDual = $wallet->emergencyUnlockRequests()->where('method', 'dual_approval')->where('status', 'pending')->exists();

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
                'override_national_crisis' => $setting->override_national_crisis,
                'override_high_balance' => $setting->override_high_balance,
                'override_balance_threshold' => $this->naira($setting->override_balance_threshold),
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
                'can_manual_unlock' => $isOwner && $locked && $setting->manual_unlock,
                'can_override' => $isOwner && $locked && $setting->override_high_balance
                    && $wallet->balance > $setting->override_balance_threshold,
                'can_lock' => $isOwner && !$locked,
                'can_request_dual' => $authorized && $locked && $setting->dual_approval && !$pendingDual,
                'can_submit_document' => $authorized && !$isOwner && $locked && $setting->unlock_on_document,
                'beneficiary' => $myBeneficiary,
            ],
        ];
    }

    public function serializeRequest(EmergencyUnlockRequest $request, ?User $viewer = null): array
    {
        $wallet = $request->wallet;
        $canDecide = $viewer
            && $request->status === 'pending'
            && $request->method === 'dual_approval'
            && $request->requested_by !== $viewer->id
            && $this->isAuthorized($wallet, $viewer);

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
            'created_at' => $request->created_at?->toIso8601String(),
            'decided_at' => $request->decided_at?->toIso8601String(),
            'can_approve' => $canDecide,
            'can_reject' => $canDecide,
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
