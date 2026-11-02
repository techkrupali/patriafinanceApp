<?php

namespace App\Http\Controllers\Api;

use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\ConversationMessage;
use App\Models\Project;
use App\Models\ProjectDocument;
use App\Models\User;
use App\Models\VendorProfile;
use App\Services\ChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * CHT-01…05 Chats: the inbox, a new direct or group chat, a conversation and
 * its info (people, files, Steward, mute, add people, leave).
 */
class ChatController extends ApiController
{
    // GET /chats?filter=all|projects|vendors|family — CHT-01
    public function index(Request $request): JsonResponse
    {
        $filter = in_array($request->query('filter'), ['projects', 'vendors', 'family'], true) ? $request->query('filter') : 'all';

        return $this->ok('Chats', ['chats' => ChatService::make()->inbox($request->user(), $filter)]);
    }

    // GET /chat-contacts — CHT-02 "Add people"
    public function contacts(Request $request): JsonResponse
    {
        $chat = ChatService::make();
        $projects = $chat->projects($request->user())->map(fn (Project $p) => ['id' => $p->id, 'title' => $p->title])->values();

        return $this->ok('People', ['people' => $chat->contacts($request->user()), 'projects' => $projects]);
    }

    // POST /chats/direct {user_id} — CHT-04
    public function direct(Request $request): JsonResponse
    {
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        $other = User::find($data['user_id']);
        if ($other->role === 'child') {
            return $this->fail('Children chat with their parents in their own app.', 422);
        }
        $c = ChatService::make()->direct($request->user(), $other);

        return $this->ok('Chat', ['chat' => $this->detail($c, $request->user())], 201);
    }

    // POST /chats/groups {title, member_ids[], project_id?, steward?} — CHT-02
    public function group(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:80'],
            'member_ids' => ['required', 'array', 'min:1', 'max:30'],
            'member_ids.*' => ['integer'],
            'project_id' => ['nullable', 'integer'],
            'steward' => ['sometimes', 'boolean'],
        ]);
        $project = !empty($data['project_id']) ? Project::find($data['project_id']) : null;
        $c = ChatService::make()->group($request->user(), trim($data['title']), $data['member_ids'], $project, (bool) ($data['steward'] ?? false));

        return $this->ok('Group made', ['chat' => $this->detail($c, $request->user())], 201);
    }

    // GET /chats/{conversation} — messages (marks them read) and CHT-05 info
    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        if (!$conversation->hasMember($user)) {
            return $this->fail('Chat not found', 404);
        }
        $messages = $conversation->messages()->with('user')->orderByDesc('id')->limit(100)->get()->reverse()->values();
        if ($last = $messages->last()) {
            ChatService::make()->read($user, $conversation->key(), $last->id);
        }

        return $this->ok('Chat', [
            'chat' => $this->detail($conversation, $user),
            'messages' => $messages->map(fn (ConversationMessage $m) => $this->message($m, $user))->values(),
        ]);
    }

    // POST /chats/{conversation}/messages {body}
    public function send(Request $request, Conversation $conversation): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        if (!$conversation->hasMember($request->user())) {
            return $this->fail('Chat not found', 404);
        }
        $m = ChatService::make()->send($conversation, $request->user(), $data['body']);

        return $this->ok('Sent', ['message' => $this->message($m->load('user'), $request->user())], 201);
    }

    // PATCH /chats/{conversation} {muted?, steward?}
    public function update(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        if (!$conversation->hasMember($user)) {
            return $this->fail('Chat not found', 404);
        }
        $data = $request->validate(['muted' => ['sometimes', 'boolean'], 'steward' => ['sometimes', 'boolean']]);
        if (array_key_exists('muted', $data)) {
            ChatService::make()->mute($user, $conversation->key(), (bool) $data['muted']);
        }
        if (array_key_exists('steward', $data)) {
            if (!$conversation->project_id) {
                return $this->fail('Link the group to a project for Steward to answer from its records.', 422);
            }
            $conversation->update(['steward' => (bool) $data['steward']]);
        }

        return $this->ok('Saved', ['chat' => $this->detail($conversation->refresh(), $user)]);
    }

    // POST /chats/{conversation}/members {user_ids[]} — groups only
    public function addMembers(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        if ($conversation->kind !== 'group' || !$conversation->hasMember($user)) {
            return $this->fail('Chat not found', 404);
        }
        $data = $request->validate(['user_ids' => ['required', 'array', 'min:1'], 'user_ids.*' => ['integer']]);
        $allowed = ChatService::make()->contacts($user)->pluck('id');
        foreach (collect($data['user_ids'])->map(fn ($id) => (int) $id)->intersect($allowed) as $id) {
            ConversationMember::updateOrCreate(['conversation_id' => $conversation->id, 'user_id' => $id], ['left_at' => null]);
            ConversationMessage::create(['conversation_id' => $conversation->id, 'kind' => 'system', 'body' => "{$user->first_name} added " . User::find($id)?->first_name]);
        }

        return $this->ok('Added', ['chat' => $this->detail($conversation->refresh(), $user)]);
    }

    // DELETE /chats/{conversation}/members/me — leave a group
    public function leave(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        if ($conversation->kind !== 'group' || !$conversation->hasMember($user)) {
            return $this->fail('Chat not found', 404);
        }
        ConversationMember::where('conversation_id', $conversation->id)->where('user_id', $user->id)->update(['left_at' => now()]);
        ConversationMessage::create(['conversation_id' => $conversation->id, 'kind' => 'system', 'body' => "{$user->first_name} left"]);

        return $this->ok('You left the chat');
    }

    // GET /projects/{project}/chat-info — CHT-05 for a project chat
    public function projectInfo(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        $chat = ChatService::make();
        if (!$chat->canChatIn($project, $user)) {
            return $this->fail('Project not found', 404);
        }
        $people = User::whereIn('id', $chat->projectPeople($project))->get()->map(fn (User $u) => $this->person($u, $project));
        $files = ProjectDocument::where('project_id', $project->id)->count() + $project->milestones()->withCount('evidence')->get()->sum('evidence_count');

        return $this->ok('Chat info', [
            'title' => $project->title,
            'kind' => 'project',
            'people' => $people->sortBy(fn ($p) => $p['id'] === $user->id ? 0 : 1)->values(),
            'files' => $files,
            'steward' => true,
            'muted' => $chat->muted($user, "project:{$project->id}"),
        ]);
    }

    // PATCH /projects/{project}/chat {muted}
    public function projectMute(Request $request, Project $project): JsonResponse
    {
        $user = $request->user();
        if (!ChatService::make()->canChatIn($project, $user)) {
            return $this->fail('Project not found', 404);
        }
        $data = $request->validate(['muted' => ['required', 'boolean']]);
        ChatService::make()->mute($user, "project:{$project->id}", (bool) $data['muted']);

        return $this->ok($data['muted'] ? 'Muted' : 'Unmuted');
    }

    private function person(User $u, ?Project $project): array
    {
        $vendor = VendorProfile::where('user_id', $u->id)->first();
        $role = $project?->roleOf($u);
        $label = match ($role) {
            'owner' => 'Owner',
            'co_owner' => 'Co-owner',
            'contributor' => 'Funder',
            'viewer' => 'Family',
            'vendor' => 'Vendor',
            'site_manager' => 'Vendor · site manager',
            'foreman' => 'Vendor · foreman',
            default => $vendor ? ($vendor->business_name . ' · vendor') : 'Family',
        };
        if ($project && in_array($u->id, \App\Services\ProjectApprovalService::make()->rulesFor($project)['approver_ids'], true)) {
            $label .= $role === 'owner' ? ' · approver' : ($role === 'contributor' ? ' · approver' : '');
        }

        return ['id' => $u->id, 'name' => $u->fullName(), 'first_name' => $u->first_name, 'label' => $label, 'vendor' => (bool) $vendor];
    }

    private function detail(Conversation $c, User $viewer): array
    {
        $c->loadMissing('members.user', 'project');
        $members = $c->members->whereNull('left_at')->filter(fn ($m) => $m->user);
        $other = $c->kind === 'direct' ? $members->firstWhere('user_id', '!=', $viewer->id)?->user : null;
        $vendor = $other ? VendorProfile::where('user_id', $other->id)->first() : null;

        return [
            'id' => $c->id,
            'kind' => $c->kind,
            'title' => $c->kind === 'direct' ? ($other?->fullName() ?? 'Chat') : $c->title,
            // CHT-04 "Adeyemi Builders · verified"
            'sub' => $c->kind === 'direct'
                ? ($vendor ? $vendor->business_name . ($vendor->verified ? ' · verified' : '') : 'Family')
                : $members->count() . ' people' . ($c->steward ? ' · Steward' : ''),
            'other' => $other ? ['id' => $other->id, 'name' => $other->fullName(), 'vendor_profile_id' => $vendor?->id] : null,
            'vendor' => (bool) $vendor,
            'project' => $c->project ? ['id' => $c->project->id, 'title' => $c->project->title] : null,
            'steward' => $c->steward,
            'muted' => ChatService::make()->muted($viewer, $c->key()),
            'people' => $members->map(fn ($m) => $this->person($m->user, $c->project))->values(),
        ];
    }

    private function message(ConversationMessage $m, User $viewer): array
    {
        return [
            'id' => $m->id,
            'kind' => $m->kind,
            'body' => $m->body,
            'payload' => $m->payload,
            'name' => $m->user?->first_name ?? ($m->kind === 'steward' ? 'Steward' : null),
            'initials' => $m->user ? strtoupper(mb_substr($m->user->first_name, 0, 1) . mb_substr($m->user->last_name ?? '', 0, 1)) : null,
            'mine' => $m->user_id === $viewer->id,
            'created_at' => $m->created_at?->toIso8601String(),
        ];
    }
}
