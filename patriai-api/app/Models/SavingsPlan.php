<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavingsPlan extends Model
{
    public const FREQUENCIES = ['daily', 'weekly', 'monthly'];

    /** SAV-06: try again in 3 days, save what's there (keeping ₦5,000), or skip. */
    public const MISSED_POLICIES = ['retry', 'partial', 'skip'];

    /** Round-up steps offered (kobo): ₦100, ₦500, ₦1,000. */
    public const ROUNDUP_STEPS = [10_000, 50_000, 100_000];

    protected $fillable = [
        'wallet_id',
        'schedule',
        'salary_percent',
        'roundup_to',
        'missed_policy',
        'notify_others_on_miss',
        'amount',
        'frequency',
        'day_of_week',
        'day_of_month',
        'auto_save',
        'allow_contributor_edit',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'day_of_week' => 'integer',
            'day_of_month' => 'integer',
            'auto_save' => 'boolean',
            'allow_contributor_edit' => 'boolean',
            'schedule' => 'boolean',
            'salary_percent' => 'integer',
            'roundup_to' => 'integer',
            'notify_others_on_miss' => 'boolean',
        ];
    }

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }
}
