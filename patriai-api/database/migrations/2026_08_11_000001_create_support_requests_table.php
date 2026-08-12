<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minimal backend-team support escalation store. Only the fields support needs —
 * this is deliberately NOT a full ticketing platform.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('subject');
            $table->string('category')->default('other'); // transfer | withdrawal | wallet | account | transaction | other
            $table->text('description');
            $table->string('reference')->nullable(); // a safe, user-owned reference (e.g. a txn reference)
            $table->string('status')->default('pending'); // pending | in_review | resolved | closed
            $table->string('priority')->default('medium'); // low | medium | high
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_requests');
    }
};
