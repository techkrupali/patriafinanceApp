<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('automation_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->foreignId('from_wallet_id')->constrained('wallets')->cascadeOnDelete();
            $table->foreignId('to_wallet_id')->constrained('wallets')->cascadeOnDelete();
            $table->bigInteger('amount'); // kobo
            $table->enum('frequency', ['daily', 'weekly', 'monthly']);
            $table->unsignedTinyInteger('day_of_week')->nullable();  // 1-7 for weekly
            $table->unsignedTinyInteger('day_of_month')->nullable(); // 1-28 for monthly
            $table->bigInteger('min_balance')->nullable(); // kobo — only run if from-wallet keeps >= this after the move
            $table->boolean('enabled')->default(true);
            $table->string('last_run_period')->nullable(); // '2026-07-19' | '2026-W29' | '2026-07'
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index(['enabled', 'frequency']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_rules');
    }
};
