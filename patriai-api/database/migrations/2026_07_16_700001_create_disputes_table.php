<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('disputes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->index()->constrained()->cascadeOnDelete();
            $table->string('subject');
            $table->enum('category', ['transaction', 'project', 'vendor', 'account', 'other'])->default('other');
            $table->string('reference')->nullable(); // a txn reference / project id / free ref the user cites
            $table->text('description');
            $table->enum('status', ['open', 'under_review', 'resolved', 'rejected'])->default('open');
            $table->text('resolution')->nullable(); // admin's resolution note
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('disputes');
    }
};
