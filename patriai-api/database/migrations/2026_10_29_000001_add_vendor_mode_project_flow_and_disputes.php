<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Client prototype sheet "Projects, vendors, disputes":
 *  - vendor business accounts verified item by item (VON-01…10), with directors,
 *    documents, a payout account, services and past work (VDM-07)
 *  - reviews (VND-04) and a vendor's team (VDM-10/11)
 *  - a builder invited to a project accepts, asks for a change or declines
 *    (INV-V1…V5); milestones carry deliverables, proof needed, edits waiting for
 *    the other side, and milestones the builder proposes (VDM-09, PRJ-11)
 *  - project documents (PRJ-09) and a project chat
 *  - disputes about a milestone or a payment, with the payment on hold, the
 *    builder's offer, a conversation, escalation to Patriai and an outcome
 *    (DSP-01…09, VDM-08)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vendor_profiles', function (Blueprint $table) {
            $table->string('rc_number', 30)->nullable()->after('business_name');
            $table->unsignedSmallInteger('since_year')->nullable()->after('rc_number');
            $table->jsonb('services')->nullable()->after('category');
            $table->string('areas', 200)->nullable()->after('location');
            $table->string('team_size', 20)->nullable()->after('areas');
            $table->string('logo_url')->nullable()->after('team_size');
            $table->jsonb('past_work')->nullable()->after('logo_url'); // [{url, caption}]
            $table->string('status', 20)->default('draft')->after('verified'); // draft | submitted | needs_changes | verified
            $table->jsonb('checks')->nullable()->after('status'); // item => {status, note}
            $table->text('owner_bvn')->nullable(); // encrypted
            $table->text('owner_nin')->nullable(); // encrypted
            $table->string('id_type', 20)->nullable();
            $table->string('address', 200)->nullable();
            $table->string('bank_code', 10)->nullable();
            $table->string('bank_name', 100)->nullable();
            $table->string('account_number', 10)->nullable();
            $table->string('account_name', 150)->nullable();
            $table->boolean('auto_withdraw')->default(true);
            $table->string('tin', 30)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('verified_at')->nullable();
        });

        Schema::create('vendor_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_profile_id')->constrained()->cascadeOnDelete();
            $table->string('item', 30); // selfie | id_front | id_back | cac_certificate | cac_status_report | memorandum | address_proof | office_photo | tin_certificate
            $table->string('url');
            $table->string('name')->nullable();
            $table->timestamps();
            $table->index(['vendor_profile_id', 'item']);
        });

        Schema::create('vendor_directors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20)->nullable();
            $table->unsignedTinyInteger('share_percent')->nullable();
            $table->string('status', 20)->default('waiting'); // waiting | submitted | verified
            $table->string('token', 64)->nullable()->unique();
            $table->text('bvn')->nullable(); // encrypted
            $table->string('selfie_url')->nullable();
            $table->timestamps();
        });

        Schema::create('vendor_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('milestone_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->jsonb('tags')->nullable();
            $table->text('body')->nullable();
            $table->boolean('first_name_only')->default(true);
            $table->timestamps();
            $table->unique(['user_id', 'milestone_id']);
        });

        Schema::create('vendor_team_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('phone', 20)->nullable();
            $table->string('role', 20); // site_manager | foreman | accounts
            $table->jsonb('project_ids')->nullable();
            $table->string('status', 20)->default('pending'); // pending | active | declined | removed
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->index(['vendor_profile_id', 'status']);
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->string('vendor_status', 20)->nullable()->after('vendor_id'); // invited | changes_proposed | accepted | declined
            $table->timestamp('vendor_responded_at')->nullable()->after('vendor_status');
        });

        Schema::table('milestones', function (Blueprint $table) {
            $table->jsonb('deliverables')->nullable()->after('description'); // [{text, done}]
            $table->string('proof_needed', 200)->nullable()->after('deliverables');
            $table->jsonb('change_request')->nullable()->after('proof_needed'); // {by: family|vendor, user_id, amount?, due_date?, starts_on?, title?, deliverables?, why?, attachment_url?, at}
            $table->string('origin', 10)->default('family')->after('change_request'); // family | vendor
            $table->foreignId('submitted_by')->nullable()->after('submitted_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('milestone_evidence', function (Blueprint $table) {
            $table->string('caption', 60)->nullable()->after('url');
        });

        Schema::create('project_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 20); // contract | boq | other
            $table->string('name', 120);
            $table->string('url');
            $table->timestamps();
        });

        Schema::create('project_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['project_id', 'id']);
        });

        // Disputes: category and status were enum() CHECKs; they become plain strings.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_category_check');
            DB::statement('ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check');
        }
        Schema::table('disputes', function (Blueprint $table) {
            $table->string('category', 20)->default('other')->change();
            $table->string('status', 20)->default('open')->change();
        });
        Schema::table('disputes', function (Blueprint $table) {
            $table->string('number', 20)->nullable()->unique()->after('id');
            $table->string('kind', 20)->nullable()->after('category'); // milestone | payment_made | payment_received
            $table->foreignId('project_id')->nullable()->after('kind')->constrained()->nullOnDelete();
            $table->foreignId('milestone_id')->nullable()->after('project_id')->constrained()->nullOnDelete();
            $table->foreignId('against_user_id')->nullable()->after('milestone_id')->constrained('users')->nullOnDelete();
            $table->string('reason', 20)->nullable()->after('description'); // not_as_agreed | not_finished | poor_quality | overcharged | not_delivered | other
            $table->string('remedy', 20)->nullable()->after('reason'); // fix | partial_refund | full_refund
            $table->bigInteger('amount_on_hold')->default(0)->after('remedy');
            $table->timestamp('reply_by')->nullable();
            $table->timestamp('escalated_at')->nullable();
            $table->text('escalation_note')->nullable();
            $table->timestamp('decision_due')->nullable();
            $table->timestamp('evidence_until')->nullable();
            $table->string('outcome', 20)->nullable(); // fixed | partial_refund | full_refund | released
            $table->bigInteger('released_amount')->nullable();
            $table->bigInteger('refund_amount')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::create('dispute_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispute_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // null: Patriai / the system
            $table->string('kind', 20)->default('message'); // message | offer | system | decision
            $table->text('body')->nullable();
            $table->jsonb('offer')->nullable(); // {type: fix|partial_refund|disagree, fix_by?, amount?, status: open|accepted|declined}
            $table->timestamps();
            $table->index(['dispute_id', 'id']);
        });

        Schema::create('dispute_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dispute_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 20); // image | video | document
            $table->string('url');
            $table->string('name')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dispute_files');
        Schema::dropIfExists('dispute_messages');
        Schema::table('disputes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('decided_by');
            $table->dropConstrainedForeignId('against_user_id');
            $table->dropConstrainedForeignId('milestone_id');
            $table->dropConstrainedForeignId('project_id');
            $table->dropUnique(['number']);
            $table->dropColumn(['number', 'kind', 'reason', 'remedy', 'amount_on_hold', 'reply_by', 'escalated_at', 'escalation_note', 'decision_due', 'evidence_until', 'outcome', 'released_amount', 'refund_amount']);
        });
        Schema::dropIfExists('project_messages');
        Schema::dropIfExists('project_documents');
        Schema::table('milestone_evidence', fn (Blueprint $table) => $table->dropColumn('caption'));
        Schema::table('milestones', function (Blueprint $table) {
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropColumn(['deliverables', 'proof_needed', 'change_request', 'origin']);
        });
        Schema::table('projects', fn (Blueprint $table) => $table->dropColumn(['vendor_status', 'vendor_responded_at']));
        Schema::dropIfExists('vendor_team_members');
        Schema::dropIfExists('vendor_reviews');
        Schema::dropIfExists('vendor_directors');
        Schema::dropIfExists('vendor_documents');
        Schema::table('vendor_profiles', function (Blueprint $table) {
            $table->dropColumn(['rc_number', 'since_year', 'services', 'areas', 'team_size', 'logo_url', 'past_work', 'status', 'checks', 'owner_bvn', 'owner_nin', 'id_type', 'address', 'bank_code', 'bank_name', 'account_number', 'account_name', 'auto_withdraw', 'tin', 'submitted_at', 'verified_at']);
        });
    }
};
