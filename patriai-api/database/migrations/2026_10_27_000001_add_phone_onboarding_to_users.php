<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phone-first onboarding from the client prototype (ONB-01…12, 2026-10-27):
 * sign-up is phone + code + a 6-digit PIN with no password, and it records the
 * date of birth, the app language and "what brings you to Patriai".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Phone sign-ups log in with phone + PIN and never set a password.
            $table->string('password')->nullable()->change();
            // Older accounts keep their 4-digit PIN until they change it.
            $table->unsignedTinyInteger('pin_length')->default(4)->after('pin');
            $table->date('date_of_birth')->nullable()->after('last_name');
            $table->string('language', 5)->default('en');
            $table->json('onboarding_purposes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pin_length', 'date_of_birth', 'language', 'onboarding_purposes']);
        });
    }
};
