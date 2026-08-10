<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends ApiController
{
    /**
     * GET /users/search?q=  — find registered users to invite by @username
     * (or name / exact email). Returns a slim, public-safe shape. Excludes self
     * and non-active accounts. Case-insensitive; works on Postgres and SQLite.
     */
    public function search(Request $request): JsonResponse
    {
        $q = strtolower(ltrim(trim((string) $request->query('q', '')), '@'));

        if (strlen($q) < 2) {
            return $this->ok('Users', ['users' => []]);
        }

        $users = User::where('id', '!=', $request->user()->id)
            ->where('status', 'active')
            ->where(function ($w) use ($q) {
                $w->whereRaw('lower(username) like ?', ["%{$q}%"])
                    ->orWhereRaw('lower(name) like ?', ["%{$q}%"])
                    ->orWhereRaw('lower(email) = ?', [$q]);
            })
            ->orderByRaw('lower(username) = ? desc', [$q]) // exact handle first
            ->limit(10)
            ->get();

        return $this->ok('Users', [
            'users' => $users->map(fn (User $u) => [
                'id' => $u->id,
                'full_name' => $u->fullName(),
                'username' => $u->username,
                'avatar_url' => $u->avatar_url,
            ])->values(),
        ]);
    }
}
