<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Postgres does not auto-index FK columns — cover the hot read paths.
        Schema::table('transactions', function (Blueprint $table) {
            // "my activity" feeds: filter by initiator, newest first
            $table->index(['user_id', 'created_at']);
        });

        Schema::table('approval_requests', function (Blueprint $table) {
            // initiator's pending/recent approvals list
            $table->index(['initiator_id', 'status', 'created_at']);
        });

        Schema::table('wallet_members', function (Blueprint $table) {
            // membership lookups by user; unique(wallet_id, user_id) leads with wallet_id
            $table->index('user_id');
        });

        // approval_responses already covered by unique(approval_request_id, approver_id).
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'created_at']);
        });

        Schema::table('approval_requests', function (Blueprint $table) {
            $table->dropIndex(['initiator_id', 'status', 'created_at']);
        });

        Schema::table('wallet_members', function (Blueprint $table) {
            $table->dropIndex(['user_id']);
        });
    }
};
