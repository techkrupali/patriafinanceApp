<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\ProjectMessage;
use App\Services\NotificationService;
use App\Services\VendorProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The family and the builder working together on a project (client sheet
 * "Projects, vendors, disputes"): answering an invitation (INV-V1…V5, PRJ-12),
 * new milestones from the builder (VDM-09, PRJ-11), the family's edits
 * (PRJ-05), deliverables, documents (PRJ-09) and the project chat.
 */
class ProjectFlowController extends ApiController
{
    // POST /projects/{project}/accept  — INV-V2 "Accept them all"
    public function accept(Request $request, Project $project): JsonResponse
    {
        $project = VendorProjectService::make()->accept($project, $request->user());

        return $this->detail($request, $project, 'Project accepted');
    }

    // POST /projects/{project}/decline  — INV-V5 {reason, message?, start_month?}
    public function decline(Request $request, Project $project): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'in:' . implode(',', VendorProjectService::DECLINE_REASONS)],
            'message' => ['nullable', 'string', 'max:500'],
            'start_month' => ['nullable', 'date_format:Y-m'],
        ]);
        VendorProjectService::make()->decline($project, $request->user(), $data);

        return $this->ok('Project declined');
    }

    // POST /milestones/{milestone}/change  — INV-V3 {amount?, starts_on?, due_date?, why?, attachment_id?}
    public function askChange(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:1'],
            'starts_on' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
            'why' => ['nullable', 'string', 'max:500'],
            'attachment_id' => ['nullable', 'integer'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo($data['amount']);
        }
        if (!empty($data['attachment_id'])) {
            $doc = ProjectDocument::where('project_id', $milestone->project_id)->find((int) $data['attachment_id']);
            $data['attachment'] = $doc ? ['id' => $doc->id, 'name' => $doc->name, 'url' => $doc->url] : null;
        }
        $milestone = VendorProjectService::make()->askChange($milestone, $request->user(), $data);

        return $this->ok('Change saved', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // DELETE /milestones/{milestone}/change
    public function clearChange(Request $request, Milestone $milestone): JsonResponse
    {
        $milestone = VendorProjectService::make()->clearChange($milestone, $request->user());

        return $this->ok('Change removed', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // POST /projects/{project}/send-changes  — INV-V4
    public function sendChanges(Request $request, Project $project): JsonResponse
    {
        $project = VendorProjectService::make()->sendChanges($project, $request->user());

        return $this->detail($request, $project, 'Sent to the family');
    }

    // POST /projects/{project}/changes/answer  {agree}
    public function answerChanges(Request $request, Project $project): JsonResponse
    {
        $data = $request->validate(['agree' => ['required', 'boolean']]);
        $project = VendorProjectService::make()->answerChanges($project, $request->user(), (bool) $data['agree']);

        return $this->detail($request, $project, $data['agree'] ? 'Changes agreed' : 'Original milestones kept');
    }

    // POST /projects/{project}/reinvite-reminder  — PRJ-12
    public function remindReinvite(Request $request, Project $project): JsonResponse
    {
        $on = VendorProjectService::make()->remindReinvite($project, $request->user());

        return $this->ok('We\'ll remind you on ' . $on->format('j M'), ['remind_on' => $on->toDateString()]);
    }

    // POST /projects/{project}/milestones/propose  — VDM-09
    public function propose(Request $request, Project $project): JsonResponse
    {
        if (!$project->isAccessibleBy($request->user())) {
            return $this->fail('Project not found', 404);
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'amount' => ['required', 'numeric', 'min:1'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
            'deliverables' => ['sometimes', 'array', 'max:12'],
            'deliverables.*' => ['string', 'max:120'],
            'reason' => ['required', 'in:' . implode(',', VendorProjectService::PROPOSE_REASONS)],
            'why' => ['nullable', 'string', 'max:300'],
        ]);
        $data['amount'] = $this->toKobo($data['amount']);
        $milestone = VendorProjectService::make()->proposeMilestone($project, $request->user(), $data);

        return $this->ok('Sent to the family', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))], 201);
    }

    // PATCH /milestones/{milestone}/proposal  {title?, amount?, due_date?, deliverables?}
    public function updateProposal(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'amount' => ['sometimes', 'numeric', 'min:1'],
            'due_date' => ['sometimes', 'nullable', 'date', 'after_or_equal:today'],
            'deliverables' => ['sometimes', 'array', 'max:12'],
            'deliverables.*' => ['string', 'max:120'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo($data['amount']);
        }
        $milestone = VendorProjectService::make()->updateProposed($milestone, $request->user(), $data);

        return $this->ok('Updated', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // POST /milestones/{milestone}/proposal/answer  — PRJ-11 {approve, note?}
    public function answerProposal(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate(['approve' => ['required', 'boolean'], 'note' => ['nullable', 'string', 'max:500']]);
        $milestone = VendorProjectService::make()->answerProposed($milestone, $request->user(), (bool) $data['approve'], $data['note'] ?? null);

        return $this->ok($data['approve'] ? 'Milestone approved' : 'Changes asked', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // PATCH /milestones/{milestone}  — PRJ-05 {title?, amount?, due_date?, deliverables?, proof_needed?}
    public function edit(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'amount' => ['sometimes', 'numeric', 'min:1'],
            'due_date' => ['sometimes', 'nullable', 'date', 'after_or_equal:today'],
            'deliverables' => ['sometimes', 'array', 'max:12'],
            'deliverables.*' => ['string', 'max:120'],
            'proof_needed' => ['sometimes', 'nullable', 'string', 'max:200'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo($data['amount']);
        }
        $milestone = VendorProjectService::make()->editMilestone($milestone, $request->user(), $data);

        return $this->ok($milestone->change_request ? 'Sent to the builder' : 'Saved', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // POST /milestones/{milestone}/family-change/answer  {agree}
    public function answerFamilyChange(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate(['agree' => ['required', 'boolean']]);
        $milestone = VendorProjectService::make()->answerFamilyChange($milestone, $request->user(), (bool) $data['agree']);

        return $this->ok($data['agree'] ? 'Change accepted' : 'Kept as it was', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // PATCH /milestones/{milestone}/deliverables  {done: [bool]}
    public function tick(Request $request, Milestone $milestone): JsonResponse
    {
        $data = $request->validate(['done' => ['present', 'array'], 'done.*' => ['boolean']]);
        $milestone = VendorProjectService::make()->tickDeliverables($milestone, $request->user(), $data['done']);

        return $this->ok('Saved', ['milestone' => $this->serializeMilestone($milestone->load('evidence.user'))]);
    }

    // ----------------------------------------------------------------- documents

    // POST /projects/{project}/documents  (multipart: file, kind, name?) — PRJ-09; also a quote for INV-V3
    public function uploadDocument(Request $request, Project $project): JsonResponse
    {
        if (!$project->isAccessibleBy($request->user())) {
            return $this->fail('Project not found', 404);
        }
        $data = $request->validate([
            'kind' => ['required', 'in:' . implode(',', ProjectDocument::KINDS)],
            'name' => ['nullable', 'string', 'max:120'],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'],
        ]);
        $file = $request->file('file');
        $path = $file->store('project-documents', 'public');
        $doc = ProjectDocument::create([
            'project_id' => $project->id,
            'user_id' => $request->user()->id,
            'kind' => $data['kind'],
            'name' => Str::limit($data['name'] ?? ($file->getClientOriginalName() ?: $data['kind']), 120, ''),
            'url' => $request->getSchemeAndHttpHost() . '/storage/' . $path,
        ]);

        return $this->ok('Uploaded', ['document' => $this->serializeDocument($doc)], 201);
    }

    // DELETE /projects/{project}/documents/{document}
    public function deleteDocument(Request $request, Project $project, ProjectDocument $document): JsonResponse
    {
        if ($document->project_id !== $project->id || ($document->user_id !== $request->user()->id && $project->owner_id !== $request->user()->id)) {
            return $this->fail('Document not found', 404);
        }
        $document->delete();

        return $this->ok('Removed');
    }

    // ----------------------------------------------------------------- chat

    // GET /projects/{project}/messages
    public function messages(Request $request, Project $project): JsonResponse
    {
        if (!$project->isAccessibleBy($request->user())) {
            return $this->fail('Project not found', 404);
        }
        $messages = $project->hasMany(ProjectMessage::class)->with('user')->orderByDesc('id')->limit(100)->get()->reverse()->values();

        return $this->ok('Messages', ['messages' => $messages->map(fn (ProjectMessage $m) => $this->serializeMessage($m, $request))->values()]);
    }

    // POST /projects/{project}/messages  {body}
    public function send(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if (!$project->isAccessibleBy($user) || $project->roleOf($user) === 'accounts') {
            return $this->fail('Project not found', 404);
        }
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $message = ProjectMessage::create(['project_id' => $project->id, 'user_id' => $user->id, 'body' => trim($data['body'])]);

        // Everyone else on the project hears.
        $notify = collect([$project->owner_id, $project->vendor_id])
            ->merge($project->wallet?->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->pluck('user_id') ?? [])
            ->filter()->unique()->reject(fn ($id) => $id === $user->id);
        foreach (\App\Models\User::whereIn('id', $notify)->get() as $to) {
            NotificationService::make()->push($to, 'project_message', "{$user->first_name} on {$project->title}", Str::limit($message->body, 140), ['project_id' => $project->id]);
        }

        return $this->ok('Sent', ['message' => $this->serializeMessage($message->load('user'), $request)], 201);
    }

    private function serializeMessage(ProjectMessage $m, Request $request): array
    {
        return [
            'id' => $m->id,
            'body' => $m->body,
            'name' => $m->user?->first_name ?? 'Someone',
            'initials' => strtoupper(mb_substr($m->user?->first_name ?? '?', 0, 1) . mb_substr($m->user?->last_name ?? '', 0, 1)),
            'mine' => $m->user_id === $request->user()->id,
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }

    private function detail(Request $request, Project $project, string $message): JsonResponse
    {
        return $this->ok($message, ['project' => $this->serializeProject($project->fresh()->load(['wallet', 'owner', 'vendor']), $request->user())]);
    }
}
