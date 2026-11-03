<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rules from the client prototype (AUT-03…10, RUL-01): "Household falls below
 * ₦30,000" (a balance trigger), "a goal is reached / a request is made" (an
 * event), "Only if… before the 20th, at most once a week", "Only notify",
 * "Also tell Emeka", Emeka's agreement when it moves money into a shared
 * wallet, the order rules run on salary day, and a run log that outlives the
 * rule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('automation_rules', function (Blueprint $table) {
            // balance: watch this wallet; event: goal_reached · request_made.
            $table->foreignId('watch_wallet_id')->nullable()->after('to_wallet_id')->constrained('wallets')->nullOnDelete();
            $table->unsignedBigInteger('threshold')->nullable()->after('watch_wallet_id');
            $table->string('event', 30)->nullable()->after('threshold');
            // AUT-04 "It's before the 20th of the month".
            $table->unsignedTinyInteger('before_day')->nullable()->after('event');
            // move · sweep (all but `amount`) · notify (no money moves).
            $table->string('action', 12)->default('move')->after('before_day');
            $table->json('notify_user_ids')->nullable()->after('action');
            // {"needed": [ids], "given": [ids]} — co-owners of a shared wallet agree first.
            $table->json('agreement')->nullable()->after('notify_user_ids');
            // AUT-10 "Salary day: which goes first?" — lower runs first.
            $table->unsignedInteger('priority')->default(0)->after('agreement');
        });

        Schema::create('automation_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('automation_rule_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('rule_name');
            // ran · skipped · failed
            $table->string('status', 10);
            $table->unsignedBigInteger('amount')->nullable();
            $table->string('note')->nullable();
            $table->string('reference')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['automation_rule_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_runs');
        Schema::table('automation_rules', function (Blueprint $table) {
            $table->dropConstrainedForeignId('watch_wallet_id');
            $table->dropColumn(['threshold', 'event', 'before_day', 'action', 'notify_user_ids', 'agreement', 'priority']);
        });
    }
};
