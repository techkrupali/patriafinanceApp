<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * RUL-02…08 on scheduled payments: a name ("Tithe, split between our
 * churches"), "first Sunday of the month", an end date, "ask before each
 * payment" (who confirms, by noon or it's skipped), and "if there isn't
 * enough money" (warn N days before, remind the day before, then top up from
 * Main / pay what's there / skip / cancel this one).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scheduled_payments', function (Blueprint $table) {
            $table->string('name', 80)->nullable()->after('to_name');
            // 1–4, or 5 = last; with weekday 1 (Mon) – 7 (Sun).
            $table->unsignedTinyInteger('week_of_month')->nullable()->after('frequency');
            $table->unsignedTinyInteger('weekday')->nullable()->after('week_of_month');
            $table->date('ends_on')->nullable()->after('ends_after');
            // {"user_ids": [..], "mode": "any"|"all"}
            $table->json('confirm')->nullable()->after('ends_on');
            // {"check_days": 3, "remind_day_before": true, "on_day": "topup_main"|"pay_what_there"|"skip"|"cancel"}
            $table->json('short_policy')->nullable()->after('confirm');
            // The date being asked about / warned about, and who said yes for it.
            $table->timestamp('confirmed_for')->nullable()->after('short_policy');
            $table->json('confirmed_by')->nullable()->after('confirmed_for');
            $table->json('warned')->nullable()->after('confirmed_by');
        });
    }

    public function down(): void
    {
        Schema::table('scheduled_payments', function (Blueprint $table) {
            $table->dropColumn(['name', 'week_of_month', 'weekday', 'ends_on', 'confirm', 'short_policy', 'confirmed_for', 'confirmed_by', 'warned']);
        });
    }
};
