<?php

namespace App\Services;

use App\Models\SpousalSync;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Manages the two-person financial-transparency link ("Spousal Sync"). A sync
 * pairs an initiator with a partner and controls how much of the initiator's
 * financial picture the partner can see (transparency: minimal/selective/full).
 * This service is pure relationship/permission logic — it NEVER moves money.
 */
class SpousalSyncService
{
    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    /** Statuses that count as a live link (a user may only hold one at a time). */
    private const LIVE_STATUSES = ['pending', 'active', 'paused'];

    /** Resolve a user by email/phone identifier, mirroring InvitationController. */
    private function resolve(string $identifier): ?User
    {
        return str_contains($identifier, '@')
            ? User::where('email', strtolower($identifier))->first()
            : User::where('phone', $identifier)->first();
    }

    /** The party on the other side of the sync from $user, if known. */
    private function counterparty(SpousalSync $sync, User $user): ?User
    {
        return $sync->initiator_id === $user->id ? $sync->partner : $sync->initiator;
    }

    private function guardParty(SpousalSync $sync, User $actor): void
    {
        if (!$sync->involves($actor)) {
            throw ValidationException::withMessages(['sync' => 'You are not part of this sync.']);
        }
    }

    /**
     * Create a pending sync from $initiator to the person identified by
     * $identifier (email/phone). Attaches the partner if a user already exists.
     */
    public function invite(User $initiator, string $identifier): SpousalSync
    {
        $identifier = trim($identifier);
        $partner = $this->resolve($identifier);

        if ($partner && $partner->id === $initiator->id) {
            throw ValidationException::withMessages(['identifier' => 'You cannot sync with yourself.']);
        }

        // The initiator may only hold one live sync at a time.
        $initiatorLive = SpousalSync::whereIn('status', self::LIVE_STATUSES)
            ->where(function ($q) use ($initiator) {
                $q->where('initiator_id', $initiator->id)->orWhere('partner_id', $initiator->id);
            })
            ->exists();
        if ($initiatorLive) {
            throw ValidationException::withMessages(['sync' => 'You already have an active sync. End it before starting a new one.']);
        }

        // If the partner is a known user, they too must be free of a live sync.
        if ($partner) {
            $partnerLive = SpousalSync::whereIn('status', self::LIVE_STATUSES)
                ->where(function ($q) use ($partner) {
                    $q->where('initiator_id', $partner->id)->orWhere('partner_id', $partner->id);
                })
                ->exists();
            if ($partnerLive) {
                throw ValidationException::withMessages(['identifier' => 'This person already has an active sync.']);
            }
        }

        $sync = SpousalSync::create([
            'initiator_id' => $initiator->id,
            'partner_id' => $partner?->id,
            'partner_identifier' => $identifier,
            'transparency' => 'selective',
            'status' => 'pending',
            'shared_wallet_ids' => null,
        ]);

        if ($partner) {
            $this->notifications->push(
                $partner,
                'sync_invited',
                'Financial sync request',
                "{$initiator->fullName()} invited you to sync finances.",
                ['sync_id' => $sync->id, 'initiator_name' => $initiator->fullName()],
            );
        }

        return $sync;
    }

    /** The partner accepts or declines a pending sync. */
    public function respond(SpousalSync $sync, User $partner, bool $accept): SpousalSync
    {
        if ($sync->partner_id !== $partner->id) {
            throw ValidationException::withMessages(['sync' => 'You cannot respond to this sync.']);
        }
        if ($sync->status !== 'pending') {
            throw ValidationException::withMessages(['sync' => 'This sync is no longer pending.']);
        }

        $sync->update([
            'status' => $accept ? 'active' : 'ended',
            'responded_at' => now(),
        ]);

        if ($sync->initiator) {
            $this->notifications->push(
                $sync->initiator,
                $accept ? 'sync_accepted' : 'sync_declined',
                $accept ? 'Sync accepted' : 'Sync declined',
                $accept
                    ? "{$partner->fullName()} accepted your financial sync."
                    : "{$partner->fullName()} declined your financial sync.",
                ['sync_id' => $sync->id],
            );
        }

        return $sync;
    }

    /** Change the transparency level (and, for selective, the shared wallet set). */
    public function setTransparency(SpousalSync $sync, User $actor, string $level, ?array $walletIds): SpousalSync
    {
        $this->guardParty($sync, $actor);

        if (!in_array($level, ['minimal', 'selective', 'full'], true)) {
            throw ValidationException::withMessages(['transparency' => 'Invalid transparency level.']);
        }
        if (in_array($sync->status, ['ended'], true)) {
            throw ValidationException::withMessages(['sync' => 'This sync has ended.']);
        }

        $shared = null;
        if ($level === 'selective') {
            // Only wallets the acting user actually owns may be shared.
            $owned = $actor->wallets()->pluck('id')->all();
            $shared = collect($walletIds ?? [])
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => in_array($id, $owned, true))
                ->unique()
                ->values()
                ->all();
        }

        $sync->update([
            'transparency' => $level,
            'shared_wallet_ids' => $shared,
        ]);

        $other = $this->counterparty($sync, $actor);
        if ($other) {
            $this->notifications->push(
                $other,
                'sync_transparency_changed',
                'Sync transparency updated',
                "{$actor->fullName()} set transparency to {$level}.",
                ['sync_id' => $sync->id, 'transparency' => $level],
            );
        }

        return $sync;
    }

    /** Pause an active sync (temporarily hides shared data without ending it). */
    public function pause(SpousalSync $sync, User $actor): SpousalSync
    {
        $this->guardParty($sync, $actor);
        if ($sync->status !== 'active') {
            throw ValidationException::withMessages(['sync' => 'Only an active sync can be paused.']);
        }

        $sync->update(['status' => 'paused']);
        $this->notifyOther($sync, $actor, 'sync_paused', 'Sync paused', 'paused the financial sync.');

        return $sync;
    }

    /** Resume a paused sync. */
    public function resume(SpousalSync $sync, User $actor): SpousalSync
    {
        $this->guardParty($sync, $actor);
        if ($sync->status !== 'paused') {
            throw ValidationException::withMessages(['sync' => 'Only a paused sync can be resumed.']);
        }

        $sync->update(['status' => 'active']);
        $this->notifyOther($sync, $actor, 'sync_resumed', 'Sync resumed', 'resumed the financial sync.');

        return $sync;
    }

    /** End a sync permanently (either party may do this at any non-ended state). */
    public function end(SpousalSync $sync, User $actor): SpousalSync
    {
        $this->guardParty($sync, $actor);
        if ($sync->status === 'ended') {
            throw ValidationException::withMessages(['sync' => 'This sync has already ended.']);
        }

        $sync->update(['status' => 'ended']);
        $this->notifyOther($sync, $actor, 'sync_ended', 'Sync ended', 'ended the financial sync.');

        return $sync;
    }

    private function notifyOther(SpousalSync $sync, User $actor, string $type, string $title, string $bodyVerb): void
    {
        $other = $this->counterparty($sync, $actor);
        if ($other) {
            $this->notifications->push(
                $other,
                $type,
                $title,
                "{$actor->fullName()} {$bodyVerb}",
                ['sync_id' => $sync->id],
            );
        }
    }
}
