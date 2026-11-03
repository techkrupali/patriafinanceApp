<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** AIS-06 one thing Steward did on its own. */
class StewardAction extends Model
{
    protected $fillable = ['user_id', 'kind', 'summary', 'amount', 'reference', 'meta', 'undone_at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'amount' => 'integer', 'undone_at' => 'datetime'];
    }
}
