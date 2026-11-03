<?php

namespace App\Services;

use App\Models\InviteBlock;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The invitation journey from the client prototype, around the invites
 * InvitationService creates:
 *  - FAM-06 / INV-02 / INV-K1 / INV-A1: what the person is asked to join and
 *    what they'll be able to do ("You: Contributor · You can't take money out");
 *  - the invite's own link, which only opens for the number it went to, and
 *    "Opened" once they've looked (FAM-05);
 *  - INV-03 decline with a reason and "Block future invites from Ngozi";
 *  - INV-04 "Ask Ngozi for a new invite";
 *  - FAM-05 the inviter's list: Waiting / Accepted / Expired, Resend all;
 *  - INV-A1 an accountant's read-only access to several wallets until a date.
 */
class InviteFlowService
{
    public const DECLINE_REASONS = ['Not right now', "I can't contribute", "I don't know this person"];

    public static function make(): self
    {
        return new self();
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /** Is this the person the invite went to (by account, phone, email or @tag)? */
    public function isFor(WalletInvitation $invitation, User $user): bool
    {
        if ($invitation->invitee_user_id) {
            return $invitation->invitee_user_id === $user->id;
        }
        $id = strtolower((string) $invitation->invitee_identifier);

        return $id !== '' && in_array($id, array_filter([
            strtolower((string) $user->phone),
            strtolower((string) $user->email),
            $user->username ? '@' . strtolower($user->username) : null,
        ]), true);
    }

    public function byCode(string $code): WalletInvitation
    {
        $invitation = WalletInvitation::with(['wallet', 'inviter'])->where('code', strtoupper(trim($code)))->first();
        if (!$invitation || !$invitation->wallet) {
            throw ValidationException::withMessages(['code' => "This invite link doesn't work. Ask for a new one."]);
        }

        return $invitation;
    }

    /** FAM-05 "Opened": the first time the link or the invite is looked at. */
    public function markOpened(WalletInvitation $invitation): void
    {
        if (!$invitation->opened_at && $invitation->status === 'pending') {
            // Not a change to the invite: "Resend" keys off updated_at.
            $invitation->timestamps = false;
            $invitation->forceFill(['opened_at' => now()])->saveQuietly();
            $invitation->timestamps = true;
        }
    }

    /** "+234 ••• ••• 0011" / "c•••@mail.com" — where the invite went, without giving it away. */
    public function masked(?string $identifier): string
    {
        $id = (string) $identifier;
        if (str_starts_with($id, '@')) {
            return $id;
        }
        if (str_contains($id, '@')) {
            [$name, $domain] = explode('@', $id, 2);

            return mb_substr($name, 0, 1) . '•••@' . $domain;
        }

        return strlen($id) > 4 ? substr($id, 0, 4) . ' ••• ••• ' . substr($id, -4) : $id;
    }

    private function roleLabel(WalletInvitation $i): string
    {
        if ($i->keyholder) {
            return 'Keyholder';
        }

        return match ($i->role) {
            'co_owner' => 'Co-owner',
            'admin' => 'Admin',
            'contributor' => 'Contributor',
            'accountant' => 'Accountant',
            'viewer' => $i->wallet?->type === 'ajo' ? 'Member' : 'Viewer',
            default => Str::headline((string) $i->role),
        };
    }

    /** Which screen the app shows for it. */
    private function kind(WalletInvitation $i): string
    {
        $type = $i->wallet?->type;

        return match (true) {
            $type === 'ajo' => 'ajo',
            $type === 'joint' => 'joint',
            $type === 'project' => 'project',
            $i->keyholder => 'keyholder',
            $i->role === 'accountant' => 'accountant',
            in_array($type, SavingsService::TYPES, true) && $i->pledge_amount !== null => 'savings',
            default => 'member',
        };
    }

    /** "Ngozi and Emeka": who approves payments on the wallet. */
    private function approvers(Wallet $wallet): string
    {
        $names = $wallet->members()->with('user')->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->get()
            ->map(fn (WalletMember $m) => $m->user?->first_name)->filter()->unique()->values();
        if ($names->isEmpty() && $wallet->owner) {
            $names = collect([$wallet->owner->first_name]);
        }

        return $names->count() > 1 ? $names->slice(0, -1)->join(', ') . ' and ' . $names->last() : (string) $names->first();
    }

    /** FAM-06 "You: Contributor" — what they can and can't do. */
    private function abilities(WalletInvitation $i, Wallet $wallet): array
    {
        $approvers = $this->approvers($wallet);
        if ($i->keyholder) {
            $setting = $wallet->emergencySetting;
            $need = (int) ($setting?->required_keyholders ?? 2);
            $of = max($need, count((array) ($setting?->keyholder_ids ?? [])) + 1);
            $hours = (int) ($setting?->request_expiry_hours ?? 6);

            return [
                'can' => array_values(array_filter([
                    "Says yes or no when money is needed. {$need} of {$of} keyholders must agree.",
                    "Answers fast. Requests expire after {$hours} hours.",
                    $i->pledge_amount ? "Saves {$this->naira($i->pledge_amount)} a month into the fund" : null,
                ])),
                'cannot' => ["Can't take money out alone"],
            ];
        }

        return match ($i->role) {
            'co_owner' => [
                'can' => ['Send, approve and set rules', 'See every naira that comes in and goes out'],
                'cannot' => [$approvers ? "Big payments may wait for {$approvers}'s yes" : 'Big payments may wait for a second yes'],
            ],
            'accountant' => [
                'can' => ['See statements for ' . $this->groupWalletNames($i)->join(', ', ' and '), 'Download PDF and CSV statements'],
                'cannot' => ["Can't move money, approve or change anything", "Children's wallets stay hidden"],
            ],
            'viewer' => [
                'can' => ['See the balance and every payment'],
                'cannot' => ["You can't move money or change anything"],
            ],
            default => [
                'can' => ['Add money from any bank, card or abroad', 'See every naira that comes in and goes out'],
                'cannot' => ["You can't take money out." . ($approvers ? " {$approvers} approve" . (str_contains($approvers, ' and ') ? '' : 's') . ' payments.' : '')],
            ],
        };
    }

    /** INV-A1 "See statements for Main, House Project and Giving". */
    private function groupWalletNames(WalletInvitation $i): Collection
    {
        if (!$i->group_key) {
            return collect([$i->wallet?->name])->filter();
        }

        return WalletInvitation::with('wallet')->where('group_key', $i->group_key)->orderBy('id')->get()->map(fn ($g) => $g->wallet?->name)->filter()->values();
    }

    /**
     * FAM-06 / INV-02 / INV-K1 / INV-A1: the invite as the invitee sees it.
     * $viewer is null on the web landing page.
     */
    public function preview(WalletInvitation $i, ?User $viewer = null): array
    {
        $wallet = $i->wallet;
        $inviter = $i->inviter;
        $status = $i->isExpired() ? 'expired' : $i->status;
        $target = (int) ($wallet->target_amount ?? 0);
        $abilities = $this->abilities($i, $wallet);
        $days = $i->expires_at && !$i->expires_at->isPast() ? (int) ceil(now()->diffInHours($i->expires_at) / 24) : 0;

        return [
            'id' => $i->id,
            'code' => $i->code,
            'link' => $i->link(),
            'status' => $status,
            'kind' => $this->kind($i),
            'for_you' => $viewer ? $this->isFor($i, $viewer) : null,
            'sent_to' => $this->masked($i->invitee_identifier),
            'inviter' => $inviter ? ['id' => $inviter->id, 'name' => $inviter->fullName(), 'first_name' => $inviter->first_name] : null,
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'type' => $wallet->type],
            'role' => $i->role,
            'role_label' => $this->roleLabel($i),
            'keyholder' => (bool) $i->keyholder,
            'progress' => $target > 0 ? [
                'balance' => number_format($wallet->balance / 100, 2, '.', ''),
                'target' => number_format($target / 100, 2, '.', ''),
                'percent' => min(100, (int) floor($wallet->balance * 100 / $target)),
                'due' => $wallet->target_date ? Carbon::parse($wallet->target_date)->format('j M') : null,
            ] : null,
            'can' => $abilities['can'],
            'cannot' => $abilities['cannot'],
            'note' => $i->message,
            'pledge' => $i->pledge_amount ? number_format($i->pledge_amount / 100, 2, '.', '') : null,
            'expires_at' => $i->expires_at?->toIso8601String(),
            'expires_label' => $days > 0 ? "In {$days} day" . ($days === 1 ? '' : 's') : null,
            'accountant' => $i->role === 'accountant' ? [
                'wallets' => $this->groupWalletNames($i)->all(),
                'access_until' => $i->access_until?->toDateString(),
                'access_until_label' => $i->access_until?->format('j M Y'),
            ] : null,
            'keyholder_info' => $i->keyholder ? [
                'required' => (int) ($wallet->emergencySetting?->required_keyholders ?? 2),
                'of' => max((int) ($wallet->emergencySetting?->required_keyholders ?? 2), count((array) ($wallet->emergencySetting?->keyholder_ids ?? [])) + 1),
                'hours' => (int) ($wallet->emergencySetting?->request_expiry_hours ?? 6),
                'needs_tier' => 2,
                'your_tier' => $viewer ? (int) $viewer->kyc_tier : null,
            ] : null,
        ];
    }

    /** INV-03: "Not right now", "I can't contribute", "I don't know this person" — and block them. */
    public function decline(WalletInvitation $i, User $user, ?string $reason, bool $block): void
    {
        if (!$this->isFor($i, $user)) {
            throw ValidationException::withMessages(['invitation' => 'This invite was for someone else.']);
        }
        if ($i->status !== 'pending') {
            throw ValidationException::withMessages(['invitation' => 'This invitation is no longer pending']);
        }
        $reason = $reason !== null ? mb_substr(trim($reason), 0, 80) : null;
        $siblings = $i->group_key ? WalletInvitation::where('group_key', $i->group_key)->where('status', 'pending')->get() : collect([$i]);
        foreach ($siblings as $s) {
            $s->update(['status' => 'declined', 'responded_at' => now(), 'decline_reason' => $reason ?: null, 'invitee_user_id' => $s->invitee_user_id ?? $user->id]);
        }
        if ($block && $i->inviter_id) {
            InviteBlock::firstOrCreate(['user_id' => $user->id, 'blocked_user_id' => $i->inviter_id]);
        }
        if ($i->inviter) {
            NotificationService::make()->push($i->inviter, 'invitation_declined', "{$user->first_name} declined your invite",
                "To {$i->wallet?->name}." . ($reason ? " \"{$reason}\"" : ''), ['wallet_id' => $i->wallet_id, 'invitation_id' => $i->id]);
        }
    }

    /** INV-04 "Ask Ngozi for a new invite. We can remind her for you." Once a day. */
    public function askAgain(WalletInvitation $i, ?User $asker): void
    {
        $inviter = $i->inviter;
        if (!$inviter) {
            throw ValidationException::withMessages(['invitation' => 'The person who invited you is no longer on Patriai.']);
        }
        if ($i->status === 'accepted') {
            throw ValidationException::withMessages(['invitation' => "You've already joined."]);
        }
        $already = $inviter->notificationsFeed()->where('type', 'invitation_ask_again')->where('created_at', '>', now()->subDay())
            ->where('data->invitation_id', $i->id)->exists();
        if ($already) {
            return;
        }
        // From the web page nobody is signed in: the invite went to one person, so name them.
        $who = $asker?->fullName() ?? $i->invitee?->fullName() ?? $this->masked($i->invitee_identifier);
        NotificationService::make()->push($inviter, 'invitation_ask_again', "{$who} asked for a new invite",
            "Their invite to {$i->wallet?->name} " . match (true) {
                $i->status === 'declined' => 'was declined',
                $i->status === 'cancelled' => 'was cancelled',
                $i->isExpired() => 'expired',
                default => "didn't open",
            } . '. Send a new one from Family → Invites.',
            ['wallet_id' => $i->wallet_id, 'invitation_id' => $i->id]);
    }

    /** FAM-05: the inviter's invites, Waiting / Accepted / Expired, with where each is. */
    public function sent(User $inviter, string $tab): array
    {
        $rows = WalletInvitation::with(['wallet', 'invitee'])->where('inviter_id', $inviter->id)->latest()->limit(100)->get();
        $pick = $rows->filter(fn (WalletInvitation $i) => match ($tab) {
            'accepted' => $i->status === 'accepted',
            'expired' => $i->isExpired() || in_array($i->status, ['declined', 'cancelled'], true),
            default => $i->status === 'pending' && !$i->isExpired(),
        });
        // A group of accountant invites shows once.
        $pick = $pick->unique(fn ($i) => $i->group_key ?? 'i' . $i->id);

        return $pick->map(function (WalletInvitation $i) {
            [$label, $tone] = $this->statusChip($i);

            return [
                'id' => $i->id,
                'wallet_id' => $i->wallet_id,
                'code' => $i->code,
                'link' => $i->link(),
                'name' => $i->invitee?->fullName() ?? $this->masked($i->invitee_identifier),
                'identifier' => $i->invitee_identifier,
                'role_label' => $this->roleLabel($i),
                'wallet_name' => $i->group_key ? $this->groupWalletNames($i)->join(', ') : $i->wallet?->name,
                'sent_at' => $i->created_at?->toIso8601String(),
                'status' => $i->isExpired() ? 'expired' : $i->status,
                'chip' => ['label' => $label, 'tone' => $tone],
                'decline_reason' => $i->decline_reason,
            ];
        })->values()->all();
    }

    /** "Sent" · "Opened" · "Verifying" · "Accepted" · "Expired" · "Declined". */
    private function statusChip(WalletInvitation $i): array
    {
        if ($i->isExpired()) {
            return ['Expired', 'neutral'];
        }

        return match ($i->status) {
            'accepted' => ['Accepted', 'success'],
            'declined' => ['Declined', 'danger'],
            'cancelled' => ['Cancelled', 'neutral'],
            default => match (true) {
                $i->keyholder && $i->invitee && (int) $i->invitee->kyc_tier < 2 => ['Verifying', 'warning'],
                (bool) $i->opened_at => ['Opened', 'brand'],
                default => ['Sent', 'neutral'],
            },
        };
    }

    /** FAM-05 "Resend all": every waiting invite not sent in the last minute, a fresh week each. */
    public function resendAll(User $inviter): int
    {
        $n = 0;
        $invitations = InvitationService::make();
        foreach (WalletInvitation::with('wallet')->where('inviter_id', $inviter->id)->where('status', 'pending')->get() as $i) {
            if (!$i->wallet || ($i->updated_at && $i->updated_at->gt(now()->subMinute()))) {
                continue;
            }
            $i->update(['expires_at' => now()->addDays(7)]);
            $invitations->deliver($i, $i->wallet, $inviter, $i->invitee_user_id ? User::find($i->invitee_user_id) : null);
            $n++;
        }

        return $n;
    }

    /**
     * INV-A1: read-only access for an accountant to several wallets, until a
     * date. Children's wallets are never offered.
     *
     * @param  list<int>  $walletIds
     * @return list<WalletInvitation>
     */
    public function inviteAccountant(User $inviter, array $walletIds, ?User $invitee, string $identifier, string $accessUntil, ?string $message): array
    {
        $until = Carbon::parse($accessUntil)->startOfDay();
        if ($until->lte(today())) {
            throw ValidationException::withMessages(['access_until' => 'Pick a date after today.']);
        }
        $wallets = Wallet::whereIn('id', $walletIds)->get();
        if ($wallets->isEmpty()) {
            throw ValidationException::withMessages(['wallet_ids' => 'Choose at least one wallet.']);
        }
        foreach ($wallets as $w) {
            if ($w->user_id !== $inviter->id || in_array($w->type, ['child', 'ajo'], true) || $w->status === 'closed') {
                throw ValidationException::withMessages(['wallet_ids' => "Choose your own wallets. Children's wallets stay hidden."]);
            }
        }
        $invitations = InvitationService::make();
        $invitee ??= $invitations->resolveInvitee($identifier);
        $key = Str::lower(Str::random(16));
        // All the wallets or none: one refused (already invited, already in) leaves nothing half-sent.
        $created = \Illuminate\Support\Facades\DB::transaction(function () use ($wallets, $invitations, $inviter, $invitee, $identifier, $message, $until, $key) {
            $out = [];
            foreach ($wallets as $w) {
                $out[] = $invitations->create($w, $inviter, $invitee, $invitee ? $invitations->identifierFor($invitee) : $identifier, 'accountant', false,
                    ['view' => true, 'fund' => false, 'request' => false, 'withdraw' => false], null, false, null, $message, 7, $until->toDateString(), $key);
            }

            return $out;
        });
        // One message for the whole set.
        $invitations->deliver($created[0], $created[0]->wallet, $inviter, $invitee);

        return $created;
    }

    /** Accept an accountant invite: every wallet in its set, read-only, until the date. */
    public function acceptAccountant(WalletInvitation $i, User $user): void
    {
        $set = $i->group_key ? WalletInvitation::where('group_key', $i->group_key)->where('status', 'pending')->get() : collect([$i]);
        foreach ($set as $s) {
            WalletMember::updateOrCreate(
                ['wallet_id' => $s->wallet_id, 'user_id' => $user->id],
                ['role' => 'viewer', 'can_approve' => false, 'status' => 'active', 'invited_by' => $s->inviter_id,
                    'permissions' => ['view' => true, 'fund' => false, 'request' => false, 'withdraw' => false, 'statements' => true, 'accountant' => true, 'access_until' => $s->access_until?->toDateString()]],
            );
            $s->update(['status' => 'accepted', 'responded_at' => now(), 'invitee_user_id' => $user->id]);
        }
    }

    /** INV-A1 "Access ends 31 Mar 2027": daily, an accountant's access closes on its date. */
    public function endExpiredAccess(): int
    {
        $n = 0;
        WalletMember::with(['user', 'wallet.owner'])->where('status', 'active')->where('role', 'viewer')->get()
            ->filter(fn (WalletMember $m) => !empty($m->permissions['access_until']) && Carbon::parse($m->permissions['access_until'])->lt(today()))
            ->each(function (WalletMember $m) use (&$n) {
                $m->update(['status' => 'removed']);
                $n++;
                if ($m->user) {
                    NotificationService::make()->push($m->user, 'access_ended', "Your access to {$m->wallet?->name} has ended", 'Ask the owner if you need more time.', ['wallet_id' => $m->wallet_id]);
                }
            });

        return $n;
    }
}
