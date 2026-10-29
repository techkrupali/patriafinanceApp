<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use Illuminate\Support\Facades\Log;

/**
 * Append-only writer for wallet governance events (who/what/when). Powers the
 * Wallet Audit Log (PRD 5.19/16.4, WAL-14). Dependency-free and deliberately
 * fail-soft: an audit-write failure must NEVER break the money/settings action
 * it accompanies, so create() is wrapped in a swallowing try/catch and always
 * returns null on failure rather than throwing into the caller.
 */
class AuditService
{
    /** WAL-14 filters: Rules · Members · Approvals (everything else shows under Everything). */
    public const CATEGORIES = [
        'rules' => ['rules_changed', 'rule_change_proposed', 'settings_changed', 'lock_set', 'lock_removed', 'rule_added', 'access_schedule_set', 'wallet_frozen', 'wallet_unfrozen'],
        'members' => ['member_added', 'member_removed', 'member_role_changed', 'permissions_changed', 'invitation_sent'],
        'approvals' => ['approval_approved', 'approval_rejected', 'unlock_requested'],
    ];

    public static function make(): self
    {
        return new self;
    }

    public function log(Wallet $wallet, ?User $actor, string $event, string $description, array $meta = []): ?WalletAuditLog
    {
        try {
            // "18 Oct, 9:14 am · iPhone": the device the change was made from.
            $device = $this->device();
            if ($device !== null) {
                $meta['device'] = $device;
            }

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

    public static function category(string $event): string
    {
        foreach (self::CATEGORIES as $category => $events) {
            if (in_array($event, $events, true)) {
                return $category;
            }
        }

        return 'other';
    }

    /** iPhone · Android · Web, from the request's user agent; null outside a request (scheduler, queue). */
    private function device(): ?string
    {
        if (app()->runningInConsole() && !app()->runningUnitTests()) {
            return null;
        }
        $agent = (string) request()?->userAgent();
        if ($agent === '') {
            return null;
        }

        return match (true) {
            (bool) preg_match('/iPhone|iPad|iOS|Darwin/i', $agent) => 'iPhone',
            (bool) preg_match('/Android|okhttp/i', $agent) => 'Android',
            default => 'Web',
        };
    }
}
