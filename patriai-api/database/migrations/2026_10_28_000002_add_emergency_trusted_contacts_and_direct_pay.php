<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client prototype "Emergency wallet" (EMG-03, EMG-05, WCR-06):
 *  - pay the hospital directly: money released goes to a bank account, not a person
 *  - trusted contacts: people without the app who get an SMS link to ask for a
 *    release or upload proof; the owner chooses what they may do
 *  - nobody changes the release rules alone: a change needs the keyholders too
 *  - someone invited by phone can be a keyholder once they join
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('emergency_settings', function (Blueprint $table) {
            $table->boolean('pay_directly')->default(false)->after('fast_release_every_days');
            $table->boolean('trusted_can_request')->default(true)->after('pay_directly');
            $table->boolean('trusted_can_upload')->default(true)->after('trusted_can_request');
            $table->boolean('trusted_can_see_balance')->default(false)->after('trusted_can_upload');
        });

        Schema::create('emergency_trusted_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('phone', 20);
            $table->string('relation', 80)->nullable(); // "Family doctor", "Cousin, lives near Mama and Papa"
            $table->string('token_hash', 64)->unique(); // sha256 of the secure link token
            $table->timestamp('link_sent_at')->nullable();
            $table->timestamps();

            $table->unique(['wallet_id', 'phone']);
        });

        Schema::table('emergency_unlock_requests', function (Blueprint $table) {
            $table->foreignId('trusted_contact_id')->nullable()->after('requested_by')->constrained('emergency_trusted_contacts')->nullOnDelete();
            $table->jsonb('payload')->nullable()->after('reference'); // rule_change: the new rules
            $table->jsonb('payee')->nullable()->after('payload'); // fast release paid straight to a bank account
        });
        // A trusted contact (no account) can ask for a release.
        Schema::table('emergency_unlock_requests', function (Blueprint $table) {
            $table->unsignedBigInteger('requested_by')->nullable()->change();
        });

        Schema::table('wallet_invitations', function (Blueprint $table) {
            $table->boolean('keyholder')->default(false)->after('pledge_amount');
        });
    }

    public function down(): void
    {
        Schema::table('wallet_invitations', fn (Blueprint $table) => $table->dropColumn('keyholder'));
        Schema::table('emergency_unlock_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('trusted_contact_id');
            $table->dropColumn(['payload', 'payee']);
        });
        Schema::dropIfExists('emergency_trusted_contacts');
        Schema::table('emergency_settings', fn (Blueprint $table) => $table->dropColumn(['pay_directly', 'trusted_can_request', 'trusted_can_upload', 'trusted_can_see_balance']));
    }
};
