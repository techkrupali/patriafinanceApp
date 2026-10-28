<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\ProjectSetupService;
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

    // GET /projects
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $projects = Project::with(['wallet', 'owner', 'vendor'])
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id)
                // PRW-05 funders who joined the project wallet.
                ->orWhereHas('wallet.members', fn ($m) => $m->where('user_id', $user->id)->where('status', 'active')))
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

    // GET /projects/{project}
    public function show(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();

        if (!$project->isAccessibleBy($user)) {
            return $this->fail('Project not found', 404);
        }

        $project->load(['wallet', 'owner', 'vendor', 'milestones' => fn ($q) => $q->orderBy('sequence')]);

        return $this->ok('Project fetched', [
            'project' => $this->serializeProject($project, $user),
            'wallet' => $this->serializeWallet($project->wallet),
            'owner' => $project->owner ? ['name' => $project->owner->fullName(), 'email' => $project->owner->email] : null,
            'vendor' => $project->vendor ? ['name' => $project->vendor->fullName(), 'email' => $project->vendor->email] : null,
            'my_role' => $project->roleOf($user),
            'milestones' => $project->milestones->map(fn ($m) => $this->serializeMilestone($m))->values(),
            'reserved' => number_format($project->reservedAmount() / 100, 2, '.', ''),
            'available' => number_format($project->availableToAllocate() / 100, 2, '.', ''),
            'released' => number_format($project->releasedAmount() / 100, 2, '.', ''),
        ]);
    }

    // POST /projects/{project}/vendor  { identifier }
    public function assignVendor(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if ($guard = $this->ownerGuard($project, $user)) {
            return $guard;
        }

        $data = $request->validate([
            // Existing app user picked via @username search, or an email/phone identifier.
            'vendor_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'identifier' => ['required_without:vendor_user_id', 'nullable', 'string'],
        ]);

        if (!empty($data['vendor_user_id'])) {
            $vendor = User::find($data['vendor_user_id']);
        } else {
            $id = trim($data['identifier']);
            $vendor = str_contains($id, '@')
                ? User::where('email', strtolower($id))->first()
                : User::where('phone', $id)->first();
        }
        if (!$vendor) {
            return $this->fail('No user found for that username, email or phone', 422);
        }

        $project = ProjectService::make()->assignVendor($project, $user, $vendor);

        return $this->ok('Vendor assigned', [
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
        // Owner or the assigned vendor may add milestones.
        if (!$project->isAccessibleBy($user)) {
            return $this->fail('Project not found', 404);
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:1'],
            'due_date' => ['nullable', 'date'],
        ]);

        $milestone = ProjectService::make()->addMilestone(
            $project,
            $user,
            $data['title'],
            $data['description'] ?? null,
            $this->toKobo($data['amount']),
            $data['due_date'] ?? null,
        );

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
