<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('milestones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sequence');
            $table->string('title');
            $table->string('description')->nullable();
            $table->bigInteger('amount')->comment('kobo');
            $table->string('status')->default('funded'); // funded | submitted | approved | released | rejected
            $table->text('proof')->nullable(); // vendor submission note / url
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->string('released_transaction_reference')->nullable();
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index(['project_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('milestones');
    }
};
