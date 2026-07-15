<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('initiator_id')->constrained('users');
            $table->string('action'); // withdrawal | transfer_wallet | transfer_user | transfer_bank
            $table->bigInteger('amount')->comment('kobo');
            $table->bigInteger('fee')->default(0)->comment('kobo');
            $table->string('description')->nullable();
            $table->jsonb('payload'); // everything needed to execute
            $table->unsignedInteger('required_approvals');
            $table->unsignedInteger('approvals_count')->default(0);
            $table->string('status')->default('pending'); // pending | approved | rejected | expired | executed | failed | cancelled
            $table->string('executed_transaction_reference')->nullable();
            $table->string('fail_reason')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['wallet_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_requests');
    }
};
