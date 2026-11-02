<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** CHD-07/12: a task a parent set for a child, with its reward. */
class ChildTask extends Model
{
    protected $fillable = [
        'wallet_id', 'created_by', 'title', 'reward', 'due_on', 'repeat_weekly', 'needs_photo', 'coparent_can_approve',
        'status', 'photo_path', 'note', 'submitted_at', 'paid_by', 'paid_at', 'paid_reference',
    ];

    protected $attributes = ['status' => 'todo', 'repeat_weekly' => false, 'needs_photo' => false, 'coparent_can_approve' => true];

    protected function casts(): array
    {
        return [
            'reward' => 'integer',
            'due_on' => 'date',
            'repeat_weekly' => 'boolean',
            'needs_photo' => 'boolean',
            'coparent_can_approve' => 'boolean',
            'submitted_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
