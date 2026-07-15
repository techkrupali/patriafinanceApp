<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('approver_id')->constrained('users');
            $table->string('decision'); // approve | reject
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['approval_request_id', 'approver_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_responses');
    }
};
