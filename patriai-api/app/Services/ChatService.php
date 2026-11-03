<?php

namespace App\Services;

use App\Models\ChatRead;
use App\Models\Conversation;
use App\Models\ConversationMember;
use App\Models\ConversationMessage;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectMessage;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\VendorTeamMember;
use App\Models\WalletMember;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * CHT-01…05 Chats: every project's chat (with milestone cards and Steward),
 * direct chats with a builder or family, and groups — one inbox with unread
 * counts, mute, and who's in each chat.
 */
class ChatService
{
    public function __construct(private readonly NotificationService $notifications)
    {
    }

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    // ------------------------------------------------------------------ inbox

    /** Projects this person can chat in: the family, the builder, and the builder's team on it. */
    public function projects(User $user): Collection
    {
        $walletIds = WalletMember::where('user_id', $user->id)->where('status', 'active')->pluck('wallet_id');
        $profileIds = VendorTeamMember::where('user_id', $user->id)->where('status', 'active')->pluck('vendor_profile_id');
        $vendorIds = VendorProfile::whereIn('id', $profileIds)->pluck('user_id');

        return Project::with(['owner', 'vendor', 'wallet'])
            ->where(fn ($q) => $q->where('owner_id', $user->id)->orWhere('vendor_id', $user->id)->orWhereIn('wallet_id', $walletIds)->orWhereIn('vendor_id', $vendorIds))
            ->where('status', '!=', 'cancelled')
            ->get()
            ->filter(fn (Project $p) => $this->canChatIn($p, $user))
            ->values();
    }

    public function canChatIn(Project $project, User $user): bool
    {
        $role = $project->roleOf($user);
        if ($role === null || $role === 'accounts') {
            return false;
        }

        return ($project->wallet?->members()->where('user_id', $user->id)->first()?->permissions['chat'] ?? true) !== false;
    }

    /**
     * CHT-01 "All · Projects · Vendors · Family": each chat's last line, time and unread count.
     *
     * @return list<array<string, mixed>>
     */
    public function inbox(User $user, string $filter = 'all'): array
    {
        $reads = ChatRead::where('user_id', $user->id)->get()->keyBy('chat_key');
        $rows = collect();

        foreach ($this->projects($user) as $p) {
            $key = "project:{$p->id}";
            $last = ProjectMessage::with('user')->where('project_id', $p->id)->latest('id')->first();
            $rows->push([
                'type' => 'project',
                'id' => $p->id,
                'title' => $p->title,
                'tag' => 'projects',
                'initials' => null,
                'last' => $last ? $this->lastLine($last->user, $last->body, $last->kind, $user) : 'Say hello to everyone on the project',
                'at' => ($last?->created_at ?? $p->created_at)?->toIso8601String(),
                'unread' => $last ? ProjectMessage::where('project_id', $p->id)->where('id', '>', $reads->get($key)?->last_read_id ?? 0)->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))->count() : 0,
                'muted' => (bool) $reads->get($key)?->muted,
            ]);
        }

        $conversations = Conversation::with(['members.user', 'project'])
            ->whereHas('members', fn ($q) => $q->where('user_id', $user->id)->whereNull('left_at'))->get();
        foreach ($conversations as $c) {
            $last = $c->messages()->with('user')->latest('id')->first();
            $other = $c->kind === 'direct' ? $c->members->firstWhere('user_id', '!=', $user->id)?->user : null;
            $vendor = $other ? VendorProfile::where('user_id', $other->id)->first() : null;
            $rows->push([
                'type' => 'conversation',
                'id' => $c->id,
                'title' => $c->kind === 'direct' ? ($other?->fullName() ?? 'Chat') : ($c->title ?? 'Group'),
                'tag' => $c->kind === 'direct' ? ($vendor ? 'vendors' : 'family') : ($c->project_id ? 'projects' : 'family'),
                'initials' => $c->kind === 'direct' && $other ? $this->initials($other->fullName()) : null,
                'last' => $last ? $this->lastLine($last->user, $last->body, $last->kind, $user, $last->payload) : 'No messages yet',
                'at' => ($last?->created_at ?? $c->created_at)?->toIso8601String(),
                'unread' => $c->messages()->where('id', '>', $reads->get($c->key())?->last_read_id ?? 0)->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))->count(),
                'muted' => (bool) $reads->get($c->key())?->muted,
            ]);
        }

        return $rows
            ->filter(fn ($r) => $filter === 'all' || $r['tag'] === $filter)
            ->sortByDesc('at')->values()->all();
    }

    /** "Samuel: Tiling done, photos uploaded" */
    private function lastLine(?User $by, ?string $body, string $kind, User $viewer, ?array $payload = null): string
    {
        $text = match ($kind) {
            'proposal' => 'Sent a proposal: ' . ($payload['title'] ?? 'a project'),
            default => (string) $body,
        };
        $who = $by ? ($by->id === $viewer->id ? 'You' : $by->first_name) : ($kind === 'steward' ? 'Steward' : null);

        return Str::limit($who ? "{$who}: {$text}" : $text, 80);
    }

    private function initials(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name)))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->join('');
    }

    // --------------------------------------------------------- conversations

    /** CHT-04: the one direct chat between two people. */
    public function direct(User $me, User $other): Conversation
    {
        if ($me->id === $other->id) {
            throw ValidationException::withMessages(['user_id' => "You can't start a chat with yourself."]);
        }
        $existing = Conversation::where('kind', 'direct')
            ->whereHas('members', fn ($q) => $q->where('user_id', $me->id))
            ->whereHas('members', fn ($q) => $q->where('user_id', $other->id))
            ->first();
        if ($existing) {
            ConversationMember::where('conversation_id', $existing->id)->where('user_id', $me->id)->update(['left_at' => null]);

            return $existing;
        }

        return DB::transaction(function () use ($me, $other) {
            $c = Conversation::create(['kind' => 'direct', 'created_by' => $me->id]);
            foreach ([$me, $other] as $u) {
                ConversationMember::create(['conversation_id' => $c->id, 'user_id' => $u->id]);
            }

            return $c;
        });
    }

    /** CHT-02 "Create group": a name, people, maybe a project, and Steward. */
    public function group(User $me, string $title, array $userIds, ?Project $project, bool $steward): Conversation
    {
        $allowed = $this->contacts($me)->pluck('id');
        $ids = collect($userIds)->map(fn ($id) => (int) $id)->unique()->reject(fn ($id) => $id === $me->id);
        if ($ids->isEmpty() || $ids->diff($allowed)->isNotEmpty()) {
            throw ValidationException::withMessages(['member_ids' => 'Add people from your family or your projects.']);
        }
        if ($project && !$project->isAccessibleBy($me)) {
            throw ValidationException::withMessages(['project_id' => 'Pick one of your projects.']);
        }

        return DB::transaction(function () use ($me, $title, $ids, $project, $steward) {
            $c = Conversation::create(['kind' => 'group', 'title' => $title, 'project_id' => $project?->id, 'created_by' => $me->id, 'steward' => $steward && $project !== null]);
            foreach ($ids->push($me->id) as $id) {
                ConversationMember::create(['conversation_id' => $c->id, 'user_id' => $id]);
            }
            ConversationMessage::create(['conversation_id' => $c->id, 'kind' => 'system', 'body' => "{$me->first_name} made the group \"{$title}\""]);

            return $c;
        });
    }

    /**
     * CHT-02 "Add people": family (anyone you share a wallet with) and the people
     * on your projects, both sides.
     *
     * @return Collection<int, array{id: int, name: string, first_name: string, label: string, side: string}>
     */
    public function contacts(User $me): Collection
    {
        $people = collect();
        $walletIds = WalletMember::where('user_id', $me->id)->where('status', 'active')->pluck('wallet_id');
        $family = User::whereIn('id', WalletMember::whereIn('wallet_id', $walletIds)->where('status', 'active')->where('user_id', '!=', $me->id)->pluck('user_id'))
            ->where('role', '!=', 'child')->get();
        foreach ($family as $u) {
            $people->put($u->id, ['id' => $u->id, 'name' => $u->fullName(), 'first_name' => $u->first_name, 'label' => 'Family', 'side' => 'family']);
        }
        foreach ($this->projects($me) as $p) {
            $profile = $p->vendor_id ? VendorProfile::where('user_id', $p->vendor_id)->first() : null;
            if ($p->vendor && $p->vendor_id !== $me->id) {
                $people->put($p->vendor->id, ['id' => $p->vendor->id, 'name' => $p->vendor->fullName(), 'first_name' => $p->vendor->first_name, 'label' => ($profile?->business_name ?? 'Builder') . ' · vendor', 'side' => 'vendor']);
            }
            if ($profile) {
                VendorTeamMember::with('user')->where('vendor_profile_id', $profile->id)->where('status', 'active')->get()
                    ->filter(fn (VendorTeamMember $m) => $m->user && $m->user_id !== $me->id && $m->covers($p->id))
                    ->each(fn (VendorTeamMember $m) => $people->put($m->user->id, ['id' => $m->user->id, 'name' => $m->user->fullName(), 'first_name' => $m->user->first_name, 'label' => $profile->business_name . ' · ' . str_replace('_', ' ', $m->role), 'side' => 'vendor']));
            }
            if ($p->owner && $p->owner_id !== $me->id && !$people->has($p->owner_id)) {
                $people->put($p->owner->id, ['id' => $p->owner->id, 'name' => $p->owner->fullName(), 'first_name' => $p->owner->first_name, 'label' => "{$p->title} · owner", 'side' => 'family']);
            }
        }

        return $people->values();
    }

    public function send(Conversation $c, User $me, string $body): ConversationMessage
    {
        if (!$c->hasMember($me)) {
            throw ValidationException::withMessages(['conversation' => 'You are not in this chat.']);
        }
        $message = ConversationMessage::create(['conversation_id' => $c->id, 'user_id' => $me->id, 'kind' => 'message', 'body' => trim($body)]);
        $c->update(['last_message_at' => now()]);
        $this->read($me, $c->key(), $message->id);
        $this->tell($c->members()->whereNull('left_at')->pluck('user_id'), $me, $c->key(), $c->kind === 'direct' ? $me->fullName() : "{$me->first_name} in {$c->title}", $message->body, ['conversation_id' => $c->id]);

        // CHT-02 "Steward can answer questions here" — in a group linked to a project.
        if ($c->steward && $c->project && ($this->asksSteward($body) || $this->vendorAsks($c->project, $me, $body))) {
            ConversationMessage::create(['conversation_id' => $c->id, 'kind' => 'steward', 'body' => ChatStewardService::make()->answer($c->project, $body)]);
        }

        return $message;
    }

    /** VPJ-04 a proposal card in the builder's direct chat with the family. */
    public function proposalCard(User $vendor, User $family, array $payload, string $body): void
    {
        $c = $this->direct($vendor, $family);
        ConversationMessage::create(['conversation_id' => $c->id, 'user_id' => $vendor->id, 'kind' => 'proposal', 'body' => $body, 'payload' => $payload]);
        $c->update(['last_message_at' => now()]);
    }

    // --------------------------------------------------------- project chat

    /** CHT-03: a person's message in the project chat, and Steward if asked. */
    public function sendToProject(Project $project, User $me, string $body): ProjectMessage
    {
        if (!$this->canChatIn($project, $me)) {
            throw ValidationException::withMessages(['project' => 'This chat is not open to you.']);
        }
        $message = ProjectMessage::create(['project_id' => $project->id, 'user_id' => $me->id, 'kind' => 'message', 'body' => trim($body)]);
        $this->read($me, "project:{$project->id}", $message->id);
        $this->tell($this->projectPeople($project), $me, "project:{$project->id}", "{$me->first_name} on {$project->title}", $message->body, ['project_id' => $project->id]);
        if ($this->asksSteward($body) || $this->vendorAsks($project, $me, $body)) {
            ProjectMessage::create(['project_id' => $project->id, 'kind' => 'steward', 'body' => ChatStewardService::make()->answer($project, $body)]);
        }

        return $message;
    }

    /**
     * Something happened on the project: a milestone was submitted (a card with
     * its photos), approved or paid. Never breaks the money flow that calls it.
     */
    public function projectEvent(Project $project, ?User $by, string $kind, string $body, array $payload = []): void
    {
        try {
            ProjectMessage::create(['project_id' => $project->id, 'user_id' => $by?->id, 'kind' => $kind, 'body' => $body, 'payload' => $payload ?: null]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** CHT-03 "MILESTONE SUBMITTED · 1 of 2" — the card posted when the builder submits. */
    public function milestoneCard(Milestone $m, User $by): void
    {
        $photos = $m->evidence()->whereIn('kind', ['image', 'video'])->get();
        $this->projectEvent($m->project, $by, 'milestone', $m->proof && $m->proof !== 'Submitted for review' ? $m->proof : "{$m->title} is done. Added {$photos->count()} " . ($photos->count() === 1 ? 'photo' : 'photos') . ' for the family to check.', [
            'milestone_id' => $m->id,
            'title' => $m->title,
            'amount' => number_format($m->amount / 100, 2, '.', ''),
            'photos' => $photos->take(2)->map(fn ($e) => ['url' => $e->url, 'caption' => $e->caption, 'video' => $e->kind === 'video'])->values()->all(),
            'more' => max(0, $photos->count() - 2),
        ]);
    }

    /** Who hears about a project chat message: the family side (not viewers who muted) and the builder's side. */
    public function projectPeople(Project $project): Collection
    {
        $ids = collect([$project->owner_id, $project->vendor_id])
            ->merge($project->wallet?->members()->where('status', 'active')->pluck('user_id') ?? []);
        $profile = $project->vendor_id ? VendorProfile::where('user_id', $project->vendor_id)->first() : null;
        if ($profile) {
            $ids = $ids->merge(VendorTeamMember::where('vendor_profile_id', $profile->id)->where('status', 'active')->get()->filter(fn ($m) => $m->user_id && $m->covers($project->id))->pluck('user_id'));
        }

        return $ids->filter()->unique()->values();
    }

    // ----------------------------------------------------------------- shared

    public function read(User $user, string $key, int $lastId): void
    {
        $row = ChatRead::firstOrCreate(['user_id' => $user->id, 'chat_key' => $key]);
        if ($lastId > $row->last_read_id) {
            $row->update(['last_read_id' => $lastId]);
        }
    }

    public function mute(User $user, string $key, bool $muted): void
    {
        ChatRead::updateOrCreate(['user_id' => $user->id, 'chat_key' => $key], ['muted' => $muted]);
    }

    public function muted(User $user, string $key): bool
    {
        return (bool) ChatRead::where('user_id', $user->id)->where('chat_key', $key)->value('muted');
    }

    /** "@Steward", "Steward, …" */
    /**
     * RUL-09 "A vendor asks in chat → answer the vendor from project records":
     * the family turned it on, and the builder asked a question.
     */
    private function vendorAsks(Project $project, User $me, string $body): bool
    {
        $owner = $project->owner;
        if (!str_contains($body, '?') || !$owner || $me->id === $owner->id) {
            return false;
        }
        $isVendor = $project->vendor_id === $me->id;
        if (!$isVendor || !StewardSettingsService::make()->settings($owner)['answer_vendors']) {
            return false;
        }
        StewardSettingsService::make()->log($owner, 'answer', "Answered {$me->first_name} in {$project->title}", null, null, ['project_id' => $project->id]);

        return true;
    }

    private function asksSteward(string $body): bool
    {
        return (bool) preg_match('/\bsteward\b/i', $body);
    }

    private function tell(Collection $ids, User $from, string $key, string $title, string $body, array $data): void
    {
        $muted = ChatRead::where('chat_key', $key)->where('muted', true)->pluck('user_id');
        $type = str_starts_with($key, 'project:') ? 'project_message' : 'chat_message';
        foreach (User::whereIn('id', $ids->reject(fn ($id) => $id === $from->id)->diff($muted))->get() as $to) {
            $this->notifications->push($to, $type, $title, Str::limit($body, 140), $data);
        }
    }
}
