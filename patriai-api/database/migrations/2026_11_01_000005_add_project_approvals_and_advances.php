<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // VDM-12 "Ask for Painting materials money now": what was paid ahead of this milestone.
        Schema::table('milestones', function (Blueprint $table) {
            $table->bigInteger('advance_paid')->default(0)->after('retention'); // kobo
        });
    }

    public function down(): void
    {
        Schema::table('milestones', fn (Blueprint $table) => $table->dropColumn('advance_paid'));
    }
};
