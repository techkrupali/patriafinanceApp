<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->string('description')->nullable()->after('name');
            $table->bigInteger('target_amount')->nullable()->comment('kobo')->after('description');
            $table->boolean('approval_enabled')->default(false)->after('target_amount');
            $table->bigInteger('approval_threshold')->nullable()->comment('kobo — spends >= this need approval; NULL + enabled means all spends')->after('approval_enabled');
            $table->unsignedInteger('required_approvals')->default(1)->after('approval_threshold');
        });
    }

    public function down(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropColumn([
                'description',
                'target_amount',
                'approval_enabled',
                'approval_threshold',
                'required_approvals',
            ]);
        });
    }
};
