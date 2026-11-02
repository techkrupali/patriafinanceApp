<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One person in an ajo circle, with their turn (position) once the order is set. */
class AjoMember extends Model
{
    protected $fillable = ['circle_id', 'user_id', 'position', 'status', 'auto_pay', 'source_wallet_id', 'missed', 'replaced_by_invitation_id'];

    protected function casts(): array
    {
        return ['auto_pay' => 'boolean', 'position' => 'integer', 'missed' => 'integer'];
    }

    public function circle(): BelongsTo
    {
        return $this->belongsTo(AjoCircle::class, 'circle_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sourceWallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class, 'source_wallet_id');
    }

    public function contributions(): HasMany
    {
        return $this->hasMany(AjoContribution::class, 'member_id');
    }

    /** "Funke A.": first name and the initial of the last. */
    public function shortName(): string
    {
        $u = $this->user;

        return $u ? trim($u->first_name . ' ' . ($u->last_name ? mb_substr($u->last_name, 0, 1) . '.' : '')) : 'A member';
    }
}
