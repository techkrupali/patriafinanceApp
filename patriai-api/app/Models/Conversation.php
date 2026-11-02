<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** CHT-02/04 a direct chat (two people) or a group, maybe linked to a project. */
class Conversation extends Model
{
    protected $fillable = ['kind', 'title', 'project_id', 'created_by', 'steward', 'last_message_at'];

    protected function casts(): array
    {
        return ['steward' => 'boolean', 'last_message_at' => 'datetime'];
    }

    public function members(): HasMany
    {
        return $this->hasMany(ConversationMember::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(ConversationMessage::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function hasMember(User $user): bool
    {
        return $this->members()->where('user_id', $user->id)->whereNull('left_at')->exists();
    }

    public function key(): string
    {
        return "conversation:{$this->id}";
    }
}
