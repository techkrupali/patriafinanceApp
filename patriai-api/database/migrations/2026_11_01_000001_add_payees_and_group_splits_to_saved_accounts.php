<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Send money (SND-03, BEN-01…05): a saved account can be a Patriai user
 * ("Emeka Okafor · Family · Patriai · @emeka"), not only a bank account, and a
 * group pays its accounts evenly, by percent or by fixed amounts (BEN-04).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saved_accounts', function (Blueprint $table) {
            $table->foreignId('payee_user_id')->nullable()->after('organisation_id')->constrained('users')->nullOnDelete();
            $table->string('account_name', 120)->nullable()->change();
            $table->string('account_number', 10)->nullable()->change();
            $table->string('bank_code', 10)->nullable()->change();
            $table->string('bank_name', 80)->nullable()->change();
            $table->unique(['user_id', 'payee_user_id']);
        });
        Schema::table('saved_account_groups', function (Blueprint $table) {
            $table->string('split', 10)->default('even'); // even | percent | fixed
        });
        Schema::table('saved_account_group_items', function (Blueprint $table) {
            // percent (whole number) for "percent", kobo for "fixed"; unused for "even".
            $table->unsignedBigInteger('share')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('saved_account_group_items', fn (Blueprint $table) => $table->dropColumn('share'));
        Schema::table('saved_account_groups', fn (Blueprint $table) => $table->dropColumn('split'));
        Schema::table('saved_accounts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'payee_user_id']);
            $table->dropConstrainedForeignId('payee_user_id');
        });
    }
};
