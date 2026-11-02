<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CHT-01…05 Chats: a project's own chat gets milestone cards and Steward
 * (project_messages), direct and group chats are conversations, and each
 * person's read position and mute live in chat_reads.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('project_messages', function (Blueprint $table) {
            $table->string('kind', 20)->default('message')->after('user_id'); // message | milestone | system | steward
            $table->json('payload')->nullable()->after('body');
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 10); // direct | group
            $table->string('title', 80)->nullable();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete(); // CHT-02 "Link to a project"
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->boolean('steward')->default(false);
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
        });

        Schema::create('conversation_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('left_at')->nullable();
            $table->timestamps();
            $table->unique(['conversation_id', 'user_id']);
        });

        Schema::create('conversation_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // null: Steward or Patriai
            $table->string('kind', 20)->default('message'); // message | proposal | system | steward
            $table->text('body')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->index(['conversation_id', 'id']);
        });

        Schema::create('chat_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('chat_key', 40); // project:4 | conversation:12
            $table->unsignedBigInteger('last_read_id')->default(0);
            $table->boolean('muted')->default(false);
            $table->timestamps();
            $table->unique(['user_id', 'chat_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_reads');
        Schema::dropIfExists('conversation_messages');
        Schema::dropIfExists('conversation_members');
        Schema::dropIfExists('conversations');
        Schema::table('project_messages', fn (Blueprint $table) => $table->dropColumn(['kind', 'payload']));
    }
};
