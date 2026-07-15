<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loan_repayments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loan_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sequence');
            $table->date('due_date');
            $table->bigInteger('amount_due')->comment('kobo');
            $table->bigInteger('amount_paid')->default(0)->comment('kobo');
            $table->timestamp('paid_at')->nullable();
            $table->string('status')->default('pending'); // pending | partial | paid | overdue
            $table->foreignId('transaction_id')->nullable()->constrained('transactions')->nullOnDelete();
            $table->timestamps();

            $table->index(['loan_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loan_repayments');
    }
};
