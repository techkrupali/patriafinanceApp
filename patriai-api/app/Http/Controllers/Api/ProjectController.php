<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorTeamMember;
use App\Services\ProjectService;
use App\Services\ProjectSetupService;
use App\Services\VendorTeamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends ApiController
{
    /** Owner-only gate: null when allowed, otherwise the 403/404 response to return. */
    private function ownerGuard(Project $project, User $user): ?JsonResponse
    {
        if ($project->owner_id === $user->id) {
            return null;
        }

        return $project->isAccessibleBy($user)
            ? $this->fail('Only the project owner can perform this action', 403)
            : $this->fail('Project not found', 404);
    }

    // GET /projects  — PRJ-01; a builder's team member sees the projects they were given
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $teamProjects = VendorTeamMember::with('vendorProfile')->where('user_id', $user->id)->where('status', 'active')->get()
            ->flatMap(fn (VendorTeamMember $m) => Project::whereIn('id', array_map('intval', $m->project_ids ?? []))
                ->where('vendor_id', $m->vendorProfile?->user_id)->pluck('id'));

        $projects = Project::with(['wallet', 'owner', 'vendor', 'milestones'])
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id)
                // PRW-05 funders who joined the project wallet.
                ->orWhereHas('wallet.members', fn ($m) => $m->where('user_id', $user->id)->where('status', 'active'))
                ->orWhereIn('id', $teamProjects->unique()->values()))
            ->latest()
            ->get();

        return $this->ok('Projects fetched', [
            'projects' => $projects->map(fn ($p) => $this->serializeProject($p, $user))->values(),
        ]);
    }

    // POST /projects  { title, description?, budget? (naira) } — or the PRW-01…06 setup:
    // kind, location, starts_on, finishes_on, buffer_percent, milestones, vendor,
    // my_monthly + source_wallet_id, funders, move_in_wallet_id, release, draft_id
    public function store(Request $request): JsonResponse
    {
        if ($request->has('kind')) {
            return $this->setup($request);
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'budget' => ['nullable', 'numeric', 'min:0'],
        ]);

        $project = ProjectService::make()->createProject(
            $request->user(),
            $data['title'],
            $data['description'] ?? null,
            isset($data['budget']) ? $this->toKobo($data['budget']) : 0,
        );

        return $this->ok('Project created', [
            'project' => $this->serializeProject($project, $request->user()),
            'wallet' => $this->serializeWallet($project->wallet),
        ], 201);
    }

    /** PRW-01…06: the whole project set up in one go. */
    private function setup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'kind' => ['required', 'in:' . implode(',', ProjectSetupService::KINDS)],
            'location' => ['nullable', 'string', 'max:120'],
            'starts_on' => ['nullable', 'date'],
            'finishes_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'budget' => ['required', 'numeric', 'min:1'],
            'buffer_percent' => ['sometimes', 'integer', 'in:0,5,10'],
            'milestones' => ['required', 'array', 'min:1', 'max:20'],
            'milestones.*.title' => ['required', 'string', 'max:100'],
            'milestones.*.description' => ['nullable', 'string', 'max:200'],
            'milestones.*.amount' => ['required', 'numeric', 'min:1'],
            'milestones.*.starts_on' => ['nullable', 'date'],
            'milestones.*.ends_on' => ['nullable', 'date'],
            'vendor' => ['nullable', 'array'],
            'vendor.vendor_profile_id' => ['nullable', 'integer'],
            'vendor.identifier' => ['nullable', 'string', 'max:150'],
            'my_monthly' => ['nullable', 'numeric', 'min:0'],
            'source_wallet_id' => ['nullable', 'integer'],
            'funders' => ['sometimes', 'array', 'max:10'],
            'funders.*.user_id' => ['nullable', 'integer', 'required_without:funders.*.identifier'],
            'funders.*.identifier' => ['nullable', 'string', 'max:150'],
            'funders.*.role' => ['required', 'in:co_owner,contributor'],
            'funders.*.amount' => ['required', 'numeric', 'min:1'],
            'move_in_wallet_id' => ['nullable', 'integer'],
            'release' => ['nullable', 'array'],
            'release.photos' => ['sometimes', 'boolean'],
            'release.video' => ['sometimes', 'boolean'],
            'release.receipts' => ['sometimes', 'boolean'],
            'release.approvers' => ['sometimes', 'in:all,owner'],
            'release.retention_percent' => ['sometimes', 'integer', 'in:0,5,10'],
            'release.retention_months' => ['sometimes', 'integer', 'in:1,3,6,12'],
            'draft_id' => ['nullable', 'integer'],
        ]);
        // Lists in the order sent; naira over the wire, kobo from here on.
        foreach (['milestones', 'funders'] as $list) {
            if (isset($data[$list])) {
                ksort($data[$list]);
            }
        }
        $data['budget'] = $this->toKobo((string) $data['budget']);
        $data['my_monthly'] = isset($data['my_monthly']) ? $this->toKobo((string) $data['my_monthly']) : 0;
        foreach ($data['milestones'] as $i => $m) {
            $data['milestones'][$i]['amount'] = $this->toKobo((string) $m['amount']);
        }
        foreach ($data['funders'] ?? [] as $i => $f) {
            $data['funders'][$i]['amount'] = $this->toKobo((string) $f['amount']);
            if (!empty($f['identifier']) && !str_contains($f['identifier'], '@')) {
                $data['funders'][$i]['identifier'] = $this->normalizePhone($f['identifier']);
            }
        }
        if (!empty($data['vendor']['identifier']) && !str_contains($data['vendor']['identifier'], '@')) {
            $data['vendor']['identifier'] = $this->normalizePhone($data['vendor']['identifier']);
        }

        $project = ProjectSetupService::make()->setup($request->user(), $data);
        $project->load(['wallet', 'owner', 'vendor']);

        return $this->ok('Project created', [
            'project' => $this->serializeProject($project, $request->user()),
            'wallet' => $this->serializeWallet($project->wallet),
        ], 201);
    }

    // GET /projects/{project}  — PRJ-03/04/09/10/12, VDM-04
    public function show(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();

        if (!$project->isAccessibleBy($user)) {
            return $this->fail('Project not found', 404);
        }

        $project->load(['wallet', 'owner', 'vendor', 'milestones' => fn ($q) => $q->orderBy('sequence'), 'milestones.evidence.user']);
        $role = $project->roleOf($user);
        $family = $project->isFamilyApprover($user);
        $evidence = $project->milestones->flatMap->evidence;
        $documents = ProjectDocument::with('user')->where('project_id', $project->id)->latest()->get();

        return $this->ok('Project fetched', [
            'project' => $this->serializeProject($project, $user),
            // The family's wallet isn't shown to the builder's foreman.
            'wallet' => $role === 'foreman' ? null : $this->serializeWallet($project->wallet),
            'owner' => $project->owner ? ['name' => $project->owner->fullName(), 'email' => $project->owner->email] : null,
            'vendor' => $project->vendor ? ['name' => $project->vendor->fullName(), 'email' => $project->vendor->email] : null,
            'my_role' => $role,
            'milestones' => $project->milestones->map(fn ($m) => $this->serializeMilestone($m))->values(),
            'reserved' => number_format($project->reservedAmount() / 100, 2, '.', ''),
            'available' => number_format($project->availableToAllocate() / 100, 2, '.', ''),
            'released' => number_format($project->releasedAmount() / 100, 2, '.', ''),
            // PRJ-09: the contract and bill of quantities, receipts and site photos from milestones.
            'documents' => $documents->map(fn (ProjectDocument $d) => $this->serializeDocument($d))->values(),
            'receipts' => $evidence->where('kind', 'receipt')->map(fn ($e) => ['id' => $e->id, 'url' => $e->url, 'caption' => $e->caption, 'milestone_id' => $e->milestone_id, 'created_at' => $e->created_at?->toIso8601String()])->values(),
            'site_photos' => $evidence->whereIn('kind', ['image', 'video'])->count(),
            'budget' => $this->budgetVsActual($project),
            'suggestions' => !$project->vendor_id ? $this->builderSuggestions($project) : null,
            // VND-04: the milestones this person has already rated the builder for.
            'reviewed_milestones' => \App\Models\VendorReview::where('user_id', $user->id)->where('project_id', $project->id)->pluck('milestone_id')->filter()->values(),
            'can' => [
                'approve' => $family,
                'edit' => $family,
                'invite_vendor' => $project->owner_id === $user->id,
                'accept' => $project->vendor_id === $user->id && $project->vendor_status === 'invited',
                'propose' => $project->actsForVendor($user, 'submit') && in_array($project->vendor_status, ['accepted', null], true),
                'submit' => $project->actsForVendor($user, 'submit') && in_array($project->vendor_status, ['accepted', null], true),
                'upload' => $project->actsForVendor($user, 'upload') && in_array($project->vendor_status, ['accepted', null], true),
                'chat' => $role !== 'accounts',
                'dispute' => $family && $project->vendor_id !== null,
                'see_money' => $role !== 'foreman',
            ],
        ]);
    }

    /** PRJ-10 "Budget vs actual": each milestone's spend against its plan, extras the builder added, and the buffer left. */
    private function budgetVsActual(Project $project): array
    {
        $naira = fn (int $k) => number_format($k / 100, 2, '.', '');
        $milestones = $project->milestones->whereNotIn('status', ['cancelled', 'proposed']);
        $spent = fn (Milestone $m) => in_array($m->status, ['submitted', 'approved', 'released'], true) ? $m->amount - (int) ($m->meta['refunded'] ?? 0) : 0;
        $planned = $milestones->where('origin', '!=', 'vendor');
        $extras = $milestones->where('origin', 'vendor');
        $bufferTotal = intdiv($project->budget * (int) ($project->meta['buffer_percent'] ?? 0), 100);
        $extrasTotal = (int) $extras->sum('amount');

        return [
            'budget' => $naira($project->budget),
            'committed' => $naira((int) $milestones->sum($spent)),
            'lines' => $planned->map(fn (Milestone $m) => ['milestone_id' => $m->id, 'title' => $m->title, 'spent' => $naira($spent($m)), 'planned' => $naira($m->amount)])->values(),
            'extras' => $extras->map(fn (Milestone $m) => ['milestone_id' => $m->id, 'title' => $m->title, 'amount' => $naira($m->amount)])->values(),
            'extras_total' => $naira($extrasTotal),
            'buffer' => $naira($bufferTotal),
            'buffer_left' => $naira(max(0, $bufferTotal - $extrasTotal)),
            'over_buffer' => $naira(max(0, $extrasTotal - $bufferTotal)),
        ];
    }

    /** PRJ-12 "3 in Enugu with 4.5 stars or more". */
    private function builderSuggestions(Project $project): array
    {
        $place = $project->meta['location'] ?? null;
        $town = $place ? trim((string) collect(explode(',', $place))->last()) : null;
        $reviews = VendorTeamService::make();
        $count = VendorProfile::where('verified', true)->whereIn('category', ['building', 'construction'])
            ->when($town, fn ($q) => $q->where(fn ($w) => $w->whereRaw('LOWER(COALESCE(location, \'\')) LIKE ?', ['%' . strtolower($town) . '%'])
                ->orWhereRaw('LOWER(COALESCE(areas, \'\')) LIKE ?', ['%' . strtolower($town) . '%'])))
            ->where('user_id', '!=', $project->meta['vendor_declined']['user_id'] ?? 0)
            ->get()->filter(fn (VendorProfile $p) => ($reviews->ratings($p)['rating'] ?? 0) >= 4.5)->count();

        return ['near' => $town, 'count' => $count];
    }

    // POST /projects/{project}/vendor  { identifier }
    public function assignVendor(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if ($guard = $this->ownerGuard($project, $user)) {
            return $guard;
        }

        $data = $request->validate([
            // A builder from the directory (VND-02 "Invite to a project"), an app user, or an email/phone identifier.
            'vendor_profile_id' => ['sometimes', 'nullable', 'integer', 'exists:vendor_profiles,id'],
            'vendor_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'identifier' => ['required_without_all:vendor_user_id,vendor_profile_id', 'nullable', 'string'],
        ]);

        if (!empty($data['vendor_profile_id'])) {
            $vendor = VendorProfile::find($data['vendor_profile_id'])?->user;
        } elseif (!empty($data['vendor_user_id'])) {
            $vendor = User::find($data['vendor_user_id']);
        } else {
            $id = trim($data['identifier']);
            $vendor = str_contains($id, '@')
                ? User::where('email', strtolower($id))->first()
                : User::where('phone', $this->normalizePhone($id))->first();
        }
        if (!$vendor) {
            return $this->fail('No user found for that username, email or phone', 422);
        }

        $project = ProjectService::make()->assignVendor($project, $user, $vendor);

        return $this->ok('Invite sent', [
            'project' => $this->serializeProject($project->load(['wallet', 'owner', 'vendor']), $user),
        ]);
    }

    // DELETE /projects/{project}/vendor
    public function removeVendor(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if ($guard = $this->ownerGuard($project, $user)) {
            return $guard;
        }

        $project = ProjectService::make()->removeVendor($project, $user);

        return $this->ok('Vendor removed', [
            'project' => $this->serializeProject($project->load(['wallet', 'owner', 'vendor']), $user),
        ]);
    }

    // POST /projects/{project}/milestones  { title, description?, amount (naira) }
    public function addMilestone(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if (!$project->isAccessibleBy($user)) {
            return $this->fail('Project not found', 404);
        }
        // The family adds milestones; the builder proposes them for the family to approve (VDM-09).
        if (!$project->isFamilyApprover($user)) {
            return $this->fail('Send new milestones to the family to approve', 403);
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:1'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
            'deliverables' => ['sometimes', 'array', 'max:12'],
            'deliverables.*' => ['string', 'max:120'],
        ]);

        $milestone = ProjectService::make()->addMilestone(
            $project,
            $user,
            $data['title'],
            $data['description'] ?? null,
            $this->toKobo($data['amount']),
            $data['due_date'] ?? null,
        );
        if (!empty($data['deliverables'])) {
            $milestone->update(['deliverables' => collect($data['deliverables'])->map(fn ($t) => trim($t))->filter()->map(fn ($t) => ['text' => $t, 'done' => false])->values()->all()]);
        }

        return $this->ok('Milestone added', [
            'milestone' => $this->serializeMilestone($milestone),
            'project' => $this->serializeProject($project->fresh()->load(['wallet', 'owner', 'vendor']), $user),
        ], 201);
    }

    // POST /projects/{project}/cancel  (owner)
    public function cancel(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if ($guard = $this->ownerGuard($project, $user)) {
            return $guard;
        }

        $project = ProjectService::make()->cancel($project, $user);

        return $this->ok('Project cancelled', [
            'project' => $this->serializeProject($project->load(['wallet', 'owner', 'vendor']), $user),
        ]);
    }

    // DELETE /milestones/{milestone}
    public function removeMilestone(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $milestone->project;

        if (!$project || !$project->isAccessibleBy($user)) {
            return $this->fail('Milestone not found', 404);
        }
        if ($project->owner_id !== $user->id) {
            return $this->fail('Only the project owner can remove a milestone', 403);
        }

        ProjectService::make()->removeMilestone($milestone, $user);

        return $this->ok('Milestone removed');
    }
}
