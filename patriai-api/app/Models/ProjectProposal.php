<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** VPJ-01…06 a builder's quote to a family: lines, phases by percent, and terms. */
class ProjectProposal extends Model
{
    public const KINDS = ['building', 'extension', 'renovation', 'event', 'other'];

    protected $fillable = [
        'vendor_id', 'family_user_id', 'invite_phone', 'title', 'kind', 'location', 'lines', 'total', 'scope',
        'documents', 'phases', 'terms', 'status', 'family_note', 'project_id', 'sent_at', 'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'lines' => 'array',
            'documents' => 'array',
            'phases' => 'array',
            'terms' => 'array',
            'total' => 'integer',
            'sent_at' => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendor_id');
    }

    public function family(): BelongsTo
    {
        return $this->belongsTo(User::class, 'family_user_id');
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
