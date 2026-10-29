<?php

namespace App\Services;

use App\Models\Dispute;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\Transaction;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorTeamMember;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

/**
 * The builder's side of the money and their business home:
 *  - VDM-06 Payouts: what's in their Patriai balance, what's held back across
 *    projects, the business account they withdraw to, and automatic withdrawal
 *  - VDM-03 Vendor home: paid this month, waiting for approval, what needs them
 *    (invites, due milestones, changes to answer, disputes to reply to) and
 *    their projects; a team member sees only the projects they were given
 * Amounts are kobo.
 */
class VendorPayoutService
{
    public function __construct(
        private readonly WalletService $wallets,
    ) {}

    public static function make(): self
    {
        return new self(WalletService::make());
    }

    /** "Automatic withdrawal — every payout, straight away" to the verified business account. */
    public function autoWithdraw(User $vendor, int $amount, string $title): void
    {
        $profile = VendorProfile::where('user_id', $vendor->id)->first();
        $main = $vendor->mainWallet();
        if (!$profile || !$profile->auto_withdraw || !$profile->canBePaid() || !$profile->account_number || !$main || $amount <= 0) {
            return;
        }
        $fee = (int) config('services.matrix.transfer_fee_kobo', 2000);
        $send = min($amount, $main->fresh()->availableToSpend() - $fee);
        if ($send <= 0) {
            return;
        }
        try {
            $this->wallets->withdrawToBank($main, $vendor, $send, $profile->bank_code, $profile->account_number, $profile->account_name ?? $profile->business_name, $profile->bank_name ?? 'Bank', "Payout: {$title}");
        } catch (\Throwable $e) {
            // The money stays in their Patriai balance; they can withdraw it by hand.
            Log::warning("Automatic withdrawal for vendor {$vendor->id} failed: {$e->getMessage()}");
        }
    }

    /** VDM-06. */
    public function payouts(User $vendor): array
    {
        $profile = VendorProfile::where('user_id', $vendor->id)->first();
        $main = $vendor->mainWallet();
        $projects = Project::where('vendor_id', $vendor->id)->get();
        $heldBack = (int) Milestone::whereIn('project_id', $projects->pluck('id'))->where('status', 'released')->whereNull('retention_released_at')->sum('retention');
        $heldIn = Milestone::whereIn('project_id', $projects->pluck('id'))->where('status', 'released')->whereNull('retention_released_at')->where('retention', '>', 0)->distinct()->count('project_id');
        $recent = $main ? Transaction::where('wallet_id', $main->id)->whereIn('status', ['successful', 'pending'])
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('type', 'transfer_in')->where(fn ($q) => $q->where('description', 'like', 'Milestone payout:%')->orWhere('description', 'like', 'Retention released:%')))
                ->orWhere('type', 'withdrawal'))
            ->latest()->limit(20)->get() : collect();

        return [
            'available' => $this->naira($main?->availableToSpend() ?? 0),
            'wallet_id' => $main?->id,
            'held_back' => $this->naira($heldBack),
            'held_back_projects' => $heldIn,
            'account' => $profile?->account_number ? [
                'name' => $profile->account_name,
                'bank_name' => $profile->bank_name,
                'bank_code' => $profile->bank_code,
                'last4' => substr($profile->account_number, -4),
                'account_number' => $profile->account_number,
            ] : null,
            'auto_withdraw' => (bool) $profile?->auto_withdraw,
            'can_be_paid' => (bool) $profile?->canBePaid(),
            'recent' => $recent->map(fn (Transaction $t) => [
                'id' => $t->id,
                'title' => $t->type === 'withdrawal'
                    ? 'Withdrawal to •••• ' . substr((string) ($t->counterparty['account_number'] ?? ''), -4)
                    : preg_replace('/^(Milestone payout|Retention released): /', '', (string) $t->description),
                'kind' => $t->type === 'withdrawal' ? 'withdrawal' : (str_starts_with((string) $t->description, 'Retention') ? 'retention' : 'payout'),
                'amount' => $this->naira($t->amount),
                'direction' => $t->direction,
                'date' => $t->created_at?->toIso8601String(),
                'status' => $t->status,
            ])->values(),
        ];
    }

    /** VDM-03. */
    public function home(User $user): array
    {
        $profile = VendorProfile::where('user_id', $user->id)->first();
        $memberships = VendorTeamMember::with('vendorProfile')->where('user_id', $user->id)->where('status', 'active')->get();
        $team = $memberships->first();

        $projects = Project::with(['owner', 'wallet', 'milestones'])->where('vendor_id', $user->id)->get();
        foreach ($memberships as $m) {
            $projects = $projects->merge(Project::with(['owner', 'wallet', 'milestones'])->whereIn('id', array_map('intval', $m->project_ids ?? []))
                ->where('vendor_id', $m->vendorProfile?->user_id)->get());
        }
        $projects = $projects->unique('id')->sortByDesc('updated_at')->values();
        $mine = $projects->where('vendor_id', $user->id);
        $main = $user->mainWallet();
        $monthStart = now()->startOfMonth();
        $paidThisMonth = $main ? (int) Transaction::where('wallet_id', $main->id)->where('type', 'transfer_in')->whereIn('status', ['successful'])
            ->where('created_at', '>=', $monthStart)->where(fn ($q) => $q->where('description', 'like', 'Milestone payout:%')->orWhere('description', 'like', 'Retention released:%'))->sum('amount') : 0;
        $waiting = (int) Milestone::whereIn('project_id', $mine->pluck('id'))->whereIn('status', ['submitted', 'approved'])->sum('amount');

        return [
            'business' => $profile ? [
                'id' => $profile->id,
                'name' => $profile->business_name,
                'initials' => $this->initials($profile->business_name),
                'logo_url' => $profile->logo_url,
                'status' => $profile->status,
                'verified' => (bool) $profile->verified,
            ] : ($team ? ['id' => $team->vendorProfile->id, 'name' => $team->vendorProfile->business_name, 'initials' => $this->initials($team->vendorProfile->business_name), 'logo_url' => $team->vendorProfile->logo_url, 'status' => $team->vendorProfile->status, 'verified' => (bool) $team->vendorProfile->verified] : null),
            'team_role' => $profile ? 'owner' : $team?->role,
            'paid_this_month' => $this->naira($paidThisMonth),
            'waiting' => $this->naira($waiting),
            'needs' => $this->needs($user, $projects),
            'projects' => $projects->map(fn (Project $p) => $this->projectLine($p, $user))->values(),
        ];
    }

    /** "NEEDS YOU": invites, due milestones, the family's changes, disputes to answer. */
    private function needs(User $user, Collection $projects): array
    {
        $out = [];
        foreach ($projects as $p) {
            $family = $this->family($p);
            $place = $p->meta['location'] ?? null;
            if ($p->vendor_id === $user->id && $p->vendor_status === 'invited') {
                $out[] = ['kind' => 'invite', 'project_id' => $p->id, 'title' => "Invite: {$p->title}", 'sub' => "{$family} · review the milestones"];
            }
            if (!in_array($p->vendor_status, ['accepted', null], true)) {
                continue;
            }
            foreach ($p->milestones as $m) {
                if (($m->change_request['by'] ?? null) === 'family') {
                    $out[] = ['kind' => 'change', 'project_id' => $p->id, 'milestone_id' => $m->id, 'title' => "The family changed {$m->title}", 'sub' => "{$family} · accept or keep it as it was"];
                } elseif ($m->status === 'funded' && (!empty($m->meta['rejection']) || $m->activeDispute()?->status === 'fixing')) {
                    $out[] = ['kind' => 'redo', 'project_id' => $p->id, 'milestone_id' => $m->id, 'title' => "{$m->title} needs another look", 'sub' => "{$family} · submit again when it's fixed"];
                } elseif (in_array($m->status, ['funded', 'planned'], true) && $m->due_date && $m->due_date->lte(now()->addDays(7)->endOfDay())) {
                    $out[] = ['kind' => 'due', 'project_id' => $p->id, 'milestone_id' => $m->id, 'title' => "{$m->title} is due " . $this->dueWord($m->due_date), 'sub' => implode(' · ', array_filter([$family, $place, 'submit photos when done']))];
                }
            }
        }
        $disputes = Dispute::with('project')->where('against_user_id', $user->id)->whereIn('status', ['open'])->get();
        foreach ($disputes as $d) {
            $out[] = ['kind' => 'dispute', 'dispute_id' => $d->id, 'project_id' => $d->project_id, 'title' => $d->subject, 'sub' => 'Reply by ' . ($d->reply_by ? Dispute::day($d->reply_by) : 'soon')];
        }

        return $out;
    }

    /** "Eze family · Tiling submitted, waiting", "Awka · 2 of 6 milestones paid", "Okafor family · invite to accept". */
    private function projectLine(Project $p, User $user): array
    {
        $family = $this->family($p);
        $milestones = $p->milestones->whereNotIn('status', ['cancelled', 'proposed']);
        $paid = $milestones->where('status', 'released')->count();
        $submitted = $milestones->whereIn('status', ['submitted', 'approved'])->first();
        $sub = match (true) {
            $p->vendor_status === 'invited' => "{$family} · invite to accept",
            $p->vendor_status === 'changes_proposed' => "{$family} · your changes are with the family",
            $submitted !== null => "{$family} · {$submitted->title} submitted, waiting",
            default => implode(' · ', array_filter([$p->meta['location'] ?? $family, "{$paid} of {$milestones->count()} milestones paid"])),
        };

        return [
            'id' => $p->id,
            'title' => $p->title,
            'sub' => $sub,
            'vendor_status' => $p->vendor_status ?? 'accepted',
            'status' => $p->status,
            'my_role' => $p->roleOf($user),
        ];
    }

    private function family(Project $p): string
    {
        return $p->owner?->last_name ? "{$p->owner->last_name} family" : ($p->owner?->fullName() ?? 'Family');
    }

    private function dueWord(Carbon $due): string
    {
        $days = (int) now()->startOfDay()->diffInDays($due->copy()->startOfDay(), false);

        return match (true) {
            $days < 0 => 'overdue',
            $days === 0 => 'today',
            $days === 1 => 'tomorrow',
            default => $due->format('l'),
        };
    }

    private function initials(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name)))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->join('');
    }

    private function naira(int $kobo): string
    {
        return number_format($kobo / 100, 2, '.', '');
    }
}
