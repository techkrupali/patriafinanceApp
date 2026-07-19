<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spousal_syncs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('initiator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('partner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('partner_identifier');
            $table->enum('transparency', ['minimal', 'selective', 'full'])->default('selective');
            $table->enum('status', ['pending', 'active', 'paused', 'ended'])->default('pending');
            $table->jsonb('shared_wallet_ids')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->index('initiator_id');
            $table->index('partner_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spousal_syncs');
    }
};
