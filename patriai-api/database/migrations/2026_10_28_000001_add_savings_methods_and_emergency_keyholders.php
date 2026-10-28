<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client prototype sheets "Savings wallet" (SAV-01…06) and "Emergency wallet"
 * (EMG-01…05):
 *  - savings come in as a share of every salary, round-ups on spending, a fixed
 *    amount on a schedule, or by hand; a missed save retries, saves what's there,
 *    or skips
 *  - an emergency fund has contributors with their own monthly amounts, M-of-N
 *    keyholders who release it, requests that expire, and fast release with proof
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('automation_rules', function (Blueprint $table) {
            // schedule (calendar) | salary (share of a bank deposit into Main) | roundup
            $table->string('trigger', 10)->default('schedule')->after('savings_contribution');
            $table->unsignedTinyInteger('percent')->nullable()->after('amount'); // salary share
            $table->bigInteger('roundup_to')->nullable()->after('percent'); // kobo step
            $table->bigInteger('pending_amount')->default(0)->after('roundup_to'); // round-ups not yet moved
            $table->unsignedTinyInteger('retry_count')->default(0)->after('last_run_at');
            $table->timestamp('retry_at')->nullable()->after('retry_count');
        });

        Schema::table('savings_plans', function (Blueprint $table) {
            $table->boolean('schedule')->default(true)->after('wallet_id'); // fixed amount on a schedule
            $table->unsignedTinyInteger('salary_percent')->nullable()->after('day_of_month');
            $table->bigInteger('roundup_to')->nullable()->after('salary_percent'); // kobo
            $table->string('missed_policy', 10)->default('skip')->after('allow_contributor_edit'); // retry | partial | skip
            $table->boolean('notify_others_on_miss')->default(false)->after('missed_policy');
        });

        Schema::table('emergency_settings', function (Blueprint $table) {
            $table->jsonb('purposes')->nullable()->after('purpose');
            // Other keyholders besides the owner; null on rules made before keyholders.
            $table->jsonb('keyholder_ids')->nullable()->after('approver_user_id');
            $table->unsignedTinyInteger('required_keyholders')->nullable()->after('keyholder_ids');
            $table->unsignedSmallInteger('request_expiry_hours')->nullable()->after('required_keyholders');
            $table->bigInteger('fast_release_limit')->nullable()->after('request_expiry_hours'); // kobo
            $table->unsignedSmallInteger('fast_release_every_days')->default(30)->after('fast_release_limit');
        });

        Schema::table('emergency_unlock_requests', function (Blueprint $table) {
            $table->jsonb('approvals')->nullable()->after('approved_by'); // user ids who said yes
            $table->unsignedTinyInteger('required_approvals')->nullable()->after('approvals');
            $table->bigInteger('amount')->nullable()->after('note'); // fast release
            $table->string('reference', 40)->nullable()->after('amount');
            $table->timestamp('expires_at')->nullable()->after('decided_at');
        });

        Schema::table('wallet_invitations', function (Blueprint $table) {
            // What the person was asked to put in each month (emergency contributors).
            $table->bigInteger('pledge_amount')->nullable()->after('permissions');
        });
    }

    public function down(): void
    {
        Schema::table('wallet_invitations', fn (Blueprint $table) => $table->dropColumn('pledge_amount'));
        Schema::table('emergency_unlock_requests', fn (Blueprint $table) => $table->dropColumn(['approvals', 'required_approvals', 'amount', 'reference', 'expires_at']));
        Schema::table('emergency_settings', fn (Blueprint $table) => $table->dropColumn(['purposes', 'keyholder_ids', 'required_keyholders', 'request_expiry_hours', 'fast_release_limit', 'fast_release_every_days']));
        Schema::table('savings_plans', fn (Blueprint $table) => $table->dropColumn(['schedule', 'salary_percent', 'roundup_to', 'missed_policy', 'notify_others_on_miss']));
        Schema::table('automation_rules', fn (Blueprint $table) => $table->dropColumn(['trigger', 'percent', 'roundup_to', 'pending_amount', 'retry_count', 'retry_at']));
    }
};
