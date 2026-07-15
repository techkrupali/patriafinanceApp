<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained('wallets')->cascadeOnDelete(); // dedicated escrow wallet
            $table->foreignId('owner_id')->constrained('users');
            $table->foreignId('vendor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->string('description')->nullable();
            $table->bigInteger('budget')->default(0)->comment('kobo');
            $table->string('status')->default('active'); // active | completed | cancelled
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->unique('wallet_id');
            $table->index(['owner_id', 'status']);
            $table->index('vendor_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
