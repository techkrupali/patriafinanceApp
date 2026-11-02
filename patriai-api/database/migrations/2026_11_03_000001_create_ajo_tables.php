<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ajo circles (client prototype AJO-01…04, INV-J1, WPV-06): rotating savings.
 * Everyone pays the same amount each round into a pot that Patriai holds (an
 * `ajo` wallet), and the whole pot goes to one member per round, in a drawn or
 * agreed order. Amounts are kobo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ajo_circles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organiser_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedBigInteger('contribution');
            $table->string('frequency', 10); // weekly | monthly
            $table->unsignedSmallInteger('size');
            $table->date('starts_on');
            $table->unsignedBigInteger('late_fee')->default(0);
            $table->unsignedTinyInteger('late_after_days')->default(3);
            $table->unsignedTinyInteger('payout_after_days')->default(4);
            $table->string('order_mode', 10)->default('random'); // random | agreed
            $table->boolean('allow_swaps')->default(true);
            $table->string('status', 12)->default('forming'); // forming | active | completed | cancelled
            $table->string('code', 12)->unique();
            $table->foreignId('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('ajo_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('circle_id')->constrained('ajo_circles')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('position')->nullable();
            $table->string('status', 12)->default('active'); // active | lost_turn | replaced
            $table->boolean('auto_pay')->default(true);
            $table->foreignId('source_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->unsignedSmallInteger('missed')->default(0);
            // WPV-06 "Replace member": the invitation of the person taking this place.
            $table->foreignId('replaced_by_invitation_id')->nullable()->constrained('wallet_invitations')->nullOnDelete();
            $table->timestamps();
            $table->unique(['circle_id', 'user_id']);
        });

        Schema::create('ajo_contributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('circle_id')->constrained('ajo_circles')->cascadeOnDelete();
            $table->foreignId('member_id')->constrained('ajo_members')->cascadeOnDelete();
            $table->unsignedSmallInteger('round');
            $table->date('due_on');
            $table->unsignedBigInteger('amount');
            $table->unsignedBigInteger('fee')->default(0);
            $table->string('status', 8)->default('due'); // due | paid
            $table->boolean('late')->default(false);
            $table->date('tried_on')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->string('reference')->nullable();
            // Counted in the round's payout, or sent on to its member after the payout day.
            $table->boolean('settled')->default(false);
            $table->timestamps();
            $table->unique(['circle_id', 'member_id', 'round']);
        });

        Schema::create('ajo_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('circle_id')->constrained('ajo_circles')->cascadeOnDelete();
            $table->unsignedSmallInteger('round');
            $table->foreignId('member_id')->constrained('ajo_members')->cascadeOnDelete();
            $table->date('pay_on');
            $table->unsignedBigInteger('amount')->default(0);
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
            $table->unique(['circle_id', 'round']);
        });

        Schema::create('ajo_swaps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('circle_id')->constrained('ajo_circles')->cascadeOnDelete();
            $table->foreignId('from_member_id')->constrained('ajo_members')->cascadeOnDelete();
            $table->foreignId('to_member_id')->constrained('ajo_members')->cascadeOnDelete();
            $table->string('status', 10)->default('pending'); // pending | accepted | declined | cancelled
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ajo_swaps');
        Schema::dropIfExists('ajo_payouts');
        Schema::dropIfExists('ajo_contributions');
        Schema::dropIfExists('ajo_members');
        Schema::dropIfExists('ajo_circles');
    }
};
