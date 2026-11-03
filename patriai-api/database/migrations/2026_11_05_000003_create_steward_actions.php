<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** AIS-06 "What Steward did": every move Steward made on its own, and why. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('steward_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // move · auto_rule · answer · suggest
            $table->string('kind', 20);
            $table->string('summary');
            $table->unsignedBigInteger('amount')->nullable();
            $table->string('reference')->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('undone_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('steward_actions');
    }
};
