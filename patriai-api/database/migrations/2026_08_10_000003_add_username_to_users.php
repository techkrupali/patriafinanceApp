<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every user gets a unique @username (Instagram-style handle). Column is added
 * nullable+unique, then existing users are backfilled with a name-derived,
 * deduped handle. New users get one at registration (User::ensureUsername).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->nullable()->unique()->after('name');
        });

        $taken = [];
        foreach (DB::table('users')->select('id', 'first_name', 'last_name', 'name')->get() as $u) {
            $base = $this->base(trim(($u->first_name ?? '') . ($u->last_name ?? '')) ?: ($u->name ?? ''));
            $candidate = $base;
            $n = 1;
            while (in_array($candidate, $taken, true) || DB::table('users')->where('username', $candidate)->exists()) {
                $candidate = $base . $n;
                $n++;
            }
            $taken[] = $candidate;
            DB::table('users')->where('id', $u->id)->update(['username' => $candidate]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('username');
        });
    }

    private function base(string $name): string
    {
        $base = substr(preg_replace('/[^a-z0-9]/', '', strtolower($name)), 0, 20);
        return strlen($base) >= 3 ? $base : 'user';
    }
};
