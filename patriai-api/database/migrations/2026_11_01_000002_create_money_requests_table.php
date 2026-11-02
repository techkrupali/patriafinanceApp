<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Request money (REQ-01…03) and split a bill (SPL-01): someone asks a person
 * for an amount, paid into one of their wallets, by a date; the link
 * (patriai.app/r/N3V8) lets anyone pay, even without the app.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('money_requests', function (Blueprint $table) {
            $table->id();
            $table->string('code', 12)->unique(); // the link: /r/{code}
            $table->foreignId('requester_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete(); // pays into
            // A Patriai user, or someone not on Patriai yet (a name and phone/email, paid by the link).
            $table->foreignId('payer_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('payer_name', 120)->nullable();
            $table->string('payer_contact', 190)->nullable();
            $table->unsignedBigInteger('amount'); // kobo
            $table->unsignedBigInteger('paid_amount')->default(0); // "Pay part"
            $table->string('note', 200)->nullable();
            $table->date('due_on')->nullable();
            $table->string('status', 12)->default('pending'); // pending | paid | declined | cancelled
            $table->string('decline_reason', 200)->nullable();
            // SPL-01: requests made together from one bill.
            $table->string('split_key', 36)->nullable()->index();
            $table->string('split_title', 120)->nullable();
            $table->unsignedBigInteger('split_total')->nullable();
            $table->string('split_place', 120)->nullable(); // "Paid by you at Yellow Chilli"
            $table->string('split_method', 8)->nullable(); // equal | amount | share
            $table->timestamp('reminded_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['payer_user_id', 'status']);
            $table->index(['requester_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('money_requests');
    }
};
