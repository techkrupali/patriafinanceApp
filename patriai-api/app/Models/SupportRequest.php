<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportRequest extends Model
{
    public const STATUSES = ['pending', 'in_review', 'resolved', 'closed'];
    public const PRIORITIES = ['low', 'medium', 'high'];
    public const CATEGORIES = ['transfer', 'withdrawal', 'wallet', 'account', 'transaction', 'other'];

    protected $fillable = [
        'user_id',
        'subject',
        'category',
        'description',
        'reference',
        'status',
        'priority',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** ME-17: the chat on this request. */
    public function messages(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SupportMessage::class)->orderBy('id');
    }
}
