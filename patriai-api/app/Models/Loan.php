<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Loan extends Model
{
    /** Selectable loan categories (Patria Lending). */
    public const CATEGORIES = [
        'rent',
        'mortgage',
        'car',
        'school_fees',
        'family_emergency',
        'business',
        'feeding',
        'child_allowance',
        'short_term',
    ];

    /** Statuses that block a user from taking another loan (one open loan at a time). */
    public const OPEN_STATUSES = ['pending', 'approved', 'disbursed', 'active', 'defaulted'];

    /** Statuses where money is still owed. */
    public const OWED_STATUSES = ['active', 'defaulted'];

    protected $fillable = [
        'reference',
        'user_id',
        'category',
        'purpose',
        'principal',
        'interest_bps',
        'fee',
        'total_repayable',
        'outstanding',
        'penalty_accrued',
        'tenor_days',
        'repayment_frequency',
        'status',
        'disbursed_wallet_id',
        'disbursed_at',
        'due_at',
        'approved_by',
        'rejected_reason',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'principal' => 'integer',
            'fee' => 'integer',
            'total_repayable' => 'integer',
            'outstanding' => 'integer',
            'penalty_accrued' => 'integer',
            'interest_bps' => 'integer',
            'tenor_days' => 'integer',
            'disbursed_at' => 'datetime',
            'due_at' => 'datetime',
            'meta' => 'array',
        ];
    }

    public static function generateReference(): string
    {
        return 'LN' . now()->format('ymdHis') . strtoupper(Str::random(6));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function disbursedWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'disbursed_wallet_id');
    }

    public function repayments(): HasMany
    {
        return $this->hasMany(LoanRepayment::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Repayment progress as a percentage of the total repayable (0..100). */
    public function progressPct(): float
    {
        if ($this->total_repayable <= 0) {
            return 0.0;
        }

        $paid = $this->total_repayable - $this->outstanding;

        return round(max(0, min($paid, $this->total_repayable)) / $this->total_repayable * 100, 2);
    }
}
