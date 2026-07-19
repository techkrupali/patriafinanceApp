<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Models\WalletAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletAuditLogController extends ApiController
{
    // GET /wallets/{wallet}/audit-log
    public function index(Request $request, Wallet $wallet): JsonResponse
    {
        $user = $request->user();

        if (!$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }

        // The full governance trail is owner/co_owner only — it exposes who
        // changed roles, permissions, freezes and settings across all members.
        if (!in_array($wallet->roleOf($user), ['owner', 'co_owner'], true)) {
            return $this->fail('Only the owner or a co-owner can view the audit log', 403);
        }

        $logs = WalletAuditLog::where('wallet_id', $wallet->id)
            ->with('actor')
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Audit log fetched', [
            'audit_log' => collect($logs->items())->map(fn ($log) => [
                'id' => $log->id,
                'event' => $log->event,
                'description' => $log->description,
                'actor' => $log->actor ? [
                    'id' => $log->actor->id,
                    'name' => $log->actor->fullName(),
                ] : null,
                'meta' => $log->meta,
                'created_at' => $log->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ],
        ]);
    }
}
