<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DSP-06 "re-lay the kitchen by Wed 28 Oct": the date an agreed (or Patriai-
 * decided) fix is due, and when the builder was last reminded; and the case
 * officer who took a dispute in admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('disputes', function (Blueprint $table) {
            $table->date('fix_by')->nullable()->after('evidence_until');
            $table->timestamp('fix_reminded_at')->nullable()->after('fix_by');
            $table->foreignId('officer_id')->nullable()->after('decided_by')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('disputes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('officer_id');
            $table->dropColumn(['fix_by', 'fix_reminded_at']);
        });
    }
};
