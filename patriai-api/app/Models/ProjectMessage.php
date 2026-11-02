<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A message in a project's chat between the family and the builder (PRJ-03
 * "Chat", CHT-03). kind: message | milestone (a submission card) | system |
 * steward (an answer from the project's records).
 */
class ProjectMessage extends Model
{
    protected $fillable = ['project_id', 'user_id', 'kind', 'body', 'payload'];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
