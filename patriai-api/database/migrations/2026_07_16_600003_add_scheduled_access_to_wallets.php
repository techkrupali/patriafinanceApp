<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            // Weekly spend-allowed window, e.g.
            // {"days":[1,2,3,4,5],"start":"08:00","end":"20:00","tz":"Africa/Lagos"}.
            // Null = no schedule (always spendable). Freeze uses the existing 'status'.
            $table->jsonb('access_schedule')->nullable()->after('meta');
        });
    }

    public function down(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropColumn('access_schedule');
        });
    }
};
