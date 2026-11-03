<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** FAM-08: someone's role in a circle and what they may do across it. */
class CircleMember extends Model
{
    /** Approve payments · Send from shared wallets · Invite and remove people · Change rules and limits · See all balances. */
    public const PERMISSIONS = ['approve', 'send', 'invite', 'rules', 'balances'];

    /** What each role starts with. */
    public const DEFAULTS = [
        'co_owner' => ['approve' => true, 'send' => true, 'invite' => true, 'rules' => true, 'balances' => false],
        'admin' => ['approve' => true, 'send' => false, 'invite' => true, 'rules' => false, 'balances' => false],
        'contributor' => ['approve' => false, 'send' => false, 'invite' => false, 'rules' => false, 'balances' => false],
    ];

    protected $fillable = ['circle_id', 'user_id', 'role', 'permissions'];

    protected function casts(): array
    {
        return ['permissions' => 'array'];
    }

    public function circle(): BelongsTo
    {
        return $this->belongsTo(Circle::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, bool> */
    public function perms(): array
    {
        $base = self::DEFAULTS[$this->role] ?? self::DEFAULTS['contributor'];

        return array_map('boolval', array_merge($base, array_intersect_key($this->permissions ?? [], $base)));
    }
}
