<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalResponse extends Model
{
    protected $fillable = [
        'approval_request_id',
        'approver_id',
        'decision',
        'note',
    ];

    public function approvalRequest(): BelongsTo
    {
        return $this->belongsTo(ApprovalRequest::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }
}
