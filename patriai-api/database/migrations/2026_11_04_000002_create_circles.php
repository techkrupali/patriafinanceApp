<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Family circles (FAM-01/02/07…12, HOM-06): a named group of people and the
 * wallets they share. Everyone has a home circle ("Okafor family"); wallets
 * with no circle belong to their owner's home circle. Another circle ("Eze
 * siblings") keeps its own members, wallets and rules. The owner can hand a
 * circle to someone else: they accept within 7 days, it takes effect 24 hours
 * later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('circles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 60);
            // family · extended · siblings · ajo · friends · community
            $table->string('kind', 20)->default('family');
            $table->string('purpose', 160)->nullable();
            $table->boolean('is_home')->default(false);
            $table->foreignId('pending_owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('transfer_requested_at')->nullable();
            $table->timestamp('transfer_accepted_at')->nullable();
            $table->timestamp('transfer_effective_at')->nullable();
            $table->timestamps();
            $table->index(['created_by', 'is_home']);
        });

        Schema::create('circle_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('circle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // co_owner · admin · contributor
            $table->string('role', 20)->default('contributor');
            // approve · send · invite · rules · balances
            $table->json('permissions')->nullable();
            $table->timestamps();
            $table->unique(['circle_id', 'user_id']);
        });

        Schema::table('wallets', function (Blueprint $table) {
            $table->foreignId('circle_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropConstrainedForeignId('circle_id');
        });
        Schema::dropIfExists('circle_members');
        Schema::dropIfExists('circles');
    }
};
