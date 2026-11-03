<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * INV-CH3 "Link this phone to Kamsi?": a child's phone asked to link with the
 * code; a parent says yes on their own phone before the child sets a PIN.
 */
class ChildLinkRequest extends Model
{
    protected $fillable = ['wallet_id', 'device_name', 'secret_hash', 'status', 'decided_by', 'decided_at', 'expires_at'];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
