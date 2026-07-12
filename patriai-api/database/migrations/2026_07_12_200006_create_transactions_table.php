<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // initiator
            $table->string('type'); // fund | withdrawal | transfer_in | transfer_out
            $table->string('direction'); // credit | debit
            $table->bigInteger('amount')->comment('kobo');
            $table->bigInteger('fee')->default(0)->comment('kobo');
            $table->bigInteger('balance_after')->nullable()->comment('kobo');
            $table->string('status')->default('pending')->index(); // pending | successful | failed
            $table->string('description')->nullable();
            $table->jsonb('counterparty')->nullable(); // bank/wallet/user details
            $table->string('banking_reference')->nullable()->index(); // Matrix Banking reference
            $table->string('session_id')->nullable()->unique(); // webhook idempotency
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index(['wallet_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
