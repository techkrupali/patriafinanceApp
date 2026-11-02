<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * SND-14 "Repeat payment — ₦18,000 to Bisi, every Saturday from Household"
 * and SND-15 Scheduled payments: a payment to a person, a bank account or a
 * group, once later or on repeat, authorised with the PIN when it was set up.
 * Each run goes through the same checks as sending by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scheduled_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('from_wallet_id')->constrained('wallets')->cascadeOnDelete();
            // The transfer's destination, as POST /transfers takes it (user | bank | group).
            $table->json('destination');
            $table->string('to_name', 160);
            $table->unsignedBigInteger('amount'); // kobo
            $table->string('note', 200)->nullable();
            $table->unsignedBigInteger('budget_category_id')->nullable();
            // "Skips if Food and market is used up".
            $table->boolean('skip_if_over')->default(false);
            $table->string('frequency', 10); // once | weekly | biweekly | monthly | quarterly | yearly
            $table->timestamp('starts_at'); // the first run; later runs keep its weekday, date and time
            $table->unsignedInteger('ends_after')->nullable(); // "Or after a number of payments"
            $table->unsignedInteger('runs')->default(0); // how many dates have come round
            $table->timestamp('next_run_at')->nullable()->index();
            $table->string('status', 10)->default('active'); // active | paused | done | cancelled
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_result', 12)->nullable(); // sent | approval | processing | skipped | failed
            $table->string('last_reason', 255)->nullable();
            $table->string('last_reference', 64)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_payments');
    }
};
