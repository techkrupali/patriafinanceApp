<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loans', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('category'); // rent | mortgage | car | school_fees | family_emergency | business | feeding | child_allowance | short_term
            $table->string('purpose')->nullable();
            $table->bigInteger('principal')->comment('kobo');
            $table->unsignedSmallInteger('interest_bps')->comment('interest in basis points, e.g. 500 = 5%');
            $table->bigInteger('fee')->default(0)->comment('kobo');
            $table->bigInteger('total_repayable')->comment('kobo');
            $table->bigInteger('outstanding')->comment('kobo');
            $table->bigInteger('penalty_accrued')->default(0)->comment('kobo');
            $table->unsignedInteger('tenor_days');
            $table->string('repayment_frequency'); // once | weekly | monthly
            $table->string('status')->default('pending'); // pending | approved | rejected | disbursed | active | repaid | defaulted | cancelled
            $table->foreignId('disbursed_wallet_id')->nullable()->constrained('wallets')->nullOnDelete();
            $table->timestamp('disbursed_at')->nullable();
            $table->timestamp('due_at')->nullable(); // final due date
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('rejected_reason')->nullable();
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loans');
    }
};
