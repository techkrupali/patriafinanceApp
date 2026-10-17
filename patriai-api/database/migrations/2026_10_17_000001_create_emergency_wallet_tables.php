<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Emergency Wallet access rules (client video "Emergency Wallet instructions",
 * 2026-10-17). An emergency wallet created through the guided journey is LOCKED:
 * anyone may fund it, but money only leaves once one of its unlock rules fires.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('emergency_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('purpose', 20); // medical | funeral | travel | legal | other

            // Unlock rules (at least one is required).
            $table->boolean('dual_approval')->default(false);
            $table->foreignId('approver_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('unlock_on_document')->default(false); // death certificate / legal notice
            $table->boolean('manual_unlock')->default(false);
            $table->string('unlock_reason', 150)->nullable();
            $table->string('emergency_pin')->nullable(); // hashed, separate from the transaction PIN

            // Override rules.
            $table->boolean('override_national_crisis')->default(false);
            $table->boolean('override_high_balance')->default(false);
            $table->bigInteger('override_balance_threshold')->default(100_000_000); // kobo — ₦1,000,000

            $table->text('beneficiary_note')->nullable();

            // Lock state: null unlocked_at = locked.
            $table->timestamp('unlocked_at')->nullable();
            $table->string('unlocked_via', 30)->nullable();
            $table->foreignId('unlocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('emergency_beneficiaries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('position'); // 1..3, in the order the owner listed them
            $table->string('relationship', 40)->nullable();
            $table->string('role', 20)->default('beneficiary'); // beneficiary | fallback
            $table->bigInteger('withdrawal_limit')->nullable(); // kobo; null = up to the balance
            $table->string('access_type', 20)->default('immediate'); // immediate | delay_7d
            $table->bigInteger('withdrawn')->default(0); // kobo taken since the current unlock
            $table->timestamps();

            $table->unique(['wallet_id', 'user_id']);
        });

        Schema::create('emergency_unlock_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->string('method', 20); // dual_approval | document
            $table->string('document_type', 30)->nullable(); // death_certificate | legal_notice
            $table->string('document_path')->nullable(); // private disk
            $table->string('note', 500)->nullable();
            $table->string('status', 20)->default('pending'); // pending | approved | rejected | cancelled
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete(); // admin
            $table->string('review_note', 500)->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->index(['wallet_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emergency_unlock_requests');
        Schema::dropIfExists('emergency_beneficiaries');
        Schema::dropIfExists('emergency_settings');
    }
};
