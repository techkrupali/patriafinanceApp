<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** ADD-06 a cash agent: where they are, when they're open, cash in and/or out. Kept in admin. */
class Agent extends Model
{
    protected $fillable = ['name', 'address', 'area', 'city', 'state', 'lat', 'lng', 'hours', 'phone', 'cash_in', 'cash_out', 'active'];

    protected function casts(): array
    {
        return ['lat' => 'float', 'lng' => 'float', 'cash_in' => 'boolean', 'cash_out' => 'boolean', 'active' => 'boolean'];
    }
}
