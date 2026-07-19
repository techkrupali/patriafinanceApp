<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Dispute extends Model
{
    /** Selectable dispute categories (Dispute Center). */
    public const CATEGORIES = [
        'transaction',
        'project',
        'vendor',
        'account',
        'other',
    ];

    protected $fillable = [
        'user_id',
        'subject',
        'category',
        'reference',
        'description',
        'status',
        'resolution',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
