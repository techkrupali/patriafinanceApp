<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalRequest extends Model
{
    protected $fillable = [
        'wallet_id',
        'initiator_id',
        'action',
        'amount',
        'fee',
        'description',
        'payload',
        'required_approvals',
        'approvals_count',
        'status',
        'executed_transaction_reference',
        'fail_reason',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'fee' => 'integer',
            'payload' => 'array',
            'required_approvals' => 'integer',
            'approvals_count' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(ApprovalResponse::class);
    }
}
