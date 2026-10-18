<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** An unfinished wallet setup the user can resume ("pick up where they left off"). */
class WalletDraft extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'name',
        'step',
        'total_steps',
        'data',
    ];

    protected function casts(): array
    {
        return [
            'step' => 'integer',
            'total_steps' => 'integer',
            'data' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
