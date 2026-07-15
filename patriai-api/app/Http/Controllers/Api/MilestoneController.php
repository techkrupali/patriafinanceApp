<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Services\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MilestoneController extends ApiController
{
    /** Resolve the milestone's project, or a 404 if the user can't access it. */
    private function accessibleProject(Milestone $milestone, User $user): Project|JsonResponse
    {
        $project = $milestone->project;

        if (!$project || !$project->isAccessibleBy($user)) {
            return $this->fail('Milestone not found', 404);
        }

        return $project;
    }

    // POST /milestones/{milestone}/submit  { proof }  (vendor)
    public function submit(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if ($project->vendor_id !== $user->id) {
            return $this->fail('Only the assigned vendor can submit this milestone', 403);
        }

        $data = $request->validate(['proof' => ['required', 'string', 'max:2000']]);

        $milestone = ProjectService::make()->submitMilestone($milestone, $user, $data['proof']);

        return $this->ok('Milestone submitted', ['milestone' => $this->serializeMilestone($milestone)]);
    }

    // POST /milestones/{milestone}/approve  (owner)
    public function approve(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if ($project->owner_id !== $user->id) {
            return $this->fail('Only the project owner can approve this milestone', 403);
        }

        $result = ProjectService::make()->approveMilestone($milestone, $user);

        return $this->ok('Milestone approved and released', [
            'milestone' => $this->serializeMilestone($result['milestone']),
            'reference' => $result['reference'],
        ]);
    }

    // POST /milestones/{milestone}/reject  { note? }  (owner)
    public function reject(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if ($project->owner_id !== $user->id) {
            return $this->fail('Only the project owner can reject this milestone', 403);
        }

        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $milestone = ProjectService::make()->rejectMilestone($milestone, $user, $data['note'] ?? null);

        return $this->ok('Milestone rejected', ['milestone' => $this->serializeMilestone($milestone)]);
    }
}
