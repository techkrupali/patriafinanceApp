<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** GIV-02: who a giving wallet gives to — one saved account or a group. */
class GivingRecipient extends Model
{
    protected $fillable = ['wallet_id', 'saved_account_id', 'group_id', 'position'];

    public function savedAccount(): BelongsTo
    {
        return $this->belongsTo(SavedAccount::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(SavedAccountGroup::class, 'group_id');
    }
}
