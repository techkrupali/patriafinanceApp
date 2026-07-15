<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallet_members', function (Blueprint $table) {
            $table->boolean('can_approve')->default(false)->after('role');
            $table->jsonb('permissions')->nullable()->after('can_approve');
        });
    }

    public function down(): void
    {
        Schema::table('wallet_members', function (Blueprint $table) {
            $table->dropColumn(['can_approve', 'permissions']);
        });
    }
};
