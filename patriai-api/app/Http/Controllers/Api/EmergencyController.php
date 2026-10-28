<?php

namespace App\Http\Controllers\Api;

use App\Models\EmergencyBeneficiary;
use App\Models\EmergencySetting;
use App\Models\EmergencyUnlockRequest;
use App\Models\Wallet;
use App\Services\EmergencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Emergency Wallet access (owner, named approver and recipients). Rules are set
 * at creation (POST /wallets); these endpoints unlock, re-lock and pay out.
 */
class EmergencyController extends ApiController
{
    /** Members of the wallet, plus anyone named in its rules, may see them. */
    private function visible(Request $request, Wallet $wallet): bool
    {
        $user = $request->user();
        if ($wallet->type !== 'emergency' || !$wallet->emergencySetting) {
            return false;
        }

        return $wallet->isAccessibleBy($user) || EmergencyService::make()->isAuthorized($wallet, $user);
    }

    private function detail(Request $request, Wallet $wallet, string $message): JsonResponse
    {
        $wallet->unsetRelation('emergencySetting');

        return $this->ok($message, ['emergency' => EmergencyService::make()->detail($wallet->refresh(), $request->user())]);
    }

    // GET /wallets/{wallet}/emergency
    public function show(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        return $this->detail($request, $wallet, 'Emergency rules fetched');
    }

    // POST /wallets/{wallet}/emergency/unlock  { pin, reason? } — owner, custom PIN + why
    public function unlock(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'pin' => ['required', 'digits:4'],
            'reason' => ['nullable', 'string', 'max:150'],
        ]);
        EmergencyService::make()->manualUnlock($wallet, $request->user(), $data['pin'], $data['reason'] ?? null);

        return $this->detail($request, $wallet, 'Emergency wallet unlocked');
    }

    // POST /wallets/{wallet}/emergency/override  { pin } — owner, transaction PIN
    public function override(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate(['pin' => ['required', self::TXN_PIN]]);
        EmergencyService::make()->highBalanceOverride($wallet, $request->user(), $data['pin']);

        return $this->detail($request, $wallet, 'Emergency wallet unlocked by override');
    }

    /**
     * PUT /wallets/{wallet}/emergency/rules — owner changes the rules after setup.
     * { pin (transaction PIN), purpose?, dual_approval, approver_user_id?,
     *   unlock_on_document, manual_unlock, unlock_reason?, emergency_pin? (blank
     *   keeps the current custom PIN), override_*, beneficiary_note?, beneficiaries[] }
     */
    public function updateRules(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'pin' => ['required', self::TXN_PIN],
            'purpose' => ['sometimes', 'in:' . implode(',', EmergencySetting::PURPOSES)],
            'dual_approval' => ['sometimes', 'boolean'],
            'approver_user_id' => ['nullable', 'integer'],
            'unlock_on_document' => ['sometimes', 'boolean'],
            'manual_unlock' => ['sometimes', 'boolean'],
            'unlock_reason' => ['nullable', 'string', 'max:150'],
            'emergency_pin' => ['nullable', 'digits:4'],
            'override_national_crisis' => ['sometimes', 'boolean'],
            'override_high_balance' => ['sometimes', 'boolean'],
            'beneficiary_note' => ['nullable', 'string', 'max:1000'],
            // EMG-01/03/04: what it's for, keyholders, expiry and fast release.
            'purposes' => ['sometimes', 'array', 'max:4'],
            'purposes.*' => ['in:' . implode(',', EmergencySetting::PURPOSES)],
            'keyholders' => ['sometimes', 'array', 'max:6'],
            'keyholders.*' => ['integer'],
            'required_keyholders' => ['nullable', 'integer', 'between:1,7'],
            'request_expiry_hours' => ['nullable', 'in:' . implode(',', EmergencySetting::EXPIRY_HOURS)],
            'fast_release_limit' => ['nullable', 'numeric', 'min:0'],
            'fast_release_every_days' => ['nullable', 'in:' . implode(',', EmergencySetting::FAST_RELEASE_DAYS)],
            // EMG-03 pay the bill directly; EMG-05 trusted contacts (no app) and what they may do.
            'pay_directly' => ['sometimes', 'boolean'],
            'trusted_can_request' => ['sometimes', 'boolean'],
            'trusted_can_upload' => ['sometimes', 'boolean'],
            'trusted_can_see_balance' => ['sometimes', 'boolean'],
            'trusted_contacts' => ['sometimes', 'array', 'max:5'],
            'trusted_contacts.*.name' => ['required', 'string', 'max:80'],
            'trusted_contacts.*.phone' => ['required', 'string', 'max:20'],
            'trusted_contacts.*.relation' => ['nullable', 'string', 'max:80'],
            'beneficiaries' => ['sometimes', 'array', 'max:3'],
            'beneficiaries.*.user_id' => ['required', 'integer'],
            'beneficiaries.*.relationship' => ['nullable', 'string', 'max:40'],
            'beneficiaries.*.withdrawal_limit' => ['nullable', 'numeric', 'min:0'],
            'beneficiaries.*.access_type' => ['sometimes', 'in:' . implode(',', EmergencyBeneficiary::ACCESS_TYPES)],
        ]);

        foreach ($data['beneficiaries'] ?? [] as $i => $b) {
            $limit = $b['withdrawal_limit'] ?? null;
            $data['beneficiaries'][$i]['withdrawal_limit'] = ($limit === null || (float) $limit <= 0) ? null : $this->toKobo((string) $limit);
        }
        foreach ($data['trusted_contacts'] ?? [] as $i => $c) {
            $data['trusted_contacts'][$i]['phone'] = $this->normalizePhone($c['phone']);
        }
        if (array_key_exists('fast_release_limit', $data)) {
            $limit = $data['fast_release_limit'];
            $data['fast_release_limit'] = ($limit === null || (float) $limit <= 0) ? null : $this->toKobo((string) $limit);
        }
        $pin = $data['pin'];
        unset($data['pin']);

        $result = EmergencyService::make()->updateRules($wallet, $request->user(), $data, $pin);

        // With other keyholders the change waits for their yes (WCR-06).
        return $this->detail($request, $wallet, $result instanceof EmergencyUnlockRequest ? 'Sent to the keyholders to approve' : 'Emergency rules updated');
    }

    // POST /wallets/{wallet}/emergency/lock — owner
    public function lock(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        EmergencyService::make()->lock($wallet, $request->user());

        return $this->detail($request, $wallet, 'Emergency wallet locked');
    }

    /**
     * POST /wallets/{wallet}/emergency/requests
     * { method: dual_approval, note? } or multipart
     * { method: document, document_type, file, note? }
     */
    public function requestUnlock(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'method' => ['required', 'in:dual_approval,document'],
            'document_type' => ['required_if:method,document', 'nullable', 'in:' . implode(',', EmergencyUnlockRequest::DOCUMENT_TYPES)],
            'file' => ['required_if:method,document', 'nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'], // 10 MB
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $service = EmergencyService::make();
        $created = $data['method'] === 'document'
            ? $service->submitDocument($wallet, $request->user(), $data['document_type'], $request->file('file'), $data['note'] ?? null)
            : $service->requestDualApproval($wallet, $request->user(), $data['note'] ?? null);

        return $this->ok(
            $data['method'] === 'document' ? 'Document submitted for verification' : 'Unlock request sent',
            ['request' => $service->serializeRequest($created->load(['requester', 'approver']), $request->user())],
            201,
        );
    }

    // POST /emergency-requests/{emergencyUnlockRequest}/approve — second authorised person
    public function approve(Request $request, EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        if (!$this->visible($request, $emergencyUnlockRequest->wallet)) {
            return $this->fail('Request not found', 404);
        }
        $decided = EmergencyService::make()->approveRequest($emergencyUnlockRequest, $request->user())->refresh();
        $message = match (true) {
            $decided->status === 'pending' => 'Your yes is counted',
            $decided->method === 'rule_change' && $decided->status === 'approved' => 'New rules applied',
            $decided->method === 'rule_change' => $decided->review_note ?: 'The new rules could not be applied',
            default => 'Unlock approved',
        };

        return $this->detail($request, $emergencyUnlockRequest->wallet, $message);
    }

    // POST /emergency-requests/{emergencyUnlockRequest}/reject  { note? }
    public function reject(Request $request, EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        if (!$this->visible($request, $emergencyUnlockRequest->wallet)) {
            return $this->fail('Request not found', 404);
        }
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        EmergencyService::make()->rejectRequest($emergencyUnlockRequest, $request->user(), $data['note'] ?? null);

        return $this->detail($request, $emergencyUnlockRequest->wallet, 'Unlock request declined');
    }

    // POST /emergency-requests/{emergencyUnlockRequest}/cancel — requester
    public function cancel(Request $request, EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        if (!$this->visible($request, $emergencyUnlockRequest->wallet)) {
            return $this->fail('Request not found', 404);
        }
        EmergencyService::make()->cancelRequest($emergencyUnlockRequest, $request->user());

        return $this->detail($request, $emergencyUnlockRequest->wallet, 'Unlock request cancelled');
    }

    // POST /wallets/{wallet}/emergency/fast-release  multipart { amount, pin, proof, note? } — keyholder (EMG-04)
    public function fastRelease(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'pin' => ['required', self::TXN_PIN],
            'proof' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'], // photo of the bill or doctor's note
            'note' => ['nullable', 'string', 'max:500'],
            // When the fund pays bills directly: the hospital or clinic's account.
            'payee' => ['nullable', 'array'],
            'payee.bank_code' => ['required_with:payee', 'string'],
            'payee.account_number' => ['required_with:payee', 'digits:10'],
            'payee.account_name' => ['required_with:payee', 'string', 'max:120'],
            'payee.bank_name' => ['required_with:payee', 'string', 'max:120'],
        ]);

        $service = EmergencyService::make();
        $released = $service->fastRelease($wallet, $request->user(), $this->toKobo((string) $data['amount']), $data['pin'], $request->file('proof'), $data['note'] ?? null, $data['payee'] ?? null);
        $wallet->unsetRelation('emergencySetting');

        $to = $released->payee ? "Money sent to {$released->payee['account_name']}" : 'Money sent to your main wallet';

        return $this->ok($to, [
            'emergency' => $service->detail($wallet->refresh(), $request->user()),
            'reference' => $released->reference,
        ], 201);
    }

    // POST /wallets/{wallet}/emergency/withdraw  { amount, pin } — recipient → own main wallet
    public function withdraw(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->visible($request, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'pin' => ['required', self::TXN_PIN],
        ]);

        $service = EmergencyService::make();
        $result = $service->beneficiaryWithdraw($wallet, $request->user(), $this->toKobo((string) $data['amount']), $data['pin']);
        $wallet->unsetRelation('emergencySetting');

        return $this->ok('Money sent to your main wallet', [
            'emergency' => $service->detail($wallet->refresh(), $request->user()),
            'reference' => $result['reference'],
        ]);
    }
}
