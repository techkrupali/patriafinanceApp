<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorReview;
use App\Models\VendorTeamMember;
use Illuminate\Validation\ValidationException;

/**
 * A vendor's team and reviews:
 *  - VDM-10/11, INV-VT1: the owner invites a site manager, foreman or accounts
 *    person by phone, on the projects they choose; the invitee joins or declines
 *  - VND-04: a family rates the builder after a milestone is paid
 */
class VendorTeamService
{
    /** INV-VT1 "You can / You can't" for each role. */
    public const CAN = [
        'site_manager' => ['Add milestones, submit work for payment, talk to families', 'Withdraw money'],
        'foreman' => ['Upload photos, tick deliverables', 'Submit for payment or see money'],
        'accounts' => ['See payouts and statements', 'Withdraw or submit work'],
    ];

    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    // ----------------------------------------------------------------- team

    /** VDM-11 "Send invite". */
    public function invite(VendorProfile $profile, User $owner, string $phone, string $role, array $projectIds): VendorTeamMember
    {
        $projectIds = $this->ownProjects($profile, $projectIds);
        if ($phone === $owner->phone) {
            throw ValidationException::withMessages(['phone' => 'That\'s your own number.']);
        }
        $existing = $profile->team()->where('phone', $phone)->whereIn('status', ['pending', 'active'])->exists();
        if ($existing) {
            throw ValidationException::withMessages(['phone' => 'This person is already on your team or invited.']);
        }
        $invitee = User::where('phone', $phone)->first();
        $member = $profile->team()->create(['user_id' => $invitee?->id, 'phone' => $phone, 'role' => $role, 'project_ids' => $projectIds, 'status' => 'pending']);
        $roleLabel = $this->roleLabel($role);
        if ($invitee) {
            $this->notifications->push($invitee, 'vendor_team_invite', "{$owner->fullName()} added you to the {$profile->business_name} team", "You: {$roleLabel}. Open the app to join.", ['vendor_team_member_id' => $member->id]);
        } else {
            SmsService::make()->send($phone, "{$owner->fullName()} added you to the {$profile->business_name} team on Patriai as {$roleLabel}. Get the app and sign up with this number to join: " . rtrim((string) config('app.url'), '/'));
        }

        return $member;
    }

    public function update(VendorTeamMember $member, VendorProfile $profile, array $data): VendorTeamMember
    {
        $member->update(array_filter([
            'role' => $data['role'] ?? null,
            'project_ids' => isset($data['project_ids']) ? $this->ownProjects($profile, $data['project_ids']) : null,
        ], fn ($v) => $v !== null));

        return $member->refresh();
    }

    public function remove(VendorTeamMember $member): void
    {
        $member->update(['status' => 'removed']);
        if ($member->user) {
            $this->notifications->push($member->user, 'vendor_team_removed', "You're no longer on the {$member->vendorProfile->business_name} team", 'You won\'t see their projects any more.', []);
        }
    }

    /** INV-VT1 for the person invited (matched by account, or by the phone they signed up with). */
    public function invitesFor(User $user)
    {
        return VendorTeamMember::with('vendorProfile.user')->where('status', 'pending')
            ->where(fn ($q) => $q->where('user_id', $user->id)->when($user->phone, fn ($q) => $q->orWhere('phone', $user->phone)))
            ->latest()->get();
    }

    /** INV-VT1 "Join the team" / "Decline". */
    public function answer(VendorTeamMember $member, User $user, bool $join): VendorTeamMember
    {
        $mine = $member->user_id === $user->id || ($member->user_id === null && $member->phone && $member->phone === $user->phone);
        if (!$mine || $member->status !== 'pending') {
            throw ValidationException::withMessages(['invite' => 'This invitation is no longer open.']);
        }
        $member->update(['user_id' => $user->id, 'status' => $join ? 'active' : 'declined', 'accepted_at' => $join ? now() : null]);
        $owner = $member->vendorProfile->user;
        $this->notifications->push($owner, 'vendor_team_answered', $join ? "{$user->fullName()} joined your team" : "{$user->fullName()} declined your team invite", $join ? "As {$this->roleLabel($member->role)}." : '', ['vendor_team_member_id' => $member->id]);

        return $member->refresh();
    }

    public function present(VendorTeamMember $m): array
    {
        $projects = Project::whereIn('id', array_map('intval', $m->project_ids ?? []))->get(['id', 'title', 'meta']);

        return [
            'id' => $m->id,
            'name' => $m->user?->fullName(),
            'phone' => $m->phone,
            'role' => $m->role,
            'role_label' => $this->roleLabel($m->role),
            'status' => $m->status,
            'projects' => $projects->map(fn (Project $p) => ['id' => $p->id, 'title' => $p->title, 'location' => $p->meta['location'] ?? null])->values(),
            'can' => self::CAN[$m->role][0],
            'cannot' => self::CAN[$m->role][1],
            'business' => $m->vendorProfile ? ['id' => $m->vendorProfile->id, 'name' => $m->vendorProfile->business_name, 'owner' => $m->vendorProfile->user?->fullName()] : null,
            'invited_at' => $m->created_at?->toIso8601String(),
        ];
    }

    private function roleLabel(string $role): string
    {
        return ['site_manager' => 'Site manager', 'foreman' => 'Foreman', 'accounts' => 'Accounts'][$role] ?? ucfirst($role);
    }

    /** Only projects this business is building. */
    private function ownProjects(VendorProfile $profile, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        $own = Project::whereIn('id', $ids)->where('vendor_id', $profile->user_id)->pluck('id')->all();
        if (count($own) !== count($ids)) {
            throw ValidationException::withMessages(['project_ids' => 'Choose projects your business is working on.']);
        }

        return $own;
    }

    // ----------------------------------------------------------------- reviews

    /** VND-04 "Post review", by someone on the family's side, once a milestone was paid. */
    public function review(VendorProfile $profile, User $user, array $data): VendorReview
    {
        $milestone = !empty($data['milestone_id']) ? Milestone::with('project')->find((int) $data['milestone_id']) : null;
        $project = $milestone?->project ?? (!empty($data['project_id']) ? Project::find((int) $data['project_id']) : null);
        $worked = $project && $project->vendor_id === $profile->user_id && $project->isFamilyApprover($user)
            && $project->milestones()->where('status', 'released')->when($milestone, fn ($q) => $q->whereKey($milestone->id))->exists();
        if (!$worked) {
            throw ValidationException::withMessages(['review' => 'You can review a business after it has been paid for work on your project.']);
        }
        $already = VendorReview::where('user_id', $user->id)->where('vendor_profile_id', $profile->id)
            ->where(fn ($q) => $milestone ? $q->where('milestone_id', $milestone->id) : $q->whereNull('milestone_id')->where('project_id', $project->id))->exists();
        if ($already) {
            throw ValidationException::withMessages(['review' => 'You already reviewed this.']);
        }
        $review = VendorReview::create([
            'vendor_profile_id' => $profile->id,
            'user_id' => $user->id,
            'project_id' => $project->id,
            'milestone_id' => $milestone?->id,
            'rating' => (int) $data['rating'],
            'tags' => array_values(array_intersect($data['tags'] ?? [], VendorReview::TAGS)),
            'body' => $data['body'] ?? null,
            'first_name_only' => (bool) ($data['first_name_only'] ?? true),
        ]);
        $this->notifications->push($profile->user, 'vendor_reviewed', "{$user->first_name} rated you {$review->rating} star" . ($review->rating === 1 ? '' : 's'), $review->body ? '"' . mb_substr($review->body, 0, 120) . '"' : "For {$project->title}.", ['vendor_profile_id' => $profile->id]);

        return $review;
    }

    /** Stars and the latest words for the directory and profile (VND-01/02). */
    public function ratings(VendorProfile $profile): array
    {
        $reviews = $profile->reviews()->with(['user', 'milestone.project'])->latest()->get();
        $latest = $reviews->first(fn (VendorReview $r) => (bool) $r->body);

        return [
            'rating' => $reviews->isEmpty() ? null : round($reviews->avg('rating'), 1),
            'reviews' => $reviews->count(),
            'latest' => $latest ? [
                'rating' => $latest->rating,
                'body' => $latest->body,
                'by' => $this->reviewer($latest),
                'tags' => $latest->tags ?? [],
                'created_at' => $latest->created_at?->toIso8601String(),
            ] : null,
        ];
    }

    /** "Ifeoma, Enugu" — the first name only, unless they chose otherwise, and the project's town. */
    private function reviewer(VendorReview $r): string
    {
        $name = $r->first_name_only ? ($r->user?->first_name ?? 'A family') : ($r->user?->fullName() ?? 'A family');
        $place = Project::find($r->project_id)?->meta['location'] ?? null;
        $town = $place ? trim((string) collect(explode(',', $place))->last()) : null;

        return $town ? "{$name}, {$town}" : $name;
    }
}
