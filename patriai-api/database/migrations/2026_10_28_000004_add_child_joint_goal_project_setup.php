<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client prototype sheets "Wallets · Child, Emergency" and "Wallets · Joint,
 * Goal, Project":
 *  - a pledge can be a monthly amount or a one-off gift (GLW-03 "Aunty Ada ·
 *    one-off gift · ₦150,000")
 *  - rules that run every other week, at a set hour, out of a spending
 *    category (CHW-02 "₦3,000 every Monday at 7:00 am, paid from Household ·
 *    School runs and lunch")
 *  - milestones planned before the money is in, and part of each payment held
 *    back until some months after handover (PRW-03/06)
 * Wallet-level settings (child, joint, goal, project) live in wallets.meta and
 * projects.meta.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->string('pledge_kind', 10)->nullable()->after('pledge_amount'); // period | gift
        });

        Schema::table('automation_rules', function (Blueprint $table) {
            $table->unsignedTinyInteger('interval_weeks')->default(1)->after('day_of_week'); // 2 = every other week
            $table->unsignedTinyInteger('at_hour')->nullable()->after('day_of_month'); // Lagos hour it runs from
            $table->date('starts_on')->nullable()->after('at_hour'); // first run; anchors every-other-week
            $table->foreignId('budget_category_id')->nullable()->after('to_wallet_id')->constrained()->nullOnDelete();
        });

        Schema::table('milestones', function (Blueprint $table) {
            $table->bigInteger('retention')->default(0)->after('amount'); // kobo held back after release
            $table->timestamp('retention_due_at')->nullable()->after('released_at');
            $table->timestamp('retention_released_at')->nullable()->after('retention_due_at');
        });
    }

    public function down(): void
    {
        Schema::table('milestones', fn (Blueprint $table) => $table->dropColumn(['retention', 'retention_due_at', 'retention_released_at']));
        Schema::table('automation_rules', function (Blueprint $table) {
            $table->dropConstrainedForeignId('budget_category_id');
            $table->dropColumn(['interval_weeks', 'at_hour', 'starts_on']);
        });
        Schema::table('wallet_invitations', fn (Blueprint $table) => $table->dropColumn('pledge_kind'));
    }
};
