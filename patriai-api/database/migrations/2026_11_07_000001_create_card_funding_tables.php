<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ADD-03/04 paying in by card (through the payment partner, Paystack), the
 * cards people keep for next time, and ADD-06 the cash agents near them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saved_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20);
            // The partner's reusable token for this card (never the card number).
            $table->text('authorization_code');
            $table->string('signature', 120)->nullable();
            $table->string('brand', 30);
            $table->string('last4', 4);
            $table->unsignedTinyInteger('exp_month')->nullable();
            $table->unsignedSmallInteger('exp_year')->nullable();
            $table->string('bank', 120)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'provider']);
        });

        Schema::create('card_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('saved_card_id')->nullable()->constrained('saved_cards')->nullOnDelete();
            $table->string('provider', 20);
            $table->string('reference', 40)->unique();
            // Kobo: what lands in the wallet, and the fee on top.
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('fee')->default(0);
            // pending (at the checkout), otp (waiting for the bank's code), success, failed.
            $table->string('status', 20)->default('pending');
            $table->string('card_label', 60)->nullable();
            $table->string('message', 255)->nullable();
            $table->unsignedTinyInteger('otp_tries')->default(0);
            $table->foreignId('transaction_id')->nullable()->constrained('transactions')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
        });

        Schema::create('agents', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('address', 255)->nullable();
            $table->string('area', 80)->nullable();
            $table->string('city', 80);
            $table->string('state', 80)->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->string('hours', 80)->nullable();
            $table->string('phone', 30)->nullable();
            $table->boolean('cash_in')->default(true);
            $table->boolean('cash_out')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->index(['active', 'city']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_payments');
        Schema::dropIfExists('saved_cards');
        Schema::dropIfExists('agents');
    }
};
