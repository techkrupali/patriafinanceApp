<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * PLN-01…04 Free and Pro: the plans (prices, trial, limits — all set in admin),
 * a family's subscription to one, and each payment for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 30)->unique();
            $table->string('name', 60);
            // "whole family": who one subscription covers.
            $table->string('covers', 80)->nullable();
            // Kobo.
            $table->unsignedBigInteger('monthly_price')->default(0);
            $table->unsignedBigInteger('yearly_price')->default(0);
            $table->unsignedSmallInteger('trial_days')->default(0);
            $table->boolean('is_free')->default(false);
            $table->boolean('active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            // {"wallets": 3, "shared_wallets": 1, "rules": 2} — null means no limit.
            $table->json('limits')->nullable();
            $table->timestamps();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained();
            $table->string('interval', 10);
            // trialing, active, past_due (a payment failed), expired (back on Free).
            $table->string('status', 20);
            $table->unsignedBigInteger('price');
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('cancel_at_period_end')->default(false);
            // "Switch to monthly": takes effect at the next payment.
            $table->string('next_interval', 10)->nullable();
            $table->foreignId('pay_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->timestamp('reminded_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->string('failure', 255)->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
            $table->index(['status', 'current_period_end']);
        });

        Schema::create('subscription_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('amount');
            $table->string('interval', 10);
            $table->string('status', 10); // paid, failed
            $table->string('reference', 40)->unique();
            $table->foreignId('transaction_id')->nullable()->constrained('transactions')->nullOnDelete();
            $table->string('failure', 255)->nullable();
            $table->timestamp('period_start')->nullable();
            $table->timestamp('period_end')->nullable();
            $table->timestamps();
        });

        // The prototype's two plans. Pro stays off until an admin sets its price and turns it on.
        $now = now();
        DB::table('plans')->insert([
            ['slug' => 'free', 'name' => 'Free', 'covers' => null, 'monthly_price' => 0, 'yearly_price' => 0, 'trial_days' => 0, 'is_free' => true, 'active' => true, 'position' => 1,
                'limits' => json_encode(['wallets' => 3, 'shared_wallets' => 1, 'rules' => 2]), 'created_at' => $now, 'updated_at' => $now],
            ['slug' => 'pro', 'name' => 'Pro', 'covers' => 'whole family', 'monthly_price' => 250_000, 'yearly_price' => 2_500_000, 'trial_days' => 30, 'is_free' => false, 'active' => false, 'position' => 2,
                'limits' => json_encode(['wallets' => 20, 'shared_wallets' => null, 'rules' => null]), 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('plans');
    }
};
