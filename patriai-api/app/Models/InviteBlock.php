<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** INV-03 "Block future invites from Ngozi": user_id won't be invited by blocked_user_id. */
class InviteBlock extends Model
{
    protected $fillable = ['user_id', 'blocked_user_id'];
}
