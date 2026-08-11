<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Evidence files (images / videos) attached to a milestone as proof of work.
 * Files live on the public disk; this table records the URL, kind and uploader.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('milestone_evidence', function (Blueprint $table) {
            $table->id();
            $table->foreignId('milestone_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind'); // image | video
            $table->string('url');
            $table->timestamps();

            $table->index('milestone_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('milestone_evidence');
    }
};
