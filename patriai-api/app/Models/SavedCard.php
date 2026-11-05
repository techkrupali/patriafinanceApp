<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** ADD-03 "Saved cards · Verve •••• 2231": the payment partner's token for a card, never its number. */
class SavedCard extends Model
{
    protected $fillable = ['user_id', 'provider', 'authorization_code', 'signature', 'brand', 'last4', 'exp_month', 'exp_year', 'bank'];

    protected $hidden = ['authorization_code', 'signature'];

    protected function casts(): array
    {
        return ['authorization_code' => 'encrypted', 'exp_month' => 'integer', 'exp_year' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** "Verve •••• 2231" */
    public function label(): string
    {
        return "{$this->brand} •••• {$this->last4}";
    }

    /** "08/28" */
    public function expiry(): ?string
    {
        return $this->exp_month && $this->exp_year ? sprintf('%02d/%02d', $this->exp_month, $this->exp_year % 100) : null;
    }
}
