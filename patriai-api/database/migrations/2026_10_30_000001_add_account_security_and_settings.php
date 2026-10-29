<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Settings, log in and system states from the client prototype (ME-02…24,
 * ACC-01…07, ONB-10/11/13, SYS-01…08, 2026-10-30): PIN history and the 24-hour
 * hold after a reset, two-step verification, freezing the whole account,
 * settings (privacy, app lock, appearance, consent), home address, closing the
 * account; trusted devices with a server-issued secret and a 24-hour send hold;
 * a login history; support chat; and system settings (maintenance, app version).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('pin_changed_at')->nullable();
            // ACC-05 "For your safety, payments over ₦50,000 wait 24 hours."
            $table->timestamp('pin_reset_hold_until')->nullable();
            // ME-08: authenticator | sms | email, confirmed once the first code works.
            $table->string('two_factor_method', 20)->nullable();
            $table->text('two_factor_secret')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
            // ME-18 "Freeze your account": nothing leaves any wallet until unfrozen.
            $table->timestamp('frozen_at')->nullable();
            $table->json('settings')->nullable();
            $table->string('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('state', 100)->nullable();
            $table->timestamp('closed_at')->nullable();
        });

        Schema::table('devices', function (Blueprint $table) {
            // A device the person has proved with a code (and a selfie when not the first).
            $table->timestamp('trusted_at')->nullable();
            // ACC-06 "Receive money right away. Send after 24 hours."
            $table->timestamp('send_after')->nullable();
            // Lets a trusted phone skip the code (ACC-01 → ACC-02); only its hash is kept.
            $table->string('secret_hash', 64)->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('selfie_path')->nullable();
        });

        // ME-10 Login history: every sign-in, the ones we blocked too.
        Schema::create('login_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('device_id', 120)->nullable();
            $table->string('device_name', 120)->nullable();
            $table->string('platform', 20)->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('status', 20); // ok | failed | blocked
            $table->string('reason', 40)->nullable(); // wrong_pin | locked | wrong_code | new_device | pin_reset
            $table->boolean('new_device')->default(false);
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });

        // ME-17 Chat with support: the conversation on a support request.
        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from', 10); // user | support
            $table->text('body');
            $table->string('reference')->nullable(); // a transaction shared into the chat
            $table->timestamps();
        });

        // SYS-02/03: minimum app version, maintenance window, support phone.
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->json('value')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('support_messages');
        Schema::dropIfExists('login_events');
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn(['trusted_at', 'send_after', 'secret_hash', 'ip', 'selfie_path']);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['pin_changed_at', 'pin_reset_hold_until', 'two_factor_method', 'two_factor_secret', 'two_factor_confirmed_at', 'frozen_at', 'settings', 'address', 'city', 'state', 'closed_at']);
        });
    }
};
