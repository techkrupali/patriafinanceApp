<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * VPJ-01…06 a builder's proposal to a family (quote, phases, terms) that
 * becomes a project when the family accepts and funds it; VLS-01/02 a finished
 * project the builder shows on their profile, once the family agrees.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('project_proposals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('family_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('invite_phone', 20)->nullable(); // "Someone not on Patriai yet"
            $table->string('title', 120);
            $table->string('kind', 20)->default('building'); // building | extension | renovation | event | other
            $table->string('location', 200)->nullable();
            $table->json('lines'); // [{label, amount}] kobo — VPJ-02 the quote
            $table->bigInteger('total'); // kobo
            $table->text('scope')->nullable();
            $table->json('documents')->nullable(); // [{name, url, kind}] bill of quantities, drawings
            $table->json('phases'); // [{title, percent, amount, proof}] — VPJ-03
            $table->json('terms'); // {upfront, retention_percent, retention_months, start_within_days, show_on_profile}
            $table->string('status', 20)->default('draft'); // draft | sent | accepted | declined
            $table->text('family_note')->nullable();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
            $table->index(['vendor_id', 'status']);
            $table->index(['family_user_id', 'status']);
        });

        Schema::create('vendor_listings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('family_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title', 120);
            $table->json('photos'); // [{url, caption}]
            $table->bigInteger('cost_min')->nullable(); // kobo — "₦15m to ₦20m"
            $table->bigInteger('cost_max')->nullable();
            $table->unsignedSmallInteger('months')->nullable(); // "Took 13 months"
            $table->string('location', 120)->nullable();
            $table->string('status', 20)->default('asking'); // asking | published | declined
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->index(['vendor_profile_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_listings');
        Schema::dropIfExists('project_proposals');
    }
};
