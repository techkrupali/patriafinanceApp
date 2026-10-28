<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client prototype sheet "Wallets · Savings, Spending, Giving":
 *  - verified organisations (churches, mosques, charities, schools) that Patriai
 *    has checked, and each user's saved accounts, by category and in groups
 *  - spending wallets: a budget split into categories with limits; payments are
 *    tagged with their category
 *  - giving wallets: recipients, giving dates, pledges paid in parts and a log of
 *    every payment (some wait for a yes first)
 *  - savings: the early-break fee, half of it to a charity the saver picks
 *  - rules that top a wallet back up to an amount, or take a share of every
 *    deposit into any wallet (client: "fixed deposits and percentage of
 *    deposits from 1 or more wallets")
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organisations', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('kind', 20); // church | mosque | charity | school | other
            $table->string('cause', 20)->nullable(); // charities: children | food | education | health | elderly | faith
            $table->string('area', 80)->nullable(); // "Surulere", "Ikeja"
            $table->string('state', 40)->nullable(); // "Lagos"
            $table->text('about')->nullable();
            $table->string('account_name', 120);
            $table->string('account_number', 10);
            $table->string('bank_code', 10);
            $table->string('bank_name', 80);
            $table->boolean('verified')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['kind', 'state']);
        });

        Schema::create('saved_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organisation_id')->nullable()->constrained()->nullOnDelete();
            $table->string('nickname', 80);
            $table->string('account_name', 120); // as the bank returned it
            $table->string('account_number', 10);
            $table->string('bank_code', 10);
            $table->string('bank_name', 80);
            $table->string('category', 40)->default('family'); // family | friends | institutions | partners | anything new
            // "Save this account for later" off: used where it was added, not listed.
            $table->boolean('listed')->default(true);
            $table->timestamps();

            $table->unique(['user_id', 'bank_code', 'account_number']);
        });

        Schema::create('saved_account_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80); // "Our churches"
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });

        Schema::create('saved_account_group_items', function (Blueprint $table) {
            $table->foreignId('group_id')->constrained('saved_account_groups')->cascadeOnDelete();
            $table->foreignId('saved_account_id')->constrained()->cascadeOnDelete();
            $table->primary(['group_id', 'saved_account_id']);
        });

        Schema::create('budget_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->bigInteger('limit'); // kobo per budget period
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('budget_category_id')->nullable()->after('wallet_id')->constrained()->nullOnDelete();
        });

        Schema::table('automation_rules', function (Blueprint $table) {
            // Move whatever brings the destination back up to `amount` ("fill it back to ₦350,000").
            $table->boolean('fill_to')->default(false)->after('amount');
        });

        Schema::create('giving_recipients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('saved_account_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('group_id')->nullable()->constrained('saved_account_groups')->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::create('giving_pledges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80); // "Church building fund"
            $table->bigInteger('total');
            $table->bigInteger('paid_before')->default(0); // paid before Patriai
            $table->date('due_date')->nullable();
            $table->foreignId('saved_account_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('group_id')->nullable()->constrained('saved_account_groups')->nullOnDelete();
            $table->string('plan', 10)->default('parts'); // parts | once
            $table->string('status', 10)->default('active'); // active | done
            $table->timestamps();
        });

        Schema::create('giving_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('label', 60); // "Tithe", "Sunday offering", "Pledge part 1"
            $table->bigInteger('amount'); // kobo per payment date, split across a group
            $table->foreignId('saved_account_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('group_id')->nullable()->constrained('saved_account_groups')->cascadeOnDelete();
            // weekly (day_of_week) | monthly (day_of_month) | monthly_weekday ("first Sunday") | once (run_on)
            $table->string('frequency', 16);
            $table->unsignedTinyInteger('day_of_week')->nullable(); // ISO 1 = Monday … 7 = Sunday
            $table->unsignedTinyInteger('day_of_month')->nullable();
            $table->unsignedTinyInteger('week_of_month')->nullable(); // 1 = first
            $table->date('run_on')->nullable();
            $table->foreignId('pledge_id')->nullable()->constrained('giving_pledges')->cascadeOnDelete();
            // Pledge parts come "from Main, after salary", not from what was set aside.
            $table->foreignId('from_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->boolean('ask_first')->default(false);
            $table->boolean('enabled')->default(true);
            $table->string('last_run_period', 20)->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
        });

        Schema::create('giving_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schedule_id')->nullable()->constrained('giving_schedules')->nullOnDelete();
            $table->foreignId('saved_account_id')->nullable()->constrained()->nullOnDelete();
            $table->bigInteger('amount');
            $table->string('status', 12); // awaiting (a yes first) | due (sending) | paid | failed | skipped
            $table->string('period', 20); // the giving date, "2026-11-01"
            $table->foreignId('transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->string('receipt_no', 30)->nullable();
            $table->string('note', 200)->nullable();
            $table->timestamps();

            $table->unique(['schedule_id', 'saved_account_id', 'period']);
        });

        Schema::create('charity_donations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organisation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('wallet_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('transaction_id')->nullable()->constrained()->nullOnDelete();
            $table->bigInteger('amount');
            $table->string('receipt_no', 30);
            $table->string('status', 10)->default('pending'); // pending (owed) | paid
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::table('savings_plans', function (Blueprint $table) {
            // SAV-06 "Tell me — Push and SMS".
            $table->boolean('notify_sms')->default(false)->after('notify_others_on_miss');
        });
    }

    public function down(): void
    {
        Schema::table('savings_plans', fn (Blueprint $table) => $table->dropColumn('notify_sms'));
        Schema::dropIfExists('charity_donations');
        Schema::dropIfExists('giving_payments');
        Schema::dropIfExists('giving_schedules');
        Schema::dropIfExists('giving_pledges');
        Schema::dropIfExists('giving_recipients');
        Schema::table('automation_rules', fn (Blueprint $table) => $table->dropColumn('fill_to'));
        Schema::table('transactions', fn (Blueprint $table) => $table->dropConstrainedForeignId('budget_category_id'));
        Schema::dropIfExists('budget_categories');
        Schema::dropIfExists('saved_account_group_items');
        Schema::dropIfExists('saved_account_groups');
        Schema::dropIfExists('saved_accounts');
        Schema::dropIfExists('organisations');
    }
};
