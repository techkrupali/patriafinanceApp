<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Savings Goals wallets + wallet drafts (client sheet "Savings Wallets",
 * 2026-10-18): target date, milestones, a savings plan that applies to every
 * contributor, per-invite permissions, contributor auto-save into a wallet
 * they don't own, and drafts so setup can be resumed later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->date('target_date')->nullable()->after('target_amount');
        });

        // One savings rule for everyone saving into the wallet.
        Schema::create('savings_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->unique()->constrained()->cascadeOnDelete();
            $table->bigInteger('amount'); // kobo, per person per period
            $table->string('frequency', 10); // daily | weekly | monthly
            $table->unsignedTinyInteger('day_of_week')->nullable(); // ISO 1=Mon..7=Sun
            $table->unsignedTinyInteger('day_of_month')->nullable(); // 1..28
            $table->boolean('auto_save')->default(true);
            $table->boolean('allow_contributor_edit')->default(false);
            $table->timestamps();
        });

        Schema::create('savings_milestones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('title', 100);
            $table->bigInteger('amount'); // kobo — reached once the balance gets here
            $table->date('due_date')->nullable();
            $table->unsignedTinyInteger('position');
            $table->timestamps();
        });

        // Unfinished wallet setups, resumable from the wallet list.
        Schema::create('wallet_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 20);
            $table->string('name', 100)->nullable();
            $table->unsignedTinyInteger('step')->default(1);
            $table->unsignedTinyInteger('total_steps')->default(1);
            $table->jsonb('data')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });

        // view / fund / request / withdraw chosen per person at invite time.
        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->jsonb('permissions')->nullable()->after('can_approve');
        });

        // A contributor's auto-save into a savings wallet they don't own.
        Schema::table('automation_rules', function (Blueprint $table) {
            $table->boolean('savings_contribution')->default(false)->after('to_wallet_id');
        });
    }

    public function down(): void
    {
        Schema::table('automation_rules', function (Blueprint $table) {
            $table->dropColumn('savings_contribution');
        });
        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->dropColumn('permissions');
        });
        Schema::dropIfExists('wallet_drafts');
        Schema::dropIfExists('savings_milestones');
        Schema::dropIfExists('savings_plans');
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropColumn('target_date');
        });
    }
};
