<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single milestone within a Project. Its amount is a reservation against the
 * project's escrow wallet. Lifecycle: funded -> submitted -> approved/released
 * (money moves to the vendor) | rejected (back to funded for revision).
 */
class Milestone extends Model
{
    protected $fillable = [
        'project_id',
        'sequence',
        'title',
        'description',
        'amount',
        'status',
        'proof',
        'submitted_at',
        'released_at',
        'released_transaction_reference',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'submitted_at' => 'datetime',
            'released_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
