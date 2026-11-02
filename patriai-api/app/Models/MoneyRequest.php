<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** REQ-01…03: someone asked a person for money, into one of their wallets, by a date. */
class MoneyRequest extends Model
{
    protected $fillable = [
        'code', 'requester_id', 'wallet_id', 'payer_user_id', 'payer_name', 'payer_contact', 'amount', 'paid_amount',
        'note', 'due_on', 'status', 'decline_reason', 'split_key', 'split_title', 'split_total', 'split_place', 'split_method', 'reminded_at', 'paid_at',
    ];

    protected $attributes = ['paid_amount' => 0, 'status' => 'pending'];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'paid_amount' => 'integer',
            'split_total' => 'integer',
            'due_on' => 'date',
            'reminded_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'payer_user_id');
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    /**
     * "N3V8"-style code, easy to read aloud (no 0/O, 1/I), with letters and
     * digits so a bank narration's ordinary words never match one.
     */
    public static function newCode(): string
    {
        do {
            $code = collect(range(1, 4))->map(fn () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[random_int(0, 31)])->implode('');
        } while (!preg_match('/[A-Z]/', $code) || !preg_match('/\d/', $code) || static::where('code', $code)->exists());

        return $code;
    }

    public function left(): int
    {
        return max(0, $this->amount - $this->paid_amount);
    }

    public function link(): string
    {
        return rtrim((string) config('app.url'), '/') . '/r/' . $this->code;
    }

    public function payerName(): string
    {
        return $this->payer?->fullName() ?? $this->payer_name ?? 'them';
    }
}
