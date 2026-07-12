<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('id');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('phone')->unique()->nullable()->after('email');
            $table->timestamp('phone_verified_at')->nullable()->after('email_verified_at');
            $table->string('pin')->nullable()->comment('bcrypt transaction PIN');
            $table->string('avatar_url')->nullable();
            $table->unsignedSmallInteger('kyc_tier')->default(0);
            $table->string('role')->default('user')->index(); // user | admin
            $table->string('status')->default('active')->index(); // active | suspended
            $table->timestamp('last_login_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'first_name', 'last_name', 'phone', 'phone_verified_at', 'pin',
                'avatar_url', 'kyc_tier', 'role', 'status', 'last_login_at',
            ]);
        });
    }
};
