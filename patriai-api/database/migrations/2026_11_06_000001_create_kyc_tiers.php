<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Verification tiers (ME-23) from the database instead of code, so the admin
 * Settings page can change limits and add tiers (Tier 4 …) and the app shows
 * them. Tiers 1–3 start with the limits they had in code. Kobo; null = no limit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kyc_tiers', function (Blueprint $table) {
            $table->id();
            $table->unsignedTinyInteger('level')->unique();
            $table->string('name', 40);
            // What a person has to give for it ("NIN and a selfie").
            $table->string('needs', 200);
            // A line for the app: what it's for and how it's checked.
            $table->string('description', 300)->nullable();
            $table->unsignedBigInteger('daily')->nullable();
            $table->unsignedBigInteger('single')->nullable();
            $table->unsignedBigInteger('max_balance')->nullable();
            $table->unsignedSmallInteger('max_wallets')->default(1);
            $table->boolean('shared_wallets')->default(false);
            $table->unsignedBigInteger('loan_cap')->default(0);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        $now = now();
        DB::table('kyc_tiers')->insert([
            ['level' => 1, 'name' => 'Tier 1', 'needs' => 'Phone and BVN', 'description' => 'Send and receive with your BVN checked.', 'daily' => 5_000_000, 'single' => 5_000_000, 'max_balance' => 30_000_000, 'max_wallets' => 1, 'shared_wallets' => false, 'loan_cap' => 5_000_000, 'created_at' => $now, 'updated_at' => $now],
            ['level' => 2, 'name' => 'Tier 2', 'needs' => 'NIN and a selfie', 'description' => 'More each day, and shared family wallets.', 'daily' => 20_000_000, 'single' => 20_000_000, 'max_balance' => 50_000_000, 'max_wallets' => 3, 'shared_wallets' => true, 'loan_cap' => 20_000_000, 'created_at' => $now, 'updated_at' => $now],
            ['level' => 3, 'name' => 'Tier 3', 'needs' => 'ID document and proof of address', 'description' => 'The highest limits, loans and no balance limit.', 'daily' => 500_000_000, 'single' => 500_000_000, 'max_balance' => null, 'max_wallets' => 20, 'shared_wallets' => true, 'loan_cap' => 100_000_000, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('kyc_tiers');
    }
};
