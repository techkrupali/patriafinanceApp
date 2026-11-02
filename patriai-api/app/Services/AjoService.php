<?php

namespace App\Services;

use App\Models\AjoCircle;
use App\Models\AjoContribution;
use App\Models\AjoMember;
use App\Models\AjoPayout;
use App\Models\AjoSwap;
use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\ConversationMessage;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use App\Models\WalletMember;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Ajo circles from the client prototype (AJO-01…04, INV-J1, WPV-06, AIQ-06).
 *
 * Everyone pays the same amount each round into a pot Patriai holds — an `ajo`
 * wallet nobody can spend from, the organiser included ("Organisers can't touch
 * the pot") — and on the payout day the whole pot goes to that round's member,
 * in a drawn or agreed order. Payments go automatically from Main on the due
 * day; after a few days a late fee is added and goes into that round's pot, and
 * "Miss 3 rounds and you lose your turn" (it moves to the end). Members may swap
 * turns when both agree. Amounts are kobo.
 */
class AjoService
{
    public const TIMEZONE = 'Africa/Lagos';

    /** Rounds open and turns are paid from 7:00 am, like giving dates. */
    public const RUN_HOUR = 7;

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
        return '₦' . number_format($kobo / 100);
    }

    private function money(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    /**
     * Today in Lagos, as a plain date (midnight in the app's timezone) so it
     * compares like the circle's date columns.
     */
    public function today(?Carbon $now = null): Carbon
    {
        return Carbon::parse(($now ?? now())->copy()->setTimezone(self::TIMEZONE)->toDateString());
    }

    public function forWallet(Wallet $wallet): ?AjoCircle
    {
        return $wallet->type === 'ajo' ? AjoCircle::where('wallet_id', $wallet->id)->first() : null;
    }

    // ------------------------------------------------------------------ setup

    /**
     * AJO-01: name, what each person pays, how many people, weekly or monthly,
     * when it starts and the late fee. The organiser is the first member.
     */
    public function create(User $organiser, array $d): AjoCircle
    {
        // Sharing a wallet starts at Tier 2 (ME-23), and an ajo is shared money.
        if (!LimitService::make()->tier((int) $organiser->kyc_tier)['shared_wallets']) {
            throw ValidationException::withMessages(['ajo' => 'Ajo circles start at Tier 2. Verify your NIN and a selfie to start one.']);
        }
        $rules = $this->rules($d, true);
        $starts = Carbon::parse(Carbon::parse($d['starts_on'])->toDateString());
        if ($starts->lt($this->today())) {
            throw ValidationException::withMessages(['starts_on' => 'Pick today or a day after.']);
        }

        return DB::transaction(function () use ($organiser, $d, $rules, $starts) {
            $wallet = $this->wallets->createWallet($organiser, 'ajo', trim($d['name']), ['meta' => ['purpose' => 'ajo']]);
            $conversation = Conversation::create(['kind' => 'group', 'title' => $wallet->name, 'created_by' => $organiser->id]);
            ConversationMember::create(['conversation_id' => $conversation->id, 'user_id' => $organiser->id]);
            ConversationMessage::create(['conversation_id' => $conversation->id, 'kind' => 'system', 'body' => "{$organiser->first_name} started the circle \"{$wallet->name}\""]);

            $circle = AjoCircle::create($rules + [
                'wallet_id' => $wallet->id,
                'organiser_id' => $organiser->id,
                'starts_on' => $starts->toDateString(),
                'code' => $this->newCode(),
                'conversation_id' => $conversation->id,
                'status' => 'forming',
            ]);
            AjoMember::create(['circle_id' => $circle->id, 'user_id' => $organiser->id, 'auto_pay' => true, 'source_wallet_id' => $organiser->mainWallet()?->id]);

            return $circle;
        });
    }

    /** Validated circle rules; the money and the size only while it's forming. */
    private function rules(array $d, bool $forming): array
    {
        $out = [];
        if ($forming) {
            $contribution = (int) ($d['contribution'] ?? 0);
            if ($contribution < 50_000) {
                throw ValidationException::withMessages(['contribution' => 'Each person pays at least ₦500.']);
            }
            $size = (int) ($d['size'] ?? 0);
            if ($size < AjoCircle::MIN_SIZE || $size > AjoCircle::MAX_SIZE) {
                throw ValidationException::withMessages(['size' => 'A circle has 2 to ' . AjoCircle::MAX_SIZE . ' people.']);
            }
            if (!in_array($d['frequency'] ?? null, AjoCircle::FREQUENCIES, true)) {
                throw ValidationException::withMessages(['frequency' => 'Choose weekly or monthly.']);
            }
            $out += ['contribution' => $contribution, 'size' => $size, 'frequency' => $d['frequency']];
        }
        if (array_key_exists('late_fee', $d)) {
            $fee = (int) $d['late_fee'];
            if ($fee < 0 || ($forming && $fee > ($out['contribution'] ?? PHP_INT_MAX))) {
                throw ValidationException::withMessages(['late_fee' => 'The late fee can be up to one contribution.']);
            }
            $out['late_fee'] = $fee;
        }
        if (array_key_exists('late_after_days', $d)) {
            $days = (int) $d['late_after_days'];
            if ($days < 1 || $days > 3) {
                throw ValidationException::withMessages(['late_after_days' => 'The fee applies 1 to 3 days after the due day, before the payout.']);
            }
            $out['late_after_days'] = $days;
        }
        if (array_key_exists('allow_swaps', $d)) {
            $out['allow_swaps'] = (bool) $d['allow_swaps'];
        }

        return $out;
    }

    private function newCode(): string
    {
        do {
            $code = strtoupper(Str::random(6));
            $code = strtr($code, ['0' => 'X', 'O' => 'Y', '1' => 'Z', 'I' => 'W', 'L' => 'Q']);
        } while (AjoCircle::where('code', $code)->exists());

        return $code;
    }

    /** "Edit rules": the name, late fee and swaps any time; the money and dates before it starts. */
    public function updateRules(AjoCircle $circle, User $organiser, array $d): AjoCircle
    {
        $this->requireOrganiser($circle, $organiser);
        if (!in_array($circle->status, ['forming', 'active'], true)) {
            throw ValidationException::withMessages(['ajo' => 'This circle has ended.']);
        }
        $forming = $circle->status === 'forming';
        $moneyKeys = ['contribution', 'size', 'frequency', 'starts_on'];
        if (!$forming && array_intersect($moneyKeys, array_keys(array_filter($d, fn ($v) => $v !== null)))) {
            throw ValidationException::withMessages(['ajo' => "The amount, people and dates are set once the circle starts."]);
        }
        $changes = $this->rules($forming ? $d + $circle->only(['contribution', 'size', 'frequency']) : $d, $forming);
        if ($forming && !empty($d['starts_on'])) {
            $starts = Carbon::parse(Carbon::parse($d['starts_on'])->toDateString());
            if ($starts->lt($this->today())) {
                throw ValidationException::withMessages(['starts_on' => 'Pick today or a day after.']);
            }
            $changes['starts_on'] = $starts->toDateString();
        }
        if ($forming && isset($changes['size']) && $changes['size'] < $circle->activeMembers()->count()) {
            throw ValidationException::withMessages(['size' => 'More people have joined than that.']);
        }
        if (!empty($d['name']) && trim($d['name']) !== $circle->wallet->name) {
            $circle->wallet->update(['name' => trim($d['name'])]);
            Conversation::whereKey($circle->conversation_id)->update(['title' => trim($d['name'])]);
        }
        $circle->update($changes);

        return $circle->refresh();
    }

    // ---------------------------------------------------------------- members

    /** INV-J1: someone the organiser asked, by @tag or phone. */
    public function invite(AjoCircle $circle, User $organiser, ?User $invitee, string $identifier): WalletInvitation
    {
        $this->requireOrganiser($circle, $organiser);
        if ($circle->status !== 'forming') {
            throw ValidationException::withMessages(['ajo' => 'The circle has started. Replace a member instead.']);
        }
        if ($circle->activeMembers()->count() >= $circle->size) {
            throw ValidationException::withMessages(['ajo' => 'Everyone has joined. Make the circle bigger to invite more.']);
        }
        if ($invitee && $circle->activeMembers()->where('user_id', $invitee->id)->exists()) {
            throw ValidationException::withMessages(['invite' => "{$invitee->first_name} is already in the circle."]);
        }

        return $this->sendInvite($circle, $organiser, $invitee, $identifier);
    }

    private function sendInvite(AjoCircle $circle, User $organiser, ?User $invitee, string $identifier): WalletInvitation
    {
        $invitations = InvitationService::make();
        $invitee ??= $invitations->resolveInvitee($identifier);
        $invitation = $invitations->create($circle->wallet, $organiser, $invitee, $invitee ? $invitations->identifierFor($invitee) : $identifier, 'viewer');
        $invitations->deliver($invitation, $circle->wallet, $organiser, $invitee);

        return $invitation;
    }

    /** TRS-03 "Join an ajo circle · With a code from the organiser". */
    public function byCode(string $code): AjoCircle
    {
        $circle = AjoCircle::where('code', strtoupper(trim($code)))->first();
        if (!$circle || $circle->status === 'cancelled') {
            throw ValidationException::withMessages(['code' => "That code doesn't match a circle. Check it with the organiser."]);
        }

        return $circle;
    }

    /**
     * INV-J1 "Join the circle": everyone must be verified; "Pay automatically
     * from Main". A person replacing someone takes their turn.
     */
    public function join(AjoCircle $circle, User $user, bool $autoPay = true, ?WalletInvitation $invitation = null): AjoMember
    {
        if ($circle->members()->where('user_id', $user->id)->whereIn('status', ['active', 'lost_turn'])->exists()) {
            throw ValidationException::withMessages(['ajo' => "You're already in this circle."]);
        }
        if ($user->isChild()) {
            throw ValidationException::withMessages(['ajo' => 'Ajo circles are for grown-ups.']);
        }
        if ((int) $user->kyc_tier < 1) {
            throw ValidationException::withMessages(['ajo' => 'Everyone must be verified to join. Verify your BVN first.']);
        }
        $replacing = $invitation ? AjoMember::where('circle_id', $circle->id)->where('replaced_by_invitation_id', $invitation->id)->where('status', 'active')->first() : null;
        if (!$replacing) {
            if ($circle->status !== 'forming') {
                throw ValidationException::withMessages(['ajo' => 'This circle has already started.']);
            }
            if ($circle->activeMembers()->count() >= $circle->size) {
                throw ValidationException::withMessages(['ajo' => 'This circle is full.']);
            }
        }
        $main = $user->mainWallet();

        $member = DB::transaction(function () use ($circle, $user, $autoPay, $invitation, $replacing, $main) {
            WalletMember::updateOrCreate(
                ['wallet_id' => $circle->wallet_id, 'user_id' => $user->id],
                ['role' => 'viewer', 'can_approve' => false, 'status' => 'active', 'invited_by' => $invitation?->inviter_id ?? $circle->organiser_id],
            );
            $member = AjoMember::updateOrCreate(
                ['circle_id' => $circle->id, 'user_id' => $user->id],
                ['position' => $replacing?->position, 'status' => 'active', 'auto_pay' => $autoPay, 'source_wallet_id' => $main?->id, 'missed' => 0, 'replaced_by_invitation_id' => null],
            );
            if ($replacing) {
                // What they still owed is now the newcomer's, without their late fees.
                AjoContribution::where('member_id', $replacing->id)->where('status', 'due')->update(['member_id' => $member->id, 'late' => false, 'fee' => 0, 'tried_on' => null]);
                $replacing->update(['status' => 'replaced', 'position' => null]);
                WalletMember::where('wallet_id', $circle->wallet_id)->where('user_id', $replacing->user_id)->update(['status' => 'removed']);
                ConversationMember::where('conversation_id', $circle->conversation_id)->where('user_id', $replacing->user_id)->update(['left_at' => now()]);
            }
            if ($circle->conversation_id) {
                ConversationMember::updateOrCreate(['conversation_id' => $circle->conversation_id, 'user_id' => $user->id], ['left_at' => null]);
                ConversationMessage::create(['conversation_id' => $circle->conversation_id, 'kind' => 'system', 'body' => "{$user->first_name} joined" . ($replacing ? " in {$replacing->user?->first_name}'s place" : '')]);
            }
            $invitation?->update(['status' => 'accepted', 'responded_at' => now()]);

            return $member;
        });

        $joined = $circle->activeMembers()->count();
        $organiser = $circle->organiser;
        if ($organiser && $organiser->id !== $user->id) {
            $this->notifications->push($organiser, 'ajo_joined', "{$user->first_name} joined {$circle->wallet->name}",
                $replacing ? "{$user->first_name} takes {$replacing->user?->first_name}'s turn." : ($joined >= $circle->size ? "Everyone has joined. Set the order and start the circle." : "{$joined} of {$circle->size} have joined."),
                ['wallet_id' => $circle->wallet_id]);
        }
        AuditService::make()->log($circle->wallet, $user, 'member_added', "{$user->fullName()} joined the circle", ['user_id' => $user->id]);

        return $member;
    }

    /** "Pay automatically from Main" on or off. */
    public function setAutoPay(AjoCircle $circle, User $user, bool $on): AjoMember
    {
        $member = $this->memberOf($circle, $user);
        $member->update(['auto_pay' => $on, 'source_wallet_id' => $member->source_wallet_id ?? $user->mainWallet()?->id]);

        return $member;
    }

    /**
     * WPV-06 "Replace member": someone whose turn hasn't come and who hasn't
     * paid in yet. The new person takes their turn when they join.
     */
    public function replace(AjoCircle $circle, User $organiser, AjoMember $member, ?User $invitee, string $identifier): WalletInvitation
    {
        $this->requireOrganiser($circle, $organiser);
        if ($member->circle_id !== $circle->id || $member->status !== 'active' || $member->user_id === $organiser->id) {
            throw ValidationException::withMessages(['member' => 'Choose a member of the circle.']);
        }
        if ($circle->status === 'active') {
            $current = $circle->roundOn($this->today());
            if ($member->position <= $current) {
                throw ValidationException::withMessages(['member' => "{$member->user?->first_name}'s turn has come, so they stay."]);
            }
        }
        if ($member->contributions()->where('status', 'paid')->exists()) {
            throw ValidationException::withMessages(['member' => "{$member->user?->first_name} has paid in, so they keep their place."]);
        }
        if ($invitee && $circle->members()->where('user_id', $invitee->id)->whereIn('status', ['active', 'lost_turn'])->exists()) {
            throw ValidationException::withMessages(['invite' => "{$invitee->first_name} is already in the circle."]);
        }
        $invitation = $this->sendInvite($circle, $organiser, $invitee, $identifier);
        $member->update(['replaced_by_invitation_id' => $invitation->id]);

        return $invitation;
    }

    /** The organiser closes a circle that hasn't started. No money has moved yet. */
    public function cancel(AjoCircle $circle, User $organiser): void
    {
        $this->requireOrganiser($circle, $organiser);
        if ($circle->status !== 'forming') {
            throw ValidationException::withMessages(['ajo' => 'A circle that has started runs to the end.']);
        }
        DB::transaction(function () use ($circle) {
            $circle->update(['status' => 'cancelled']);
            $circle->wallet->update(['status' => 'closed', 'meta' => array_merge($circle->wallet->meta ?? [], ['closed' => ['mode' => 'archive', 'at' => now()->toIso8601String()]])]);
            WalletInvitation::where('wallet_id', $circle->wallet_id)->where('status', 'pending')->update(['status' => 'cancelled']);
        });
        foreach ($circle->activeMembers()->with('user')->get() as $m) {
            if ($m->user && $m->user_id !== $circle->organiser_id) {
                $this->notifications->push($m->user, 'ajo_cancelled', "{$circle->wallet->name} won't go ahead", "{$circle->organiser?->first_name} cancelled the circle before it started. No money moved.", ['wallet_id' => $circle->wallet_id]);
            }
        }
    }

    // ------------------------------------------------------------------ start

    /**
     * AJO-02 "Start the circle": a random draw or the agreed order, and whether
     * members may swap turns. It starts with the people who have joined.
     *
     * @param  list<int>|null  $order  member ids, first turn first (agreed order)
     */
    public function start(AjoCircle $circle, User $organiser, string $mode, ?array $order, bool $allowSwaps, ?Carbon $now = null): AjoCircle
    {
        $this->requireOrganiser($circle, $organiser);
        if ($circle->status !== 'forming') {
            throw ValidationException::withMessages(['ajo' => 'This circle has already started.']);
        }
        $members = $circle->activeMembers()->orderBy('id')->get();
        if ($members->count() < AjoCircle::MIN_SIZE) {
            throw ValidationException::withMessages(['ajo' => 'At least 2 people need to join before it starts.']);
        }
        if (!in_array($mode, ['random', 'agreed'], true)) {
            throw ValidationException::withMessages(['order_mode' => 'Choose a random draw or an agreed order.']);
        }
        $ids = $members->pluck('id')->all();
        if ($mode === 'agreed') {
            $order = array_map('intval', array_values($order ?? []));
            $sorted = $order;
            sort($sorted);
            $check = $ids;
            sort($check);
            if ($sorted !== $check) {
                throw ValidationException::withMessages(['order' => 'Put everyone in the order once.']);
            }
        } else {
            // A fair draw: Fisher–Yates with a cryptographic random source.
            $order = $ids;
            for ($i = count($order) - 1; $i > 0; $i--) {
                $j = random_int(0, $i);
                [$order[$i], $order[$j]] = [$order[$j], $order[$i]];
            }
        }
        $today = $this->today($now);

        DB::transaction(function () use ($circle, $order, $mode, $allowSwaps, $today, $members) {
            foreach ($order as $i => $memberId) {
                AjoMember::whereKey($memberId)->update(['position' => $i + 1]);
            }
            $circle->update([
                'status' => 'active',
                'order_mode' => $mode,
                'allow_swaps' => $allowSwaps,
                'size' => $members->count(),
                'starts_on' => $circle->starts_on->lt($today) ? $today->toDateString() : $circle->starts_on->toDateString(),
                'started_at' => now(),
            ]);
            WalletInvitation::where('wallet_id', $circle->wallet_id)->where('status', 'pending')->update(['status' => 'cancelled']);
        });
        $circle->refresh();

        $list = $circle->activeMembers()->with('user')->orderBy('position')->get();
        $lines = $list->map(fn (AjoMember $m) => "{$m->position}. {$m->shortName()} · {$this->turnLabel($circle, $m->position)}")->join("\n");
        if ($circle->conversation_id) {
            ConversationMessage::create(['conversation_id' => $circle->conversation_id, 'kind' => 'system', 'body' => ($mode === 'random' ? "The order was drawn:\n" : "The order:\n") . $lines]);
        }
        foreach ($list as $m) {
            if ($m->user) {
                $this->notifications->push($m->user, 'ajo_started', "{$circle->wallet->name} has started",
                    "Your turn is {$this->turnLabel($circle, $m->position)} ({$this->ordinal($m->position)}). You'll receive {$this->naira($circle->payoutAmount())}. You pay {$this->naira($circle->contribution)} {$this->every($circle)}, from {$this->dayLabel($circle->dueOn(1))}.",
                    ['wallet_id' => $circle->wallet_id]);
            }
        }
        AuditService::make()->log($circle->wallet, $circle->organiser, 'ajo_started', 'Started the circle', ['order_mode' => $mode]);

        // A circle that starts today opens its first round now.
        $this->runCircle($circle, $now ?? now());

        return $circle->refresh();
    }

    // ----------------------------------------------------------------- rounds

    /** Hourly from 7:00 am: open rounds, take payments, add late fees, pay turns. */
    public function runDue(?Carbon $now = null): array
    {
        $now = ($now ?? now())->copy()->setTimezone(self::TIMEZONE);
        if ($now->hour < self::RUN_HOUR) {
            return [];
        }
        $results = [];
        foreach (AjoCircle::where('status', 'active')->get() as $circle) {
            try {
                $results[$circle->id] = $this->runCircle($circle, $now);
            } catch (\Throwable $e) {
                Log::warning("Ajo circle {$circle->id} failed: {$e->getMessage()}");
                $results[$circle->id] = ['error' => $e->getMessage()];
            }
        }

        return $results;
    }

    public function runCircle(AjoCircle $circle, Carbon $now): array
    {
        $today = $this->today($now);
        $current = $circle->roundOn($today);
        $out = ['opened' => 0, 'paid' => 0, 'late' => 0, 'payouts' => 0];
        if ($current === 0) {
            return $out;
        }

        // 1. Each round's contributions, once its due day comes.
        for ($r = 1; $r <= $current; $r++) {
            if ($circle->contributions()->where('round', $r)->exists()) {
                continue;
            }
            foreach ($circle->activeMembers()->get() as $m) {
                AjoContribution::firstOrCreate(
                    ['circle_id' => $circle->id, 'member_id' => $m->id, 'round' => $r],
                    ['due_on' => $circle->dueOn($r)->toDateString(), 'amount' => $circle->contribution],
                );
            }
            $out['opened']++;
        }

        // 2. Late fees, then automatic payments (once a day each).
        $due = $circle->contributions()->with(['member.user', 'member.sourceWallet'])->where('status', 'due')->where('round', '<=', $current)->orderBy('round')->get();
        foreach ($due as $k) {
            if (!$k->late && $today->gte($k->due_on->copy()->addDays($circle->late_after_days))) {
                $this->markLate($circle, $k, $current);
                $out['late']++;
            }
        }
        foreach ($due as $k) {
            $k->refresh();
            if ($k->status !== 'due' || !$k->member?->auto_pay || $k->tried_on?->equalTo($today)) {
                continue;
            }
            $k->update(['tried_on' => $today->toDateString()]);
            $from = $k->member->sourceWallet ?? $k->member->user?->mainWallet();
            try {
                if (!$from || !$k->member->user) {
                    throw ValidationException::withMessages(['wallet' => 'No wallet to pay from.']);
                }
                $this->payContribution($circle, $k, $from, $k->member->user);
                $out['paid']++;
            } catch (ValidationException $e) {
                // "Main didn't have enough on 1 Dec": they hear once, on the due day.
                if ($k->due_on->equalTo($today) && $k->member->user) {
                    $this->notifications->push($k->member->user, 'ajo_payment_failed', "{$circle->wallet->name}: your {$this->naira($k->amount)} didn't go",
                        ($from?->name ?? 'Main') . " didn't have enough. Pay it before {$this->dayLabel($k->due_on->copy()->addDays($circle->late_after_days))} to avoid the {$this->naira($circle->late_fee)} late fee.",
                        ['wallet_id' => $circle->wallet_id, 'ajo_contribution_id' => $k->id]);
                }
            }
        }

        // 3. Turns whose payout day has come.
        for ($r = 1; $r <= $current; $r++) {
            if ($circle->payOn($r)->lte($today) && !$circle->payouts()->where('round', $r)->exists()) {
                if ($this->payRound($circle, $r)) {
                    $out['payouts']++;
                }
            }
        }

        // 4. The last turn is paid: the circle is complete.
        if ($current === $circle->size && $circle->payouts()->where('round', $circle->size)->exists() && $circle->status === 'active') {
            $circle->update(['status' => 'completed', 'completed_at' => now()]);
            foreach ($circle->activeMembers()->with('user')->get() as $m) {
                if ($m->user) {
                    $this->notifications->push($m->user, 'ajo_completed', "{$circle->wallet->name} is complete", "Everyone has had their turn. Well done, all of you.", ['wallet_id' => $circle->wallet_id]);
                }
            }
        }

        return $out;
    }

    /** AJO-04 "December's ₦50,000 is 3 days late": the fee is added, and it counts as missed. */
    private function markLate(AjoCircle $circle, AjoContribution $k, int $current): void
    {
        $k->update(['late' => true, 'fee' => $circle->late_fee]);
        $member = $k->member;
        $member->increment('missed');
        $member->refresh();
        $user = $member->user;
        $waiting = $circle->activeMembers()->with('user')->where('position', $k->round)->first();
        if ($user) {
            $this->notifications->push($user, 'ajo_late', "{$this->monthName($circle, $k->round)}'s {$this->naira($k->amount)} is late",
                "Pay {$this->naira($k->total())} now, with the {$this->naira($k->fee)} late fee." . ($waiting && $waiting->user_id !== $user->id ? " {$waiting->user?->first_name} is waiting on their payout." : '') . " Miss " . AjoCircle::MISSES_TO_LOSE_TURN . " rounds and you lose your turn. You have missed {$member->missed}.",
                ['wallet_id' => $circle->wallet_id, 'ajo_contribution_id' => $k->id]);
        }
        if ($circle->organiser && $circle->organiser_id !== $member->user_id) {
            $this->notifications->push($circle->organiser, 'ajo_late', "{$member->shortName()} is late in {$circle->wallet->name}", "{$this->naira($k->total())} with the fee, for round {$k->round}.", ['wallet_id' => $circle->wallet_id]);
        }
        $this->loseTurnIfMissed($circle, $member, $current);
    }

    /** "Miss 3 rounds and you lose your turn": a turn still ahead moves to the end. */
    private function loseTurnIfMissed(AjoCircle $circle, AjoMember $member, int $current): void
    {
        if ($member->missed < AjoCircle::MISSES_TO_LOSE_TURN || $member->status !== 'active' || !$member->position || $member->position <= $current) {
            return;
        }
        DB::transaction(function () use ($circle, $member) {
            $from = $member->position;
            $last = (int) $circle->activeMembers()->max('position');
            AjoMember::where('circle_id', $circle->id)->whereIn('status', ['active', 'lost_turn'])->where('position', '>', $from)->decrement('position');
            $member->update(['position' => $last, 'status' => 'lost_turn']);
            AjoSwap::where('circle_id', $circle->id)->where('status', 'pending')->where(fn ($q) => $q->where('from_member_id', $member->id)->orWhere('to_member_id', $member->id))->update(['status' => 'cancelled']);
        });
        $member->refresh();
        if ($member->user) {
            $this->notifications->push($member->user, 'ajo_turn_lost', "You lost your turn in {$circle->wallet->name}", "You missed " . AjoCircle::MISSES_TO_LOSE_TURN . " rounds, so your turn moved to the end: {$this->turnLabel($circle, $member->position)}.", ['wallet_id' => $circle->wallet_id]);
        }
        if ($circle->conversation_id) {
            ConversationMessage::create(['conversation_id' => $circle->conversation_id, 'kind' => 'system', 'body' => "{$member->shortName()} missed " . AjoCircle::MISSES_TO_LOSE_TURN . " rounds and moved to the last turn."]);
        }
    }

    /** Money into the pot. Paid after its payout day, it goes straight on to that turn. */
    private function payContribution(AjoCircle $circle, AjoContribution $k, Wallet $from, User $by): void
    {
        $label = "{$circle->wallet->name} · round {$k->round}" . ($k->fee ? ' with late fee' : '');
        $res = $this->wallets->transferBetweenWallets($from, $circle->wallet, $k->total(), $by, $label);
        $k->update(['status' => 'paid', 'paid_at' => now(), 'reference' => $res['reference']]);
        if ($circle->payouts()->where('round', $k->round)->exists()) {
            $this->forward($circle, $k);
        }
    }

    /** A late payment after the payout day goes to that round's member. */
    private function forward(AjoCircle $circle, AjoContribution $k): void
    {
        $payout = $circle->payouts()->where('round', $k->round)->first();
        $to = $payout?->member?->user;
        $main = $to?->mainWallet();
        if (!$payout || !$main) {
            return;
        }
        $this->wallets->transferBetweenWallets($circle->wallet->fresh(), $main, $k->total(), $to, "{$circle->wallet->name} · late payment from {$k->member?->user?->first_name}");
        $k->update(['settled' => true]);
        $payout->increment('amount', $k->total());
        $this->notifications->push($to, 'ajo_payout', "{$this->naira($k->total())} more from {$circle->wallet->name}", "{$k->member?->shortName()} paid late for your turn. It's in {$main->name}.", ['wallet_id' => $circle->wallet_id]);
    }

    /** "Patriai pays each turn automatically": what's in this round's pot goes to its member. */
    private function payRound(AjoCircle $circle, int $round): bool
    {
        $member = $circle->activeMembers()->with('user')->where('position', $round)->first();
        $main = $member?->user?->mainWallet();
        if (!$member || !$main) {
            return false;
        }
        $paid = DB::transaction(function () use ($circle, $round, $member, $main) {
            $locked = AjoCircle::whereKey($circle->id)->lockForUpdate()->first();
            if ($locked->payouts()->where('round', $round)->exists()) {
                return null;
            }
            $ks = $locked->contributions()->where('round', $round)->where('status', 'paid')->where('settled', false)->get();
            $amount = (int) $ks->sum(fn (AjoContribution $k) => $k->total());
            if ($amount > 0) {
                $this->wallets->transferBetweenWallets($circle->wallet->fresh(), $main, $amount, $member->user, "{$circle->wallet->name} · your turn (round {$round})");
            }
            AjoContribution::whereIn('id', $ks->pluck('id'))->update(['settled' => true]);

            return AjoPayout::create(['circle_id' => $circle->id, 'round' => $round, 'member_id' => $member->id, 'pay_on' => $circle->payOn($round)->toDateString(), 'amount' => $amount, 'paid_at' => now()]);
        });
        if (!$paid) {
            return false;
        }
        $unpaid = $circle->contributions()->where('round', $round)->where('status', 'due')->count();
        $this->notifications->push($member->user, 'ajo_payout', "{$this->naira($paid->amount)} from {$circle->wallet->name} is in {$main->name}",
            "It's your turn (round {$round} of {$circle->size})." . ($unpaid ? " {$unpaid} still to pay; their money comes to you when they do." : ''),
            ['wallet_id' => $circle->wallet_id]);
        if ($circle->conversation_id) {
            ConversationMessage::create(['conversation_id' => $circle->conversation_id, 'kind' => 'system', 'body' => "{$member->shortName()} got round {$round}: {$this->naira($paid->amount)}"]);
        }

        return true;
    }

    // ----------------------------------------------------------- member acts

    /**
     * AJO-03 "Pay this round" / AJO-04 "Pay ₦52,000 now": the oldest payment
     * still owed (or the one asked for), from one of their own wallets.
     */
    public function payNow(AjoCircle $circle, User $user, ?int $contributionId = null, ?int $fromWalletId = null): AjoContribution
    {
        $member = $this->memberOf($circle, $user);
        $q = $member->contributions()->where('status', 'due')->orderBy('round');
        $k = $contributionId ? $q->whereKey($contributionId)->first() : $q->first();
        if (!$k) {
            throw ValidationException::withMessages(['ajo' => "You're all paid up."]);
        }
        $from = $fromWalletId
            ? Wallet::where('id', $fromWalletId)->where('user_id', $user->id)->where('type', '!=', 'ajo')->first()
            : ($member->sourceWallet ?? $user->mainWallet());
        if (!$from || !$from->canSpend($user)) {
            throw ValidationException::withMessages(['from_wallet_id' => 'Choose one of your own wallets to pay from.']);
        }
        if ($from->availableToSpend() < $k->total()) {
            throw ValidationException::withMessages(['amount' => "{$from->name} doesn't have {$this->naira($k->total())}. Add money first."]);
        }
        $this->payContribution($circle, $k, $from, $user);

        return $k->refresh();
    }

    /** WPV-06 "Remind all": everyone who hasn't paid this round. */
    public function remindAll(AjoCircle $circle, User $organiser): int
    {
        $this->requireOrganiser($circle, $organiser);
        $current = $circle->roundOn($this->today());
        $due = $circle->contributions()->with('member.user')->where('status', 'due')->where('round', '<=', max(1, $current))->get();
        $sent = 0;
        foreach ($due->groupBy('member_id') as $ks) {
            $user = $ks->first()->member?->user;
            if (!$user || $user->id === $organiser->id) {
                continue;
            }
            $total = (int) $ks->sum(fn (AjoContribution $k) => $k->total());
            $this->notifications->push($user, 'ajo_reminder', "{$circle->wallet->name}: please pay {$this->naira($total)}", "{$organiser->first_name} sent a reminder. Open the circle to pay.", ['wallet_id' => $circle->wallet_id]);
            $sent++;
        }

        return $sent;
    }

    /** AJO-03 "Ask to swap": both turns still ahead, and both people must agree. */
    public function requestSwap(AjoCircle $circle, User $user, int $withMemberId): AjoSwap
    {
        $me = $this->memberOf($circle, $user);
        if ($circle->status !== 'active' || !$circle->allow_swaps) {
            throw ValidationException::withMessages(['ajo' => "This circle doesn't allow swaps."]);
        }
        $other = AjoMember::where('circle_id', $circle->id)->whereKey($withMemberId)->where('status', 'active')->first();
        $current = $circle->roundOn($this->today());
        if (!$other || $other->id === $me->id) {
            throw ValidationException::withMessages(['member' => 'Choose someone else in the circle.']);
        }
        if ($me->status !== 'active' || $me->position <= $current || $other->position <= $current) {
            throw ValidationException::withMessages(['member' => 'Only turns that are still to come can swap.']);
        }
        if (AjoSwap::where('circle_id', $circle->id)->where('status', 'pending')->where(fn ($q) => $q->whereIn('from_member_id', [$me->id, $other->id])->orWhereIn('to_member_id', [$me->id, $other->id]))->exists()) {
            throw ValidationException::withMessages(['member' => 'One of you is already waiting on a swap.']);
        }
        $swap = AjoSwap::create(['circle_id' => $circle->id, 'from_member_id' => $me->id, 'to_member_id' => $other->id]);
        if ($other->user) {
            $this->notifications->push($other->user, 'ajo_swap', "{$user->first_name} asks to swap turns",
                "In {$circle->wallet->name}: {$user->first_name}'s {$this->turnLabel($circle, $me->position)} for your {$this->turnLabel($circle, $other->position)}. Open the circle to answer.",
                ['wallet_id' => $circle->wallet_id, 'ajo_swap_id' => $swap->id]);
        }

        return $swap;
    }

    public function respondSwap(AjoSwap $swap, User $user, bool $accept): AjoSwap
    {
        $circle = AjoCircle::findOrFail($swap->circle_id);
        $to = $swap->to;
        $from = $swap->from;
        if (!$to || $to->user_id !== $user->id) {
            throw ValidationException::withMessages(['swap' => 'This swap is not for you.']);
        }
        if ($swap->status !== 'pending') {
            throw ValidationException::withMessages(['swap' => 'This swap has already been answered.']);
        }
        $current = $circle->roundOn($this->today());
        if ($accept && ($from->status !== 'active' || $to->status !== 'active' || $from->position <= $current || $to->position <= $current)) {
            $swap->update(['status' => 'cancelled', 'responded_at' => now()]);
            throw ValidationException::withMessages(['swap' => "One of these turns has come, so it can't swap now."]);
        }
        DB::transaction(function () use ($swap, $accept, $from, $to) {
            $swap->update(['status' => $accept ? 'accepted' : 'declined', 'responded_at' => now()]);
            if ($accept) {
                [$a, $b] = [$from->position, $to->position];
                $from->update(['position' => $b]);
                $to->update(['position' => $a]);
            }
        });
        if ($from->user) {
            $this->notifications->push($from->user, 'ajo_swap', $accept ? "{$user->first_name} agreed to swap" : "{$user->first_name} kept their turn",
                $accept ? "Your turn in {$circle->wallet->name} is now {$this->turnLabel($circle, $from->refresh()->position)}." : 'Your turn stays the same.', ['wallet_id' => $circle->wallet_id]);
        }
        if ($accept && $circle->conversation_id) {
            ConversationMessage::create(['conversation_id' => $circle->conversation_id, 'kind' => 'system', 'body' => "{$from->shortName()} and {$to->shortName()} swapped turns."]);
        }

        return $swap->refresh();
    }

    // ------------------------------------------------------------------ views

    /** AJO-03 for a member, WPV-06 for the organiser, and the forming circle. */
    public function detail(AjoCircle $circle, User $viewer): array
    {
        $today = $this->today();
        $current = $circle->roundOn($today);
        $wallet = $circle->wallet;
        $members = $circle->members()->with('user')->whereIn('status', ['active', 'lost_turn'])->get()
            ->sortBy(fn (AjoMember $m) => [$m->position ?? 999, $m->id])->values();
        $me = $members->firstWhere('user_id', $viewer->id);
        $round = $current > 0 ? $current : null;
        $roundKs = $round ? $circle->contributions()->where('round', $round)->get()->keyBy('member_id') : collect();
        $payout = $round ? $circle->payouts()->where('round', $round)->first() : null;
        $recipient = $round ? $members->firstWhere('position', $round) : null;
        $paidCount = $roundKs->where('status', 'paid')->count();
        $collected = (int) $roundKs->where('status', 'paid')->sum(fn (AjoContribution $k) => $k->total());
        $myDue = $me ? $me->contributions()->where('status', 'due')->orderBy('round')->first() : null;
        $received = $circle->payouts()->pluck('member_id')->all();
        $pendingInvites = WalletInvitation::with('invitee')->where('wallet_id', $wallet->id)->where('status', 'pending')->get();

        $status = function (?AjoContribution $k) use ($today): ?array {
            if (!$k) {
                return null;
            }
            if ($k->status === 'paid') {
                return ['label' => 'Paid', 'tone' => 'success'];
            }
            $days = (int) $k->due_on->diffInDays($today, false);
            if ($days <= 0) {
                return ['label' => $days === 0 ? 'Due today' : 'Due ' . $k->due_on->format('j M'), 'tone' => 'warning'];
            }

            return ['label' => 'Late ' . $days . ' day' . ($days === 1 ? '' : 's'), 'tone' => 'danger', 'days' => $days];
        };

        $swapsIn = $me ? AjoSwap::with('from.user')->where('to_member_id', $me->id)->where('status', 'pending')->get() : collect();
        $swapOut = $me ? AjoSwap::with('to.user')->where('from_member_id', $me->id)->where('status', 'pending')->first() : null;
        $isOrganiser = $circle->organiser_id === $viewer->id;

        return [
            'id' => $circle->id,
            'wallet_id' => $wallet->id,
            'name' => $wallet->name,
            'status' => $circle->status,
            'code' => $circle->code,
            'role' => $isOrganiser ? 'organiser' : 'member',
            'organiser' => ['id' => $circle->organiser_id, 'name' => $circle->organiser?->fullName(), 'first_name' => $circle->organiser?->first_name],
            'contribution' => $this->money($circle->contribution),
            'frequency' => $circle->frequency,
            'size' => $circle->size,
            'payout_amount' => $this->money($circle->payoutAmount()),
            'starts_on' => $circle->starts_on->toDateString(),
            'ends_on' => $circle->endsOn()->toDateString(),
            'period_label' => $this->periodLabel($circle),
            'pay_day_label' => $this->payDayLabel($circle),
            'late_fee' => $this->money($circle->late_fee),
            'late_after_days' => $circle->late_after_days,
            'late_fee_label' => $circle->late_fee > 0 ? "{$this->naira($circle->late_fee)} after {$circle->late_after_days} day" . ($circle->late_after_days === 1 ? '' : 's') : 'No late fee',
            'allow_swaps' => $circle->allow_swaps,
            'order_mode' => $circle->order_mode,
            'conversation_id' => $circle->conversation_id,
            'joined' => $members->count(),
            'invited' => $pendingInvites->map(fn (WalletInvitation $i) => ['id' => $i->id, 'name' => $i->invitee?->fullName() ?? $i->invitee_identifier])->values(),
            'balance' => $wallet->balanceNaira(),
            'round' => $round ? [
                'number' => $round,
                'of' => $circle->size,
                'label' => $this->roundLabel($circle, $round),
                'collected' => $this->money($collected),
                'target' => $this->money($circle->payoutAmount()),
                'paid' => $paidCount,
                'total' => $roundKs->count(),
                'recipient' => $recipient ? ['member_id' => $recipient->id, 'name' => $recipient->user_id === $viewer->id ? 'you' : $recipient->shortName(), 'you' => $recipient->user_id === $viewer->id] : null,
                'pay_on' => $circle->payOn($round)->toDateString(),
                'pay_on_label' => $circle->payOn($round)->format('j M'),
                'paid_out' => (bool) $payout,
                'paid_out_amount' => $payout ? $this->money($payout->amount) : null,
            ] : null,
            'me' => $me ? [
                'member_id' => $me->id,
                'position' => $me->position,
                'ordinal' => $me->position ? $this->ordinal($me->position) : null,
                'turn_label' => $me->position ? $this->turnLabel($circle, $me->position) : null,
                'receives' => $this->money($circle->payoutAmount()),
                'received' => in_array($me->id, $received, true),
                // What actually reached them, late payments and fees included.
                'received_amount' => $this->money((int) $circle->payouts()->where('member_id', $me->id)->sum('amount')),
                'auto_pay' => $me->auto_pay,
                'pay_from' => $me->sourceWallet?->name ?? 'Main wallet',
                'missed' => $me->missed,
                'status' => $me->status,
                'due' => $myDue ? [
                    'contribution_id' => $myDue->id,
                    'round' => $myDue->round,
                    'month' => $this->monthName($circle, $myDue->round),
                    'amount' => $this->money($myDue->amount),
                    'fee' => $this->money($myDue->late ? $myDue->fee : 0),
                    'late_fee' => $this->money($circle->late_fee),
                    'total' => $this->money($myDue->total()),
                    'due_on' => $myDue->due_on->toDateString(),
                    'due_label' => $myDue->due_on->format('j M'),
                    'days_late' => max(0, (int) $myDue->due_on->diffInDays($today, false)),
                    'late' => $myDue->late,
                    'fee_from' => $myDue->due_on->copy()->addDays($circle->late_after_days)->format('j M'),
                    'waiting' => ($w = $members->firstWhere('position', $myDue->round)) && $w->user_id !== $viewer->id ? $w->user?->first_name : null,
                ] : null,
                'swaps_in' => $swapsIn->map(fn (AjoSwap $s) => ['id' => $s->id, 'name' => $s->from?->shortName(), 'turn_label' => $s->from?->position ? $this->turnLabel($circle, $s->from->position) : null])->values(),
                'swap_out' => $swapOut ? ['id' => $swapOut->id, 'name' => $swapOut->to?->shortName(), 'turn_label' => $this->turnLabel($circle, $swapOut->to->position)] : null,
            ] : null,
            'members' => $members->map(fn (AjoMember $m) => [
                'member_id' => $m->id,
                'user_id' => $m->user_id,
                'name' => $m->user?->fullName(),
                'short' => $m->shortName(),
                'you' => $m->user_id === $viewer->id,
                'organiser' => $m->user_id === $circle->organiser_id,
                'position' => $m->position,
                'turn_label' => $m->position && $circle->status !== 'forming' ? $this->turnLabel($circle, $m->position) : null,
                'status' => $m->status,
                'missed' => $m->missed,
                'received' => in_array($m->id, $received, true),
                'round_status' => $status($roundKs->get($m->id)),
                'owes' => $this->money((int) $m->contributions()->where('status', 'due')->get()->sum(fn (AjoContribution $k) => $k->total())),
                'replacing' => (bool) $m->replaced_by_invitation_id,
                'can_replace' => $isOrganiser && $m->user_id !== $circle->organiser_id && $m->status === 'active' && (!$m->position || $m->position > $current) && !$m->contributions()->where('status', 'paid')->exists(),
                'can_swap' => $me && $me->id !== $m->id && $circle->status === 'active' && $circle->allow_swaps && $m->status === 'active' && $me->status === 'active' && $m->position > $current && $me->position > $current,
            ])->values(),
            'stats' => [
                'late' => $roundKs->filter(fn (AjoContribution $k) => $k->status === 'due' && $k->due_on->lt($today))->count(),
                'due_today' => $roundKs->filter(fn (AjoContribution $k) => $k->status === 'due' && $k->due_on->equalTo($today))->count(),
                'fees_collected' => $this->money((int) $circle->contributions()->where('status', 'paid')->sum('fee')),
            ],
        ];
    }

    /** INV-J1 / joining with a code: what a person signs up to. */
    public function preview(AjoCircle $circle, ?User $viewer = null): array
    {
        $joined = $circle->activeMembers()->count();

        return [
            'id' => $circle->id,
            'wallet_id' => $circle->wallet_id,
            'name' => $circle->wallet->name,
            'code' => $circle->code,
            'status' => $circle->status,
            'organiser' => ['id' => $circle->organiser_id, 'name' => $circle->organiser?->fullName(), 'first_name' => $circle->organiser?->first_name],
            'contribution' => $this->money($circle->contribution),
            'frequency' => $circle->frequency,
            'pay_label' => "{$this->naira($circle->contribution)} {$this->every($circle)}",
            'period_label' => $this->periodLabel($circle),
            'receive_label' => "{$this->naira($circle->payoutAmount())} once",
            'turn_note' => $circle->order_mode === 'agreed' ? "{$circle->organiser?->first_name} sets the order with everyone" : "Your turn is set by a draw when the circle starts",
            'late_fee_label' => $circle->late_fee > 0 ? "{$this->naira($circle->late_fee)} after {$circle->late_after_days} day" . ($circle->late_after_days === 1 ? '' : 's') : 'No late fee',
            'members_label' => "{$joined} joined of {$circle->size}",
            'joined' => $joined,
            'size' => $circle->size,
            'pay_day_label' => $this->payDayLabel($circle),
            'already_in' => $viewer ? $circle->members()->where('user_id', $viewer->id)->whereIn('status', ['active', 'lost_turn'])->exists() : false,
            'open' => $circle->status === 'forming' && $joined < $circle->size,
        ];
    }

    /** TRS-02 "Unity ladies ajo · Your turn in March · ₦600,000 · ₦50,000 paid". */
    public function rowSummary(Wallet $wallet, ?User $viewer): ?array
    {
        $circle = $this->forWallet($wallet);
        if (!$circle || !$viewer) {
            return null;
        }
        $me = $circle->members()->where('user_id', $viewer->id)->first();
        $paid = $me ? (int) $me->contributions()->where('status', 'paid')->sum('amount') : 0;
        $received = $me && $circle->payouts()->where('member_id', $me->id)->exists();
        $line = match (true) {
            $circle->status === 'forming' => "{$circle->activeMembers()->count()} of {$circle->size} joined",
            $circle->status === 'completed' => 'Complete',
            $circle->status === 'cancelled' => 'Cancelled',
            $received => 'You had your turn',
            (bool) $me?->position => 'Your turn in ' . $this->turnLabel($circle, $me->position, short: true),
            default => "{$circle->size} people",
        };

        return [
            'status' => $circle->status,
            'line' => $line,
            'payout' => $this->money($circle->payoutAmount()),
            'paid' => $this->money($paid),
            'role' => $circle->organiser_id === $viewer->id ? 'organiser' : 'member',
        ];
    }

    /**
     * Home "Next 7 days" and Steward (AIQ-06): your payments into circles, a
     * turn coming to you, and, for organisers, each payout.
     *
     * @return list<array<string, mixed>>
     */
    public function upcomingFor(User $user, Carbon $horizon): array
    {
        $today = $this->today();
        $items = [];
        $memberships = AjoMember::with('circle.wallet')->where('user_id', $user->id)->whereIn('status', ['active', 'lost_turn'])->get();
        foreach ($memberships as $me) {
            $circle = $me->circle;
            if (!$circle || $circle->status !== 'active') {
                continue;
            }
            $name = $circle->wallet->name;
            foreach ($me->contributions()->where('status', 'due')->orderBy('round')->get() as $k) {
                $days = (int) $k->due_on->diffInDays($today, false);
                $items[] = ['kind' => 'ajo_due', 'wallet_id' => $circle->wallet_id, 'id' => $k->id, 'title' => $name, 'date' => $k->due_on->toDateString(),
                    'subtitle' => $days > 0 ? "Your payment is {$days} day" . ($days === 1 ? '' : 's') . ' late' : ($me->auto_pay ? 'Pays from Main today' : 'Your payment is due'),
                    'amount' => $this->money($k->total()), 'tone' => $days > 0 ? 'danger' : 'warning', 'late' => $days > 0];
            }
            $next = $circle->roundOn($today) + 1;
            if ($next <= $circle->size && $circle->dueOn($next)->lt($horizon)) {
                $items[] = ['kind' => 'ajo_next', 'wallet_id' => $circle->wallet_id, 'id' => $circle->id, 'title' => $name, 'date' => $circle->dueOn($next)->toDateString(),
                    'subtitle' => $me->auto_pay ? 'You, from Main' : 'You pay', 'amount' => $this->money($circle->contribution), 'tone' => 'neutral'];
            }
            for ($r = max(1, $circle->roundOn($today)); $r <= min($circle->size, $circle->roundOn($today) + 1); $r++) {
                $payOn = $circle->payOn($r);
                if ($payOn->lt($today) || $payOn->gte($horizon) || $circle->payouts()->where('round', $r)->exists()) {
                    continue;
                }
                $to = $circle->activeMembers()->with('user')->where('position', $r)->first();
                if (!$to || ($to->user_id !== $user->id && $circle->organiser_id !== $user->id)) {
                    continue;
                }
                $items[] = ['kind' => 'ajo_payout', 'wallet_id' => $circle->wallet_id, 'id' => $circle->id, 'title' => 'Ajo payout', 'date' => $payOn->toDateString(),
                    'subtitle' => $to->user_id === $user->id ? "Your turn in {$name}" : "{$to->user?->first_name} gets it", 'amount' => $this->money($circle->payoutAmount()), 'tone' => 'success'];
            }
        }

        return $items;
    }

    // ---------------------------------------------------------------- helpers

    public function memberOf(AjoCircle $circle, User $user): AjoMember
    {
        $m = $circle->members()->where('user_id', $user->id)->whereIn('status', ['active', 'lost_turn'])->first();
        if (!$m) {
            throw ValidationException::withMessages(['ajo' => "You're not in this circle."]);
        }

        return $m;
    }

    private function requireOrganiser(AjoCircle $circle, User $user): void
    {
        if ($circle->organiser_id !== $user->id) {
            throw ValidationException::withMessages(['ajo' => 'Only the organiser can do that.']);
        }
    }

    public function ordinal(int $n): string
    {
        $s = ['th', 'st', 'nd', 'rd'];
        $v = $n % 100;

        return $n . ($s[($v - 20) % 10] ?? $s[$v] ?? $s[0]);
    }

    /** "March 2027" (monthly) or "Sun 15 Nov" (weekly). */
    public function turnLabel(AjoCircle $circle, int $position, bool $short = false): string
    {
        $day = $circle->payOn($position);

        return $circle->frequency === 'weekly' ? $day->format('D j M') : $circle->dueOn($position)->format($short ? 'F' : 'F Y');
    }

    /** "November" or "Week of 15 Nov". */
    private function roundLabel(AjoCircle $circle, int $round): string
    {
        return $circle->frequency === 'weekly' ? 'Week of ' . $circle->dueOn($round)->format('j M') : $circle->dueOn($round)->format('F');
    }

    private function monthName(AjoCircle $circle, int $round): string
    {
        return $circle->frequency === 'weekly' ? 'Week ' . $round : $circle->dueOn($round)->format('F');
    }

    private function every(AjoCircle $circle): string
    {
        return $circle->frequency === 'weekly' ? 'every week' : 'every month';
    }

    /** "Nov 2026 to Oct 2027". */
    private function periodLabel(AjoCircle $circle): string
    {
        return $circle->frequency === 'weekly'
            ? $circle->dueOn(1)->format('j M') . ' to ' . $circle->endsOn()->format('j M Y')
            : $circle->dueOn(1)->format('M Y') . ' to ' . $circle->endsOn()->format('M Y');
    }

    /** INV-J1 "On the 1st of every month" / "Every Sunday". */
    private function payDayLabel(AjoCircle $circle): string
    {
        return $circle->frequency === 'weekly' ? 'Every ' . $circle->starts_on->format('l') : 'On the ' . $this->ordinal((int) $circle->starts_on->format('j')) . ' of every month';
    }

    private function dayLabel(Carbon $day): string
    {
        return $day->format('j M');
    }
}
