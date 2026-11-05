<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\AutomationRule;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletInvitation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * GET /home — everything the Home tab (prototype HOM-01) and the Treasury
 * header (TRS-01) show, in one call:
 *   totals    everything the person can see, split into yours / shared / children,
 *             plus money in and out this month (moves between those wallets excluded)
 *   needs_you approvals waiting for them, invitations, milestones to review,
 *             and rules that will be short of money in the next 7 days
 *   upcoming  the next 7 days: requests waiting, approvals, scheduled rules
 *   goals     progress rings for wallets with a target
 *   projects  active projects with a one-line status
 */
class HomeController extends ApiController
{
    private const UPCOMING_DAYS = 7;
    private const GOAL_TYPES = ['savings', 'goal', 'emergency', 'giving', 'child', 'project', 'shared', 'joint'];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $now = now();

        // TRS-02 "Other circles and linked accounts aren't counted in your total": an ajo pot isn't yours.
        $wallets = $this->visibleWallets($user)->reject(fn (Wallet $w) => $w->type === 'ajo')->values();
        $walletIds = $wallets->pluck('id')->all();

        $needsYou = [];
        $upcoming = [];

        // ---- Approvals waiting for this person ----
        $toApprove = ApprovalRequest::with(['wallet', 'initiator'])
            ->whereIn('wallet_id', $this->approvableWalletIds($user))
            ->where('initiator_id', '!=', $user->id)
            ->where('status', 'pending')
            ->whereDoesntHave('responses', fn (Builder $q) => $q->where('approver_id', $user->id))
            ->latest()
            ->get();
        foreach ($toApprove as $req) {
            $label = $this->requestLabel($req);
            $needsYou[] = ['kind' => 'approval', 'id' => $req->id, 'label' => $label];
            $upcoming[] = [
                'kind' => 'approval',
                'id' => $req->id,
                'wallet_id' => $req->wallet_id,
                'title' => $label,
                'date' => $req->created_at?->toDateString(),
                'subtitle' => 'Waiting for you',
                'amount' => $this->naira($req->amount),
                'tone' => 'warning',
            ];
        }

        // ---- This person's own requests, waiting on someone else ----
        $mine = ApprovalRequest::with(['wallet', 'responses'])
            ->where('initiator_id', $user->id)
            ->where('status', 'pending')
            ->latest()
            ->get();
        foreach ($mine as $req) {
            $waitingOn = $this->pendingApproverNames($req, $user);
            $upcoming[] = [
                'kind' => 'request',
                'id' => $req->id,
                'wallet_id' => $req->wallet_id,
                'title' => $this->requestLabel($req),
                'date' => $req->created_at?->toDateString(),
                'subtitle' => $waitingOn ? 'Waiting for ' . $this->joinNames($waitingOn) : 'Waiting for approval',
                'amount' => $this->naira($req->amount),
                'tone' => 'warning',
            ];
        }

        // ---- Invitations to this person ----
        foreach ($this->receivedInvitations($user) as $invite) {
            $needsYou[] = [
                'kind' => 'invitation',
                'id' => $invite->id,
                'label' => 'invite to ' . ($invite->wallet?->name ?? 'a wallet'),
            ];
        }

        // ---- Milestones submitted on projects this person owns ----
        $submitted = Milestone::with('project')
            ->where('status', 'submitted')
            ->whereIn('project_id', Project::where('owner_id', $user->id)->select('id'))
            ->get();
        foreach ($submitted as $milestone) {
            $needsYou[] = [
                'kind' => 'milestone',
                'id' => $milestone->project_id,
                'label' => strtolower($milestone->title) . ' approval',
            ];
        }

        // ---- Rules due in the next 7 days, and whether the money is there ----
        $horizon = $now->copy()->startOfDay()->addDays(self::UPCOMING_DAYS);
        $rules = AutomationRule::with(['fromWallet', 'toWallet'])
            ->where('user_id', $user->id)
            ->where('enabled', true)
            // Salary shares and round-ups have no set amount or day to show.
            ->where('trigger', 'schedule')
            ->get();
        foreach ($rules as $rule) {
            $next = $rule->nextRunOn($now);
            if (!$next || $next->gte($horizon) || !$rule->fromWallet) {
                continue;
            }
            $spendable = $rule->fromWallet->balance - (int) $rule->min_balance;
            $short = max(0, $rule->amount - $spendable);
            $day = $next->isToday() ? 'today' : $next->format('l');
            if ($short > 0) {
                $needsYou[] = [
                    'kind' => 'low_funds',
                    'id' => $rule->id,
                    'label' => "{$rule->fromWallet->name} is short for {$day}",
                ];
            }
            $upcoming[] = [
                'kind' => 'rule',
                'id' => $rule->id,
                'wallet_id' => $rule->from_wallet_id,
                'title' => $rule->name,
                'date' => $next->toDateString(),
                'subtitle' => $short > 0
                    ? "{$rule->fromWallet->name} is {$this->money($short)} short"
                    : 'Rule · to ' . ($rule->toWallet?->name ?? 'a wallet'),
                'amount' => $this->naira($rule->amount),
                'tone' => $short > 0 ? 'danger' : 'neutral',
            ];
        }

        // ---- SND-15 scheduled payments, giving and goal payouts in the next 7 days ----
        foreach (\App\Services\ScheduledPaymentService::make()->overview($user, $now)['items'] as $item) {
            if (!$item['next_on'] || $item['paused'] || $item['next_on']->gte($horizon)) {
                continue;
            }
            $from = $item['from']['name'] ?? 'the wallet';
            $label = "{$from} is short for " . ($item['next_on']->isToday() ? 'today' : $item['next_on']->copy()->setTimezone('Africa/Lagos')->format('l'));
            // Two payments from the same wallet on the same day are one thing to fix.
            if ($item['short'] !== null && !collect($needsYou)->contains('label', $label)) {
                $needsYou[] = ['kind' => 'low_funds', 'id' => $item['id'], 'label' => $label];
            }
            $upcoming[] = [
                'kind' => 'scheduled',
                'id' => $item['id'],
                'wallet_id' => $item['from']['id'] ?? null,
                'title' => $item['title'],
                'date' => $item['next_on']->copy()->setTimezone('Africa/Lagos')->toDateString(),
                'subtitle' => $item['short'] !== null ? "{$from} is {$this->money($item['short'])} short" : ($item['confirm'] ? 'You confirm' : "Scheduled · from {$from}"),
                'amount' => $this->naira($item['amount']),
                'tone' => $item['short'] !== null ? 'danger' : 'neutral',
            ];
        }

        // ---- REQ-03 money someone asked this person for ----
        $asked = \App\Models\MoneyRequest::with('requester')->where('payer_user_id', $user->id)->where('status', 'pending')
            ->where(fn (Builder $q) => $q->whereNull('due_on')->orWhere('due_on', '<', $horizon->toDateString()))->latest()->limit(5)->get();
        foreach ($asked as $r) {
            $needsYou[] = ['kind' => 'money_request', 'id' => $r->id, 'code' => $r->code, 'label' => "{$r->requester->first_name} asked for {$this->money($r->left())}"];
            $upcoming[] = [
                'kind' => 'money_request',
                'id' => $r->id,
                'code' => $r->code,
                'wallet_id' => null,
                'title' => "{$r->requester->first_name}: " . ($r->note ?: 'request'),
                'date' => ($r->due_on ?? $r->created_at)->toDateString(),
                'subtitle' => 'Asked of you',
                'amount' => $this->naira($r->left()),
                'tone' => 'warning',
            ];
        }

        // ---- Ajo circles: your payment, a turn coming to you (AIQ-06) ----
        foreach (\App\Services\AjoService::make()->upcomingFor($user, $horizon) as $item) {
            if (!empty($item['late'])) {
                $needsYou[] = ['kind' => 'ajo_due', 'id' => $item['id'], 'wallet_id' => $item['wallet_id'], 'label' => "{$item['title']}: your payment is late"];
            }
            unset($item['late']);
            $upcoming[] = $item;
        }

        usort($upcoming, fn ($a, $b) => strcmp((string) $a['date'], (string) $b['date']));

        return $this->ok('Home fetched', [
            'first_name' => $user->first_name ?: $user->fullName(),
            'wallet_count' => $wallets->count(),
            'totals' => $this->totals($user, $wallets, $walletIds, $now),
            'needs_you' => ['count' => count($needsYou), 'items' => $needsYou],
            'upcoming' => array_slice($upcoming, 0, 6),
            'goals' => $this->goals($wallets),
            'projects' => $this->projects($user),
            'unread_notifications' => $user->notificationsFeed()->whereNull('read_at')->count(),
            'setup' => $this->setup($user, $wallets),
        ]);
    }

    /**
     * HOM-03 "Get set up · 1 of 4 done": the main wallet, NIN and a selfie,
     * family invited, a first shared wallet. `new` when there's only Main and
     * no money has moved yet — Home then welcomes them and shows Main itself.
     */
    private function setup(User $user, Collection $wallets): array
    {
        $own = $wallets->where('user_id', $user->id);
        $main = $own->firstWhere('type', 'main');
        $ownShared = $own->contains(fn (Wallet $w) => $w->type !== 'main'
            && ($w->members->where('user_id', '!=', $user->id)->isNotEmpty() || \App\Models\WalletInvitation::where('wallet_id', $w->id)->where('status', 'pending')->exists()));
        $circle = \App\Services\PlanService::make()->homeCircle($user);
        $family = ($circle && \App\Models\CircleMember::where('circle_id', $circle->id)->where('user_id', '!=', $user->id)->exists())
            || \App\Models\WalletInvitation::where('inviter_id', $user->id)->exists();
        $steps = [
            ['key' => 'main_wallet', 'done' => $main !== null],
            ['key' => 'verify', 'done' => (int) $user->kyc_tier >= 2],
            ['key' => 'family', 'done' => $family],
            ['key' => 'shared_wallet', 'done' => $ownShared],
        ];
        $moved = $wallets->isNotEmpty() && Transaction::whereIn('wallet_id', $wallets->pluck('id'))->exists();

        return [
            'steps' => $steps,
            'done' => collect($steps)->where('done', true)->count(),
            'total' => count($steps),
            'new' => $wallets->count() <= 1 && !$moved,
            'main' => $main ? [
                'id' => $main->id,
                'balance' => $main->balanceNaira(),
                'account_number' => $main->virtual_account,
                'bank' => $main->virtual_account_bank,
            ] : null,
        ];
    }

    /** Wallets the person owns plus wallets they are an active member of. */
    private function visibleWallets(User $user): Collection
    {
        $own = $user->wallets()->with(['members' => fn ($q) => $q->where('status', 'active')])->get();
        $member = $user->memberWallets()
            ->where('wallets.user_id', '!=', $user->id)
            ->with(['members' => fn ($q) => $q->where('status', 'active')])
            ->get();

        return $own->concat($member)->unique('id')->values();
    }

    /** yours = only you; shared = someone else owns it or is in it; children = child wallets. */
    private function bucket(Wallet $wallet, User $user): string
    {
        if ($wallet->type === 'child') {
            return 'children';
        }
        $others = $wallet->members->where('user_id', '!=', $user->id)->count();

        return $wallet->user_id !== $user->id || $others > 0 ? 'shared' : 'yours';
    }

    private function totals(User $user, Collection $wallets, array $walletIds, Carbon $now): array
    {
        $sum = ['yours' => 0, 'shared' => 0, 'children' => 0];
        foreach ($wallets as $wallet) {
            $sum[$this->bucket($wallet, $user)] += $wallet->balance;
        }

        // Money in and out this month; moves between these wallets are neither.
        $in = 0;
        $out = 0;
        $monthTxns = Transaction::whereIn('wallet_id', $walletIds)
            ->where('status', 'successful')
            ->where('created_at', '>=', $now->copy()->startOfMonth())
            ->get(['direction', 'amount', 'counterparty']);
        foreach ($monthTxns as $txn) {
            $cp = $txn->counterparty;
            if (is_array($cp) && ($cp['kind'] ?? null) === 'wallet' && in_array($cp['wallet_id'] ?? null, $walletIds, true)) {
                continue;
            }
            if ($txn->direction === 'credit') {
                $in += $txn->amount;
            } else {
                $out += $txn->amount;
            }
        }

        return [
            'total' => $this->naira(array_sum($sum)),
            'yours' => $this->naira($sum['yours']),
            'shared' => $this->naira($sum['shared']),
            'children' => $this->naira($sum['children']),
            'month_in' => $this->naira($in),
            'month_out' => $this->naira($out),
        ];
    }

    private function goals(Collection $wallets): array
    {
        return $wallets
            ->filter(fn (Wallet $w) => in_array($w->type, self::GOAL_TYPES, true) && $w->target_amount > 0)
            ->sortBy(fn (Wallet $w) => $w->target_date?->timestamp ?? PHP_INT_MAX)
            ->take(8)
            ->map(fn (Wallet $w) => [
                'wallet_id' => $w->id,
                'name' => $w->name,
                'type' => $w->type,
                'percent' => (int) min(100, floor($w->balance * 100 / $w->target_amount)),
                'balance' => $w->balanceNaira(),
                'target' => $this->naira($w->target_amount),
                'target_date' => $w->target_date?->toDateString(),
            ])
            ->values()
            ->all();
    }

    private function projects(User $user): array
    {
        return Project::with('milestones')
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id))
            ->where('status', 'active')
            ->latest()
            ->limit(3)
            ->get()
            ->map(function (Project $project) use ($user) {
                $milestones = $project->milestones;
                $submitted = $milestones->firstWhere('status', 'submitted');
                $released = $milestones->where('status', 'released')->count();

                $status = match (true) {
                    $submitted !== null => "{$submitted->title} submitted",
                    $milestones->isEmpty() => 'No milestones yet',
                    default => "{$released} of {$milestones->count()} milestones paid",
                };

                return [
                    'id' => $project->id,
                    'title' => $project->title,
                    'status_line' => $status,
                    // The owner reviews submitted work; the vendor waits on it.
                    'needs_review' => $submitted !== null && $project->owner_id === $user->id,
                ];
            })
            ->all();
    }

    private function receivedInvitations(User $user): Collection
    {
        return WalletInvitation::with('wallet')
            ->where('status', 'pending')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(function ($q) use ($user) {
                $q->where('invitee_user_id', $user->id)
                    ->orWhereRaw('LOWER(invitee_identifier) = ?', [strtolower((string) $user->email)]);
                if ($user->phone) {
                    $q->orWhere('invitee_identifier', $user->phone);
                }
            })
            ->get();
    }

    /** First names of approvers who haven't answered yet (initiator excluded). */
    private function pendingApproverNames(ApprovalRequest $req, User $initiator): array
    {
        $wallet = $req->wallet;
        if (!$wallet) {
            return [];
        }
        $responded = $req->responses->pluck('approver_id')->all();
        $approvers = collect([$wallet->owner])
            ->concat(
                $wallet->members()
                    ->where('status', 'active')
                    ->where(fn ($q) => $q->whereIn('role', ['owner', 'co_owner', 'admin'])->orWhere('can_approve', true))
                    ->with('user')
                    ->get()
                    ->pluck('user')
            )
            ->filter()
            ->unique('id')
            ->reject(fn (User $u) => $u->id === $initiator->id || in_array($u->id, $responded, true));

        return $approvers->map(fn (User $u) => $u->first_name ?: $u->fullName())->values()->all();
    }

    private function requestLabel(ApprovalRequest $req): string
    {
        if ($req->description) {
            return $req->description;
        }
        $who = $req->relationLoaded('initiator') && $req->initiator ? ($req->initiator->first_name ?: $req->initiator->fullName()) : null;

        return $who ? "{$who}'s request" : 'Request from ' . ($req->wallet?->name ?? 'a wallet');
    }

    private function joinNames(array $names): string
    {
        if (count($names) <= 2) {
            return implode(' and ', $names);
        }

        return $names[0] . ', ' . $names[1] . ' and ' . (count($names) - 2) . ' more';
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }

    private function money(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }
}
