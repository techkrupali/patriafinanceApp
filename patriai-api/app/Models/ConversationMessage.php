<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** kind: message | proposal (VPJ card) | system | steward. */
class ConversationMessage extends Model
{
    protected $fillable = ['conversation_id', 'user_id', 'kind', 'body', 'payload'];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
