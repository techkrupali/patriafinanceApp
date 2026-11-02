<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** PRW-06 "Photos from the site · With date and location": when and where each was taken, from the photo itself. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('milestone_evidence', function (Blueprint $table) {
            $table->timestamp('taken_at')->nullable()->after('caption');
            $table->decimal('latitude', 9, 6)->nullable()->after('taken_at');
            $table->decimal('longitude', 9, 6)->nullable()->after('latitude');
        });
    }

    public function down(): void
    {
        Schema::table('milestone_evidence', fn (Blueprint $table) => $table->dropColumn(['taken_at', 'latitude', 'longitude']));
    }
};
