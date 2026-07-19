<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use Illuminate\Support\Facades\Log;

/**
 * Append-only writer for wallet governance events (who/what/when). Powers the
 * Wallet Audit Log (PRD 5.19/16.4). Dependency-free and deliberately
 * fail-soft: an audit-write failure must NEVER break the money/settings action
 * it accompanies, so create() is wrapped in a swallowing try/catch and always
 * returns null on failure rather than throwing into the caller.
 */
class AuditService
{
    public static function make(): self
    {
        return new self;
    }

    public function log(Wallet $wallet, ?User $actor, string $event, string $description, array $meta = []): ?WalletAuditLog
    {
        try {
            return WalletAuditLog::create([
                'wallet_id' => $wallet->id,
                'actor_id' => $actor?->id,
                'event' => $event,
                'description' => $description,
                'meta' => $meta ?: null,
            ]);
        } catch (\Throwable $e) {
            Log::warning("Audit log write failed for wallet {$wallet->id} event {$event}: {$e->getMessage()}");

            return null;
        }
    }
}
