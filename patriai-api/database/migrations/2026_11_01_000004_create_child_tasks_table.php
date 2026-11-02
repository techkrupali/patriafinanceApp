<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CHD-07 "Tasks — earn money by helping out" and CHD-12 "New task for Tolu":
 * a parent sets a task with a reward; the child marks it done (with a photo if
 * asked); a parent checks it and the reward moves from their wallet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('child_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete(); // the child's wallet
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('title', 120);
            $table->unsignedBigInteger('reward'); // kobo
            $table->date('due_on')->nullable();
            $table->boolean('repeat_weekly')->default(false);
            $table->boolean('needs_photo')->default(false);
            $table->boolean('coparent_can_approve')->default(true);
            $table->string('status', 12)->default('todo'); // todo | submitted | paid | cancelled
            $table->string('photo_path')->nullable();
            $table->string('note', 200)->nullable(); // "Do the windows too" when sent back
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->string('paid_reference', 64)->nullable();
            $table->timestamps();

            $table->index(['wallet_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('child_tasks');
    }
};
