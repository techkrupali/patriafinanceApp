<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ME-17: one message in a support conversation, from the person or from support. */
class SupportMessage extends Model
{
    protected $fillable = ['support_request_id', 'sender_id', 'from', 'body', 'reference'];

    public function request(): BelongsTo
    {
        return $this->belongsTo(SupportRequest::class, 'support_request_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
