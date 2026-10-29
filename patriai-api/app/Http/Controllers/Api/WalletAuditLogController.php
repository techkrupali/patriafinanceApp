<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Models\WalletAuditLog;
use App\Services\AuditService;
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

        // WAL-14 "Everything · Rules · Members · Approvals".
        $category = $request->query('category');
        $events = AuditService::CATEGORIES[$category] ?? null;

        $logs = WalletAuditLog::where('wallet_id', $wallet->id)
            ->with('actor')
            ->when($events, fn ($q) => $q->whereIn('event', $events))
            ->latest()
            ->orderByDesc('id')
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Audit log fetched', [
            'audit_log' => collect($logs->items())->map(fn ($log) => self::serialize($log)),
            'pagination' => [
                'page' => $logs->currentPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'last_page' => $logs->lastPage(),
            ],
        ]);
    }

    /** "Emeka changed the approval limit — From ₦20,000 to ₦50,000 · Ngozi approved — 18 Oct, 9:14 am · iPhone". */
    public static function serialize(WalletAuditLog $log): array
    {
        $words = WalletManageController::auditTitle($log);

        return [
            'id' => $log->id,
            'event' => $log->event,
            'category' => AuditService::category($log->event),
            'title' => $words['title'],
            'detail' => $words['detail'],
            'description' => $log->description,
            'device' => $log->meta['device'] ?? null,
            'actor' => $log->actor ? [
                'id' => $log->actor->id,
                'name' => $log->actor->fullName(),
                'initials' => WalletManageController::initials($log->actor),
            ] : null,
            'meta' => $log->meta,
            'created_at' => $log->created_at?->toIso8601String(),
        ];
    }
}
