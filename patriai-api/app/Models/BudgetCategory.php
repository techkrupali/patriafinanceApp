<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** SPD-03: one part of a spending wallet's budget, with its own limit per period. */
class BudgetCategory extends Model
{
    protected $fillable = ['wallet_id', 'name', 'limit', 'position'];

    protected function casts(): array
    {
        return ['limit' => 'integer', 'position' => 'integer'];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
