<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\EmergencyUnlockRequest;
use App\Models\Wallet;
use App\Services\EmergencyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Admin side of Emergency Wallets: verify death certificates / legal notices
 * (approve = the wallet unlocks for its recipients) and the opt-in
 * national-crisis override.
 */
class EmergencyAdminController extends ApiController
{
    private function serialize(EmergencyUnlockRequest $request): array
    {
        $wallet = $request->wallet;

        return EmergencyService::make()->serializeRequest($request) + [
            'wallet' => $wallet ? [
                'id' => $wallet->id,
                'name' => $wallet->name,
                'balance' => $wallet->balanceNaira(),
                'owner' => $wallet->owner ? ['id' => $wallet->owner->id, 'name' => $wallet->owner->fullName(), 'email' => $wallet->owner->email] : null,
                'locked' => $wallet->isEmergencyLocked(),
            ] : null,
            'reviewed_by' => $request->reviewer?->fullName(),
        ];
    }

    // GET /admin/emergency-requests?status=&method=
    public function index(Request $request): JsonResponse
    {
        $page = EmergencyUnlockRequest::with(['wallet.owner', 'wallet.emergencySetting', 'requester', 'approver', 'reviewer'])
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('method'), fn ($q, $m) => $q->where('method', $m))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Emergency requests fetched', [
            'requests' => collect($page->items())->map(fn ($r) => $this->serialize($r)),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    // GET /admin/emergency-requests/{emergencyUnlockRequest}
    public function show(EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        $emergencyUnlockRequest->load(['wallet.owner', 'wallet.emergencySetting', 'requester', 'approver', 'reviewer']);
        $wallet = $emergencyUnlockRequest->wallet;
        $detail = $wallet?->owner ? EmergencyService::make()->detail($wallet, $wallet->owner) : null;

        return $this->ok('Emergency request fetched', [
            'request' => $this->serialize($emergencyUnlockRequest),
            'rules' => $detail['rules'] ?? null,
            'beneficiaries' => $detail['beneficiaries'] ?? [],
        ]);
    }

    // GET /admin/emergency-requests/{emergencyUnlockRequest}/document — streams the private upload
    public function document(EmergencyUnlockRequest $emergencyUnlockRequest): StreamedResponse|JsonResponse
    {
        $path = $emergencyUnlockRequest->document_path;
        if (!$path || !Storage::disk('local')->exists($path)) {
            return $this->fail('No document on this request', 404);
        }

        return Storage::disk('local')->response($path);
    }

    // POST /admin/emergency-requests/{emergencyUnlockRequest}/approve  { note? }
    public function approve(Request $request, EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $updated = EmergencyService::make()->adminApproveDocument($emergencyUnlockRequest, $request->user(), $data['note'] ?? null);

        return $this->ok('Document verified — wallet unlocked', ['request' => $this->serialize($updated->load(['wallet.owner', 'requester', 'approver', 'reviewer']))]);
    }

    // POST /admin/emergency-requests/{emergencyUnlockRequest}/reject  { note }
    public function reject(Request $request, EmergencyUnlockRequest $emergencyUnlockRequest): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:500']]);
        $updated = EmergencyService::make()->adminRejectDocument($emergencyUnlockRequest, $request->user(), $data['note']);

        return $this->ok('Document rejected', ['request' => $this->serialize($updated->load(['wallet.owner', 'requester', 'approver', 'reviewer']))]);
    }

    // POST /admin/wallets/{wallet}/emergency/crisis-unlock  { reason }
    public function crisisUnlock(Request $request, Wallet $wallet): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);
        EmergencyService::make()->adminCrisisUnlock($wallet, $request->user(), $data['reason']);

        return $this->ok('National-crisis override applied — wallet unlocked', [
            'emergency' => EmergencyService::make()->summary($wallet->refresh(), $request->user()),
        ]);
    }
}
