<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete(); // owner
            $table->string('type')->index(); // main | shared | project
            $table->string('name');
            $table->string('currency', 3)->default('NGN');
            $table->bigInteger('balance')->default(0)->comment('kobo');
            $table->string('virtual_account')->unique()->nullable()->comment('funding account number from banking rails');
            $table->string('virtual_account_bank')->nullable();
            $table->string('status')->default('active'); // active | frozen | closed
            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallets');
    }
};
