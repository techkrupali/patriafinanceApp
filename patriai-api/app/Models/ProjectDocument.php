<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** PRJ-09 the contract, bill of quantities or another paper kept with a project. */
class ProjectDocument extends Model
{
    public const KINDS = ['contract', 'boq', 'other'];

    protected $fillable = ['project_id', 'user_id', 'kind', 'name', 'url'];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
