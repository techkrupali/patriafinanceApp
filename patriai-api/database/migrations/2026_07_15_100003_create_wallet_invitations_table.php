<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inviter_id')->constrained('users');
            $table->foreignId('invitee_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('invitee_identifier'); // email or phone as typed
            $table->string('role')->default('contributor'); // co_owner | admin | contributor | viewer
            $table->boolean('can_approve')->default(false);
            $table->string('status')->default('pending'); // pending | accepted | declined | expired | cancelled
            $table->string('token')->unique();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();

            $table->index(['invitee_user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_invitations');
    }
};
