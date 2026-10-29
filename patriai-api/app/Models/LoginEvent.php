<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ME-10: one sign-in, allowed or blocked. */
class LoginEvent extends Model
{
    protected $fillable = ['user_id', 'device_id', 'device_name', 'platform', 'ip', 'status', 'reason', 'new_device'];

    protected function casts(): array
    {
        return ['new_device' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
