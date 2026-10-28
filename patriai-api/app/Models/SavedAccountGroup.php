<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** A named set of saved accounts paid together ("Our churches": split 50/50). */
class SavedAccountGroup extends Model
{
    protected $fillable = ['user_id', 'name'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function accounts(): BelongsToMany
    {
        return $this->belongsToMany(SavedAccount::class, 'saved_account_group_items', 'group_id', 'saved_account_id')->orderBy('saved_accounts.id');
    }
}
