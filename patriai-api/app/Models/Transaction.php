<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Transaction extends Model
{
    protected $fillable = [
        'reference',
        'wallet_id',
        'user_id',
        'type',
        'direction',
        'amount',
        'fee',
        'balance_after',
        'status',
        'description',
        'counterparty',
        'banking_reference',
        'session_id',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'fee' => 'integer',
            'balance_after' => 'integer',
            'counterparty' => 'array',
            'meta' => 'array',
        ];
    }

    public static function generateReference(): string
    {
        return 'PTR' . now()->format('ymdHis') . strtoupper(Str::random(6));
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
