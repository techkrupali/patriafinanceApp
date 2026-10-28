<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmergencyUnlockRequest extends Model
{
    /** dual_approval: keyholders agree (EMG-03) · document: death certificate · fast_release: EMG-04 */
    public const METHODS = ['dual_approval', 'document', 'fast_release'];

    public const DOCUMENT_TYPES = ['death_certificate', 'legal_notice'];

    protected $fillable = [
        'wallet_id',
        'requested_by',
        'method',
        'document_type',
        'document_path',
        'note',
        'amount',
        'reference',
        'status',
        'approved_by',
        'approvals',
        'required_approvals',
        'expires_at',
        'reviewed_by',
        'review_note',
        'decided_at',
    ];

    protected $hidden = ['document_path'];

    protected function casts(): array
    {
        return [
            'decided_at' => 'datetime',
            'expires_at' => 'datetime',
            'approvals' => 'array',
            'required_approvals' => 'integer',
            'amount' => 'integer',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
