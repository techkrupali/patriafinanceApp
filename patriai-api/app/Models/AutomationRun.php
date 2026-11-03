<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** AUT-08 "Runs": Ran 14 Oct · Household was ₦28,400 · moved ₦50,000. Kept when the rule is deleted. */
class AutomationRun extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['automation_rule_id', 'user_id', 'rule_name', 'status', 'amount', 'note', 'reference'];

    protected function casts(): array
    {
        return ['amount' => 'integer'];
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(AutomationRule::class, 'automation_rule_id');
    }
}
