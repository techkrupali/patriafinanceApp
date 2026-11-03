<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Invitations from the client prototype (FAM-03…06, INV-01…04, INV-K, INV-T,
 * INV-A1, INV-CH):
 *  - every invite gets its own link, "patriai.app/i/K7Q2", that only opens for
 *    the person it went to; when it was opened, why it was declined, the
 *    inviter's note, and an accountant's access end date;
 *  - "Block future invites from Ngozi";
 *  - a trusted contact accepts or declines being one (INV-T1/T2);
 *  - a child's phone is linked only once a parent says yes on theirs (INV-CH3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->string('code', 12)->nullable()->unique()->after('token');
            $table->timestamp('opened_at')->nullable()->after('responded_at');
            $table->string('decline_reason', 80)->nullable()->after('opened_at');
            $table->string('message', 300)->nullable()->after('decline_reason');
            $table->date('access_until')->nullable()->after('message');
            $table->string('group_key', 24)->nullable()->index()->after('access_until');
        });

        // Invites already out get a link too.
        DB::table('wallet_invitations')->whereNull('code')->orderBy('id')->each(function ($row) {
            do {
                $code = strtoupper(Str::random(4));
            } while (DB::table('wallet_invitations')->where('code', $code)->exists());
            DB::table('wallet_invitations')->where('id', $row->id)->update(['code' => $code]);
        });

        Schema::create('invite_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('blocked_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'blocked_user_id']);
        });

        Schema::table('emergency_trusted_contacts', function (Blueprint $table) {
            $table->timestamp('accepted_at')->nullable()->after('link_sent_at');
            $table->timestamp('declined_at')->nullable()->after('accepted_at');
        });
        // Trusted contacts added before this already had their link: they stay able to ask.
        DB::table('emergency_trusted_contacts')->whereNull('accepted_at')->update(['accepted_at' => DB::raw('COALESCE(link_sent_at, created_at)')]);

        Schema::create('child_link_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('device_name', 80)->nullable();
            $table->string('secret_hash', 64);
            $table->string('status', 10)->default('pending'); // pending | approved | denied | used
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('child_link_requests');
        Schema::table('emergency_trusted_contacts', function (Blueprint $table) {
            $table->dropColumn(['accepted_at', 'declined_at']);
        });
        Schema::dropIfExists('invite_blocks');
        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropIndex(['group_key']);
            $table->dropColumn(['code', 'opened_at', 'decline_reason', 'message', 'access_until', 'group_key']);
        });
    }
};
