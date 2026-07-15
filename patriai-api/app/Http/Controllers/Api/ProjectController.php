<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
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
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id))
            ->latest()
            ->get();

        return $this->ok('Projects fetched', [
            'projects' => $projects->map(fn ($p) => $this->serializeProject($p, $user))->values(),
        ]);
    }

    // POST /projects  { title, description?, budget? (naira) }
    public function store(Request $request): JsonResponse
    {
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

        $data = $request->validate(['identifier' => ['required', 'string']]);

        $project = ProjectService::make()->assignVendor($project, $user, $data['identifier']);

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
        if ($guard = $this->ownerGuard($project, $user)) {
            return $guard;
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:1'],
        ]);

        $milestone = ProjectService::make()->addMilestone(
            $project,
            $user,
            $data['title'],
            $data['description'] ?? null,
            $this->toKobo($data['amount']),
        );

        return $this->ok('Milestone added', [
            'milestone' => $this->serializeMilestone($milestone),
            'project' => $this->serializeProject($project->fresh()->load(['wallet', 'owner', 'vendor']), $user),
        ], 201);
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
