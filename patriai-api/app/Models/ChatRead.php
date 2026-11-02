<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Where someone has read up to in a chat, and whether they muted it (CHT-05). */
class ChatRead extends Model
{
    protected $fillable = ['user_id', 'chat_key', 'last_read_id', 'muted'];

    protected function casts(): array
    {
        return ['last_read_id' => 'integer', 'muted' => 'boolean'];
    }
}
