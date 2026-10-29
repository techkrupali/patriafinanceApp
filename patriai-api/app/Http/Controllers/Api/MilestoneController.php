<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\MilestoneEvidence;
use App\Models\Project;
use App\Models\User;
use App\Services\PinService;
use App\Services\ProjectService;
use App\Services\VendorProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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

    // POST /milestones/{milestone}/submit  — VDM-05 {note?, done?: [bool]} (older clients send proof)
    public function submit(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if (!$project->actsForVendor($user, 'submit')) {
            return $this->fail('Only the builder or a site manager can submit this milestone', 403);
        }

        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:2000'],
            'proof' => ['nullable', 'string', 'max:2000'],
            'done' => ['sometimes', 'array'],
            'done.*' => ['boolean'],
        ]);

        $milestone = VendorProjectService::make()->submit($milestone, $user, $data['note'] ?? $data['proof'] ?? null, $data['done'] ?? null);

        return $this->ok('Milestone submitted', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // POST /milestones/{milestone}/approve  — PRJ-07 {pin}: the owner or a co-owner
    public function approve(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if (!$project->isFamilyApprover($user)) {
            return $this->fail('Only the family can approve this milestone', 403);
        }

        $data = $request->validate(['pin' => ['required', 'string', self::TXN_PIN]]);
        app(PinService::class)->verify($user, $data['pin']);

        $result = ProjectService::make()->approveMilestone($milestone, $user);

        if (($result['status'] ?? null) === 'pending_approval') {
            return $this->ok('Approval requested — the milestone pays out once approvers sign off', [
                'milestone' => $this->serializeMilestone($result['milestone']->load('evidence.user')),
                'approval_request_id' => $result['approval_request_id'],
            ]);
        }

        return $this->ok('Milestone approved and released', [
            'milestone' => $this->serializeMilestone($result['milestone']->load('evidence.user')),
            'reference' => $result['reference'],
        ]);
    }

    // POST /milestones/{milestone}/reject  — PRJ-06 "Ask for changes" {note?}
    public function reject(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if (!$project->isFamilyApprover($user)) {
            return $this->fail('Only the family can ask for changes', 403);
        }

        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $milestone = ProjectService::make()->rejectMilestone($milestone, $user, $data['note'] ?? null);

        return $this->ok('Sent back to the builder', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // POST /milestones/{milestone}/evidence  (multipart: file, kind?: receipt, caption?) — the builder's team
    public function uploadEvidence(Request $request, Milestone $milestone): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if (!$project->actsForVendor($user, 'upload')) {
            return $this->fail('Only the builder\'s team can add photos', 403);
        }
        if (!in_array($milestone->status, ['planned', 'funded', 'rejected'], true)) {
            return $this->fail('Photos can be added until the milestone is submitted', 422);
        }

        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,pdf,mp4,mov,quicktime,m4v', 'max:51200'], // 50 MB
            'kind' => ['nullable', 'in:receipt'],
            'caption' => ['nullable', 'string', 'max:60'],
        ]);

        $file = $request->file('file');
        $mime = (string) $file->getMimeType();
        $kind = ($data['kind'] ?? null) === 'receipt' ? 'receipt' : (str_starts_with($mime, 'video') ? 'video' : 'image');
        if ($kind !== 'receipt' && $mime === 'application/pdf') {
            return $this->fail('A PDF can only be added as a receipt', 422);
        }
        $path = $file->store('evidence', 'public');

        MilestoneEvidence::create([
            'milestone_id' => $milestone->id,
            'user_id' => $user->id,
            'kind' => $kind,
            'url' => $request->getSchemeAndHttpHost() . '/storage/' . $path,
            'caption' => $data['caption'] ?? null,
        ]);

        return $this->ok('Evidence uploaded', [
            'milestone' => $this->serializeMilestone($milestone->fresh()->load('evidence.user')),
        ]);
    }

    // DELETE /milestones/{milestone}/evidence/{evidence}  — before it's submitted
    public function deleteEvidence(Request $request, Milestone $milestone, MilestoneEvidence $evidence): JsonResponse
    {
        $user = $request->user();
        $project = $this->accessibleProject($milestone, $user);
        if ($project instanceof JsonResponse) {
            return $project;
        }
        if ($evidence->milestone_id !== $milestone->id || !$project->actsForVendor($user, 'upload')) {
            return $this->fail('Photo not found', 404);
        }
        if (!in_array($milestone->status, ['planned', 'funded', 'rejected'], true)) {
            return $this->fail('Submitted photos stay with the milestone', 422);
        }
        $path = str_contains($evidence->url, '/storage/') ? substr($evidence->url, strpos($evidence->url, '/storage/') + 9) : null;
        $evidence->delete();
        if ($path) {
            Storage::disk('public')->delete($path);
        }

        return $this->ok('Removed', ['milestone' => $this->serializeMilestone($milestone->fresh()->load('evidence.user'))]);
    }
}
