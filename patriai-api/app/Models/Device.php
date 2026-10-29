<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Device extends Model
{
    protected $fillable = [
        'user_id',
        'device_id',
        'device_name',
        'platform',
        'push_token',
        'last_active_at',
        'ip',
    ];

    protected $hidden = ['secret_hash'];

    protected function casts(): array
    {
        return [
            'last_active_at' => 'datetime',
            'trusted_at' => 'datetime',
            'send_after' => 'datetime',
        ];
    }

    /** ACC-06: a new device can receive money at once but sends only after 24 hours. */
    public function canSend(): bool
    {
        return $this->send_after === null || !$this->send_after->isFuture();
    }

    /** The name its sessions are created under, so logging it out ends exactly its sessions. */
    public function tokenName(): string
    {
        return 'device:' . $this->device_id;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
