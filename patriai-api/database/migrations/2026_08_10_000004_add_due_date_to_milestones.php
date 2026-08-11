<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Milestones get an optional deadline/due date. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('milestones', function (Blueprint $table) {
            $table->date('due_date')->nullable()->after('amount');
        });
    }

    public function down(): void
    {
        Schema::table('milestones', function (Blueprint $table) {
            $table->dropColumn('due_date');
        });
    }
};
