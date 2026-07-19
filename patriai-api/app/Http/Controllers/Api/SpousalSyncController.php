<?php

namespace App\Http\Controllers\Api;

use App\Models\SpousalSync;
use App\Models\Wallet;
use App\Services\SpousalSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SpousalSyncController extends ApiController
{
    /** Statuses that count as a live link. */
    private const LIVE_STATUSES = ['pending', 'active', 'paused'];

    // GET /sync  — the user's current live sync plus a short history.
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        $current = SpousalSync::with(['initiator', 'partner'])
            ->whereIn('status', self::LIVE_STATUSES)
            ->where(function ($q) use ($user) {
                $q->where('initiator_id', $user->id)->orWhere('partner_id', $user->id);
            })
            ->latest()
            ->first();

        $history = SpousalSync::with(['initiator', 'partner'])
            ->where('status', 'ended')
            ->where(function ($q) use ($user) {
                $q->where('initiator_id', $user->id)->orWhere('partner_id', $user->id);
            })
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn ($s) => $this->serializeSync($s, $user));

        return $this->ok('Sync fetched', [
            'sync' => $current ? $this->serializeSync($current, $user) : null,
            'history' => $history,
        ]);
    }

    // POST /sync  { identifier }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string', 'max:150'],
        ]);

        $sync = SpousalSyncService::make()->invite($request->user(), $data['identifier']);

        return $this->ok('Sync request sent', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ], 201);
    }

    // POST /sync/{spousalSync}/respond  { accept }
    public function respond(Request $request, SpousalSync $spousalSync): JsonResponse
    {
        if ($spousalSync->partner_id !== $request->user()->id) {
            return $this->fail('Sync not found', 404);
        }

        $data = $request->validate([
            'accept' => ['required', 'boolean'],
        ]);

        $sync = SpousalSyncService::make()->respond($spousalSync, $request->user(), $request->boolean('accept'));

        return $this->ok($data['accept'] ? 'Sync accepted' : 'Sync declined', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ]);
    }

    // PATCH /sync/{spousalSync}  { transparency, wallet_ids? }
    public function updateTransparency(Request $request, SpousalSync $spousalSync): JsonResponse
    {
        if (!$spousalSync->involves($request->user())) {
            return $this->fail('Sync not found', 404);
        }

        $data = $request->validate([
            'transparency' => ['required', 'in:minimal,selective,full'],
            'wallet_ids' => ['sometimes', 'array'],
            'wallet_ids.*' => ['integer'],
        ]);

        $sync = SpousalSyncService::make()->setTransparency(
            $spousalSync,
            $request->user(),
            $data['transparency'],
            $data['wallet_ids'] ?? null,
        );

        return $this->ok('Transparency updated', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ]);
    }

    // POST /sync/{spousalSync}/pause
    public function pause(Request $request, SpousalSync $spousalSync): JsonResponse
    {
        if (!$spousalSync->involves($request->user())) {
            return $this->fail('Sync not found', 404);
        }

        $sync = SpousalSyncService::make()->pause($spousalSync, $request->user());

        return $this->ok('Sync paused', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ]);
    }

    // POST /sync/{spousalSync}/resume
    public function resume(Request $request, SpousalSync $spousalSync): JsonResponse
    {
        if (!$spousalSync->involves($request->user())) {
            return $this->fail('Sync not found', 404);
        }

        $sync = SpousalSyncService::make()->resume($spousalSync, $request->user());

        return $this->ok('Sync resumed', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ]);
    }

    // POST /sync/{spousalSync}/end
    public function end(Request $request, SpousalSync $spousalSync): JsonResponse
    {
        if (!$spousalSync->involves($request->user())) {
            return $this->fail('Sync not found', 404);
        }

        $sync = SpousalSyncService::make()->end($spousalSync, $request->user());

        return $this->ok('Sync ended', [
            'sync' => $this->serializeSync($sync->load(['initiator', 'partner']), $request->user()),
        ]);
    }

    /**
     * Serialize a sync from $viewer's perspective. "partner" is always the OTHER
     * party relative to the viewer — a resolved user summary when known, else the
     * raw identifier that was invited.
     */
    private function serializeSync(SpousalSync $sync, \App\Models\User $viewer): array
    {
        $other = $sync->initiator_id === $viewer->id ? $sync->partner : $sync->initiator;

        $partner = $other
            ? ['name' => $other->fullName(), 'email' => $other->email]
            : ['identifier' => $sync->partner_identifier];

        $wallets = [];
        if ($sync->transparency === 'selective' && !empty($sync->shared_wallet_ids)) {
            $wallets = Wallet::whereIn('id', $sync->shared_wallet_ids)->get()
                ->map(fn (Wallet $w) => [
                    'id' => $w->id,
                    'name' => $w->name,
                    'type' => $w->type,
                    'balance' => $w->balanceNaira(),
                ])
                ->values()
                ->all();
        }

        return [
            'id' => $sync->id,
            'is_initiator' => $sync->initiator_id === $viewer->id,
            'partner' => $partner,
            'transparency' => $sync->transparency,
            'status' => $sync->status,
            'shared_wallet_ids' => $sync->shared_wallet_ids ?? [],
            'wallets' => $wallets,
            'responded_at' => $sync->responded_at?->toIso8601String(),
            'created_at' => $sync->created_at?->toIso8601String(),
        ];
    }
}
