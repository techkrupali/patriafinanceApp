<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A single milestone within a Project. Its amount is a reservation against the
 * project's escrow wallet. Lifecycle: proposed (VDM-09, added by the builder,
 * waiting for the family) | planned (PRW-03, set up before the money is in;
 * reserved once the builder submits) | funded -> submitted -> approved/released
 * (money moves to the vendor, less any retention held until after handover) |
 * rejected (back to funded for revision) | cancelled (a dispute refunded it).
 */
class Milestone extends Model
{
    protected $fillable = [
        'project_id',
        'sequence',
        'title',
        'description',
        'deliverables',
        'proof_needed',
        'change_request',
        'origin',
        'amount',
        'retention',
        'due_date',
        'status',
        'proof',
        'submitted_at',
        'submitted_by',
        'released_at',
        'retention_due_at',
        'retention_released_at',
        'released_transaction_reference',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'retention' => 'integer',
            'due_date' => 'date',
            'submitted_at' => 'datetime',
            'released_at' => 'datetime',
            'retention_due_at' => 'datetime',
            'retention_released_at' => 'datetime',
            'meta' => 'array',
            'deliverables' => 'array',
            'change_request' => 'array',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(MilestoneEvidence::class)->latest();
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function disputes(): HasMany
    {
        return $this->hasMany(Dispute::class);
    }

    /** DSP-02 "Opening a dispute puts the milestone payment on hold until it is sorted." */
    public function activeDispute(): ?Dispute
    {
        return $this->disputes()->whereIn('status', ['open', 'responded', 'fixing', 'escalated', 'under_review'])->latest('id')->first();
    }
}
