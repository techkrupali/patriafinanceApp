<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A church, mosque, charity or school Patriai has checked (GIV-02 "Verified means
 * Patriai has confirmed the organisation and its accounts"). Admins add them;
 * people pick them as giving recipients or as the charity an early-break fee
 * helps (BRK-02).
 */
class Organisation extends Model
{
    public const KINDS = ['church', 'mosque', 'charity', 'school', 'other'];

    /** BRK-02 charity causes. */
    public const CAUSES = ['children', 'food', 'education', 'health', 'elderly', 'faith'];

    protected $fillable = ['name', 'kind', 'cause', 'area', 'state', 'about', 'account_name', 'account_number', 'bank_code', 'bank_name', 'verified', 'active'];

    protected function casts(): array
    {
        return ['verified' => 'boolean', 'active' => 'boolean'];
    }

    public function savedAccounts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SavedAccount::class);
    }
}
