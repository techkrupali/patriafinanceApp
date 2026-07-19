<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            // member_added | member_removed | member_role_changed | permissions_changed |
            // wallet_frozen | wallet_unfrozen | settings_changed | access_schedule_set |
            // wallet_created | large_spend
            $table->string('event');
            $table->string('description');
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index('wallet_id');
            $table->index(['wallet_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_audit_logs');
    }
};
