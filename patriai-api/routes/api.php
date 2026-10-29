<?php

use App\Http\Controllers\Api\Admin\AdminController;
use App\Http\Controllers\Api\Admin\DisputeAdminController;
use App\Http\Controllers\Api\Admin\EmergencyAdminController;
use App\Http\Controllers\Api\Admin\OrganisationAdminController;
use App\Http\Controllers\Api\Admin\VendorAdminController;
use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AssistantController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\BankController;
use App\Http\Controllers\Api\BudgetController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DisputeController;
use App\Http\Controllers\Api\EmergencyController;
use App\Http\Controllers\Api\FamilyController;
use App\Http\Controllers\Api\GivingController;
use App\Http\Controllers\Api\GoalController;
use App\Http\Controllers\Api\HomeController;
use App\Http\Controllers\Api\FamilyMemberController;
use App\Http\Controllers\Api\ChildController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\JointController;
use App\Http\Controllers\Api\KycController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\MilestoneController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OrganisationController;
use App\Http\Controllers\Api\PhoneAuthController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectFlowController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\SavedAccountController;
use App\Http\Controllers\Api\SavingsController;
use App\Http\Controllers\Api\SpendRequestController;
use App\Http\Controllers\Api\SpousalSyncController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VendorController;
use App\Http\Controllers\Api\WalletAuditLogController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\WalletDraftController;
use App\Http\Controllers\Api\WalletLockController;
use App\Http\Controllers\Api\WalletMemberController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // ---- Public ----
    Route::prefix('auth')->group(function () {
        Route::post('register', [AuthController::class, 'register'])->middleware('throttle:10,1');
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');
        Route::post('otp/request', [AuthController::class, 'requestOtp'])->middleware('throttle:5,1');
        Route::post('otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:10,1');
        Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
        Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');

        // Phone-first onboarding and log-in (client prototype ONB-03…12, ACC-01/02).
        // Each route keeps its own per-IP counter (third throttle argument), so one
        // sign-up's several calls don't use up another's allowance; codes per number
        // are limited separately in OtpService.
        Route::post('phone/start', [PhoneAuthController::class, 'start'])->middleware('throttle:10,1,phone-start');
        Route::post('phone/verify', [PhoneAuthController::class, 'verify'])->middleware('throttle:10,1,phone-verify');
        Route::post('phone/register', [PhoneAuthController::class, 'register'])->middleware('throttle:10,1,phone-register');
        Route::post('phone/login', [PhoneAuthController::class, 'login'])->middleware('throttle:10,1,phone-login');
        Route::post('pin/forgot', [PhoneAuthController::class, 'forgotPin'])->middleware('throttle:5,1,pin-forgot');
        Route::post('pin/reset', [PhoneAuthController::class, 'resetPin'])->middleware('throttle:5,1,pin-reset');
    });

    // Banking rails webhook (server-to-server)
    Route::post('webhooks/banking', [WebhookController::class, 'banking']);

    // ---- Authenticated ----
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::put('profile', [ProfileController::class, 'update']);
        Route::post('profile/avatar', [ProfileController::class, 'updateAvatar'])->middleware('throttle:10,1');
        Route::post('profile/change-password', [ProfileController::class, 'changePassword']);
        Route::post('profile/change-pin', [ProfileController::class, 'changePin']);
        Route::post('profile/verify-pin', [ProfileController::class, 'verifyPin'])->middleware('throttle:10,1');
        Route::put('profile/onboarding', [ProfileController::class, 'onboarding']);
        Route::post('devices', [ProfileController::class, 'registerDevice']);
        Route::get('devices', [ProfileController::class, 'devices']);
        Route::delete('devices/{device}', [ProfileController::class, 'removeDevice'])->middleware('throttle:30,1');

        Route::get('dashboard', [DashboardController::class, 'index']);
        // Home tab + Treasury header (client prototype HOM-01 / TRS-01).
        Route::get('home', [HomeController::class, 'index']);

        // AI Assistant (read-only tools; runs the LLM tool loop server-side as
        // the authenticated user). Rate-limited — each call may fan out to the LLM.
        Route::post('assistant/chat', [AssistantController::class, 'chat'])->middleware('throttle:20,1');

        // Find registered users to invite by @username (in-app invitations)
        Route::get('users/search', [UserController::class, 'search'])->middleware('throttle:60,1');

        // Family Hub (aggregated people/invitations/stats across the user's wallets)
        Route::get('family', [FamilyController::class, 'index']);
        // Family member detail ({member} implicitly binds App\Models\User by id)
        Route::get('family/{member}', [FamilyMemberController::class, 'show']);

        // Spousal Sync (two-person financial-transparency link)
        Route::get('sync', [SpousalSyncController::class, 'show']);
        Route::post('sync', [SpousalSyncController::class, 'store'])->middleware('throttle:20,1');
        Route::post('sync/{spousalSync}/respond', [SpousalSyncController::class, 'respond'])->middleware('throttle:30,1');
        Route::patch('sync/{spousalSync}', [SpousalSyncController::class, 'updateTransparency'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/pause', [SpousalSyncController::class, 'pause'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/resume', [SpousalSyncController::class, 'resume'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/end', [SpousalSyncController::class, 'end'])->middleware('throttle:30,1');

        // Automation / Smart Rules (V1: scheduled auto-transfer between own wallets)
        Route::get('automations', [AutomationController::class, 'index']);
        Route::post('automations', [AutomationController::class, 'store'])->middleware('throttle:20,1');
        Route::get('automations/{automationRule}', [AutomationController::class, 'show']);
        Route::patch('automations/{automationRule}', [AutomationController::class, 'update'])->middleware('throttle:30,1');
        Route::delete('automations/{automationRule}', [AutomationController::class, 'destroy'])->middleware('throttle:30,1');
        Route::post('automations/{automationRule}/run', [AutomationController::class, 'run'])->middleware('throttle:10,1');

        Route::get('wallets', [WalletController::class, 'index']);
        Route::post('wallets', [WalletController::class, 'store']);
        Route::get('wallets/{wallet}', [WalletController::class, 'show']);
        Route::patch('wallets/{wallet}', [WalletController::class, 'updateSettings'])->middleware('throttle:30,1');
        Route::get('wallets/{wallet}/transactions', [WalletController::class, 'transactions']);
        Route::get('wallets/{wallet}/funding-details', [WalletController::class, 'fundingDetails']);
        Route::post('wallets/{wallet}/withdraw', [WalletController::class, 'withdraw'])->middleware('throttle:10,1');

        // Wallet deletion — archive (reversible) + permanent delete (archived + empty)
        Route::post('wallets/{wallet}/archive', [WalletController::class, 'archive'])->middleware('throttle:30,1');
        Route::post('wallets/{wallet}/unarchive', [WalletController::class, 'unarchive'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}', [WalletController::class, 'destroy'])->middleware('throttle:20,1');

        // Wallet audit log + lock / scheduled access
        Route::get('wallets/{wallet}/audit-log', [WalletAuditLogController::class, 'index']);
        Route::post('wallets/{wallet}/freeze', [WalletLockController::class, 'freeze'])->middleware('throttle:30,1');
        Route::post('wallets/{wallet}/unfreeze', [WalletLockController::class, 'unfreeze'])->middleware('throttle:30,1');
        Route::patch('wallets/{wallet}/access-schedule', [WalletLockController::class, 'setSchedule'])->middleware('throttle:30,1');

        // Wallet members
        Route::get('wallets/{wallet}/members', [WalletMemberController::class, 'index']);
        Route::patch('wallets/{wallet}/members/{member}', [WalletMemberController::class, 'update'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/members/{member}', [WalletMemberController::class, 'destroy'])->middleware('throttle:30,1');

        // Spend requests (a request-only member asks the owner/co-owners to approve a spend)
        Route::post('wallets/{wallet}/spend-requests', [SpendRequestController::class, 'store'])->middleware('throttle:20,1');

        // Savings goals — shared plan, milestones, each saver's own auto-save.
        Route::get('savings/insights', [SavingsController::class, 'insights']);
        Route::get('wallets/{wallet}/savings', [SavingsController::class, 'show']);
        Route::patch('wallets/{wallet}/savings', [SavingsController::class, 'update'])->middleware('throttle:30,1');
        Route::post('wallets/{wallet}/savings/contribution', [SavingsController::class, 'startContribution'])->middleware('throttle:20,1');
        Route::patch('wallets/{wallet}/savings/contribution', [SavingsController::class, 'updateContribution'])->middleware('throttle:30,1');
        Route::post('wallets/{wallet}/savings/milestones', [SavingsController::class, 'addMilestone'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/savings/milestones/{milestone}', [SavingsController::class, 'removeMilestone'])->middleware('throttle:30,1');

        // Goal wallets — cancelling gives everyone back what they put in.
        Route::post('wallets/{wallet}/goal/cancel', [GoalController::class, 'cancel'])->middleware('throttle:10,1');

        // Child wallets — a code to link the child's own phone.
        Route::post('children/link-code', [ChildController::class, 'reserve'])->middleware('throttle:20,1');
        Route::post('wallets/{wallet}/child/link-code', [ChildController::class, 'renew'])->middleware('throttle:20,1');

        // Joint wallets — rule changes both agree, notice to leave, closing with both PINs.
        Route::post('wallets/{wallet}/joint/changes', [JointController::class, 'propose'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/joint/changes/answer', [JointController::class, 'answer'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/joint/leave', [JointController::class, 'leave'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/joint/close', [JointController::class, 'close'])->middleware('throttle:10,1');

        // Spending wallets — WAL-09 budget, categories and spender limits.
        Route::get('wallets/{wallet}/budget', [BudgetController::class, 'show']);
        Route::patch('wallets/{wallet}/budget/categories/{category}', [BudgetController::class, 'updateCategory'])->middleware('throttle:30,1');
        Route::patch('wallets/{wallet}/budget/spenders/{user}', [BudgetController::class, 'updateSpender'])->middleware('throttle:30,1');

        // Giving wallets — WAL-18, giving dates, payments waiting for a yes.
        Route::get('wallets/{wallet}/giving', [GivingController::class, 'show']);
        Route::post('wallets/{wallet}/giving/schedules', [GivingController::class, 'storeSchedule'])->middleware('throttle:30,1');
        Route::patch('wallets/{wallet}/giving/schedules/{schedule}', [GivingController::class, 'updateSchedule'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/giving/schedules/{schedule}', [GivingController::class, 'destroySchedule'])->middleware('throttle:30,1');
        Route::post('giving-payments/{payment}/confirm', [GivingController::class, 'confirm'])->middleware('throttle:20,1');
        Route::post('giving-payments/{payment}/skip', [GivingController::class, 'skip'])->middleware('throttle:20,1');

        // Saved accounts (GIV-07, SND-16) and the organisations Patriai lists (GIV-02, BRK-02).
        Route::get('saved-accounts', [SavedAccountController::class, 'index']);
        Route::post('saved-accounts', [SavedAccountController::class, 'store'])->middleware('throttle:20,1');
        Route::delete('saved-accounts/{savedAccount}', [SavedAccountController::class, 'destroy'])->middleware('throttle:30,1');
        Route::post('saved-account-groups', [SavedAccountController::class, 'storeGroup'])->middleware('throttle:20,1');
        Route::get('organisations', [OrganisationController::class, 'index']);

        // Wallet drafts — auto-saved setup, resumable from the wallet list.
        Route::get('wallet-drafts', [WalletDraftController::class, 'index']);
        Route::post('wallet-drafts', [WalletDraftController::class, 'store'])->middleware('throttle:60,1');
        Route::put('wallet-drafts/{walletDraft}', [WalletDraftController::class, 'update'])->middleware('throttle:120,1');
        Route::delete('wallet-drafts/{walletDraft}', [WalletDraftController::class, 'destroy'])->middleware('throttle:30,1');

        // Emergency Wallet access rules — unlock / re-lock / recipient payouts.
        Route::get('wallets/{wallet}/emergency', [EmergencyController::class, 'show']);
        Route::post('wallets/{wallet}/emergency/unlock', [EmergencyController::class, 'unlock'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/emergency/override', [EmergencyController::class, 'override'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/emergency/lock', [EmergencyController::class, 'lock'])->middleware('throttle:20,1');
        Route::put('wallets/{wallet}/emergency/rules', [EmergencyController::class, 'updateRules'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/emergency/requests', [EmergencyController::class, 'requestUnlock'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/emergency/withdraw', [EmergencyController::class, 'withdraw'])->middleware('throttle:10,1');
        Route::post('wallets/{wallet}/emergency/fast-release', [EmergencyController::class, 'fastRelease'])->middleware('throttle:10,1');
        Route::post('emergency-requests/{emergencyUnlockRequest}/approve', [EmergencyController::class, 'approve'])->middleware('throttle:20,1');
        Route::post('emergency-requests/{emergencyUnlockRequest}/reject', [EmergencyController::class, 'reject'])->middleware('throttle:20,1');
        Route::post('emergency-requests/{emergencyUnlockRequest}/cancel', [EmergencyController::class, 'cancel'])->middleware('throttle:20,1');

        // Wallet invitations
        Route::get('wallets/{wallet}/invitations', [InvitationController::class, 'walletIndex']);
        Route::post('wallets/{wallet}/invitations', [InvitationController::class, 'store'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/invitations/{invitation}', [InvitationController::class, 'cancel'])->middleware('throttle:30,1');
        Route::post('wallets/{wallet}/invitations/{invitation}/resend', [InvitationController::class, 'resend'])->middleware('throttle:10,1');
        Route::get('invitations', [InvitationController::class, 'myIndex']);
        Route::post('invitations/{invitation}/accept', [InvitationController::class, 'accept'])->middleware('throttle:30,1');
        Route::post('invitations/{invitation}/decline', [InvitationController::class, 'decline'])->middleware('throttle:30,1');

        // Approvals
        Route::get('approvals', [ApprovalController::class, 'index']);
        Route::get('approvals/{approvalRequest}', [ApprovalController::class, 'show']);
        Route::post('approvals/{approvalRequest}/respond', [ApprovalController::class, 'respond'])->middleware('throttle:30,1');
        Route::post('approvals/{approvalRequest}/cancel', [ApprovalController::class, 'cancel'])->middleware('throttle:30,1');

        // Notifications
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'read'])->middleware('throttle:60,1');
        Route::post('notifications/read-all', [NotificationController::class, 'readAll'])->middleware('throttle:30,1');

        Route::post('transfers', [TransferController::class, 'store'])->middleware('throttle:20,1');

        // KYC & Compliance (tier verification)
        Route::get('kyc', [KycController::class, 'show']);
        Route::post('kyc/submit', [KycController::class, 'submit'])->middleware('throttle:10,1');

        Route::get('banks', [BankController::class, 'index']);
        Route::post('banks/verify-account', [BankController::class, 'verifyAccount'])->middleware('throttle:20,1');

        // Referral & Rewards (Affiliate & Referral Center — tracking only, no money)
        Route::get('referrals', [ReferralController::class, 'index']);
        Route::post('referrals/apply', [ReferralController::class, 'apply'])->middleware('throttle:10,1');

        // Disputes (DSP-01…09): a milestone's payment waits while the builder answers; Patriai decides if they can't agree.
        Route::get('disputes', [DisputeController::class, 'index']);
        Route::post('disputes', [DisputeController::class, 'store'])->middleware('throttle:30,1,dispute');
        Route::get('disputes/{dispute}', [DisputeController::class, 'show']);
        Route::post('disputes/{dispute}/files', [DisputeController::class, 'addFile'])->middleware('throttle:30,1,dispute-files');
        Route::post('disputes/{dispute}/respond', [DisputeController::class, 'respond'])->middleware('throttle:30,1,dispute');
        Route::post('disputes/{dispute}/messages', [DisputeController::class, 'message'])->middleware('throttle:60,1,dispute-chat');
        Route::post('disputes/{dispute}/offers/{message}/answer', [DisputeController::class, 'answerOffer'])->middleware('throttle:30,1,dispute');
        Route::post('disputes/{dispute}/escalate', [DisputeController::class, 'escalate'])->middleware('throttle:30,1,dispute');

        // Loans (Patria Lending)
        Route::get('loans', [LoanController::class, 'index']);
        Route::get('loans/eligibility', [LoanController::class, 'eligibility']);
        Route::post('loans', [LoanController::class, 'store'])->middleware('throttle:20,1');
        Route::get('loans/{loan}', [LoanController::class, 'show']);
        Route::post('loans/{loan}/repay', [LoanController::class, 'repay'])->middleware('throttle:15,1');
        Route::post('loans/{loan}/cancel', [LoanController::class, 'cancel'])->middleware('throttle:30,1');

        // Vendor Directory (VND-01/02/04: browse, a profile, rate) and a business account (VDM-01, VON-01…10).
        // NOTE: vendors/me… MUST come before vendors/{vendorProfile} (route-model-binding).
        Route::get('vendors', [VendorController::class, 'index']);
        Route::get('vendors/me', [VendorController::class, 'me']);
        Route::put('vendors/me', [VendorController::class, 'upsert'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/owner', [VendorController::class, 'owner'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/documents', [VendorController::class, 'uploadDocument'])->middleware('throttle:60,1,vendor-setup');
        Route::delete('vendors/me/documents/{document}', [VendorController::class, 'deleteDocument'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/directors', [VendorController::class, 'addDirector'])->middleware('throttle:10,1,vendor-directors');
        Route::delete('vendors/me/directors/{director}', [VendorController::class, 'removeDirector'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/address', [VendorController::class, 'address'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/bank', [VendorController::class, 'bank'])->middleware('throttle:10,1,vendor-bank');
        Route::patch('vendors/me/payouts', [VendorController::class, 'payoutSettings'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/logo', [VendorController::class, 'logo'])->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/past-work', [VendorController::class, 'addPastWork'])->middleware('throttle:60,1,vendor-setup');
        Route::delete('vendors/me/past-work/{index}', [VendorController::class, 'removePastWork'])->whereNumber('index')->middleware('throttle:60,1,vendor-setup');
        Route::post('vendors/me/submit', [VendorController::class, 'submit'])->middleware('throttle:10,1,vendor-submit');
        Route::get('vendors/me/team', [VendorController::class, 'team']);
        Route::post('vendors/me/team', [VendorController::class, 'invite'])->middleware('throttle:30,1,vendor-team');
        Route::patch('vendors/me/team/{member}', [VendorController::class, 'updateMember'])->middleware('throttle:30,1,vendor-team');
        Route::delete('vendors/me/team/{member}', [VendorController::class, 'removeMember'])->middleware('throttle:30,1,vendor-team');
        Route::get('vendors/{vendorProfile}', [VendorController::class, 'show']);
        Route::get('vendors/{vendorProfile}/reviews', [VendorController::class, 'reviews']);
        Route::post('vendors/{vendorProfile}/reviews', [VendorController::class, 'review'])->middleware('throttle:10,1,vendor-review');

        // Vendor mode (VDM-03 home, VDM-06 payouts, VDM-08 disputes) and joining a builder's team (INV-VT1).
        Route::get('vendor/home', [VendorController::class, 'home']);
        Route::get('vendor/payouts', [VendorController::class, 'payouts']);
        Route::get('vendor/disputes', [VendorController::class, 'disputes']);
        Route::get('team-invites', [VendorController::class, 'teamInvites']);
        Route::post('team-invites/{member}/answer', [VendorController::class, 'answerTeamInvite'])->middleware('throttle:30,1,vendor-team');

        // Vendor & Project System (escrow-backed milestones)
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store'])->middleware('throttle:20,1,project-setup');
        Route::get('projects/{project}', [ProjectController::class, 'show']);
        Route::post('projects/{project}/cancel', [ProjectController::class, 'cancel'])->middleware('throttle:30,1,project-owner');
        Route::post('projects/{project}/vendor', [ProjectController::class, 'assignVendor'])->middleware('throttle:30,1,project-owner');
        Route::delete('projects/{project}/vendor', [ProjectController::class, 'removeVendor'])->middleware('throttle:30,1,project-owner');
        Route::post('projects/{project}/milestones', [ProjectController::class, 'addMilestone'])->middleware('throttle:30,1,project-owner');
        Route::delete('milestones/{milestone}', [ProjectController::class, 'removeMilestone'])->middleware('throttle:30,1,project-owner');
        Route::post('milestones/{milestone}/evidence', [MilestoneController::class, 'uploadEvidence'])->middleware('throttle:60,1,milestone-evidence');
        Route::post('milestones/{milestone}/submit', [MilestoneController::class, 'submit'])->middleware('throttle:30,1,milestone-review');
        Route::post('milestones/{milestone}/approve', [MilestoneController::class, 'approve'])->middleware('throttle:30,1,milestone-review');
        Route::post('milestones/{milestone}/reject', [MilestoneController::class, 'reject'])->middleware('throttle:30,1,milestone-review');
        Route::delete('milestones/{milestone}/evidence/{evidence}', [MilestoneController::class, 'deleteEvidence'])->middleware('throttle:60,1,milestone-evidence');

        // The family and the builder working on a project: the invitation (INV-V1…V5, PRJ-12), the builder's
        // new milestones (VDM-09, PRJ-11), the family's edits (PRJ-05), deliverables, documents (PRJ-09), chat.
        Route::post('projects/{project}/accept', [ProjectFlowController::class, 'accept'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/decline', [ProjectFlowController::class, 'decline'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/send-changes', [ProjectFlowController::class, 'sendChanges'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/changes/answer', [ProjectFlowController::class, 'answerChanges'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/reinvite-reminder', [ProjectFlowController::class, 'remindReinvite'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/milestones/propose', [ProjectFlowController::class, 'propose'])->middleware('throttle:60,1,project-flow');
        Route::post('projects/{project}/documents', [ProjectFlowController::class, 'uploadDocument'])->middleware('throttle:60,1,project-flow');
        Route::delete('projects/{project}/documents/{document}', [ProjectFlowController::class, 'deleteDocument'])->middleware('throttle:60,1,project-flow');
        Route::get('projects/{project}/messages', [ProjectFlowController::class, 'messages']);
        Route::post('projects/{project}/messages', [ProjectFlowController::class, 'send'])->middleware('throttle:60,1,project-chat');
        Route::post('milestones/{milestone}/change', [ProjectFlowController::class, 'askChange'])->middleware('throttle:60,1,project-flow');
        Route::delete('milestones/{milestone}/change', [ProjectFlowController::class, 'clearChange'])->middleware('throttle:30,1,project-flow');
        Route::patch('milestones/{milestone}/proposal', [ProjectFlowController::class, 'updateProposal'])->middleware('throttle:60,1,project-flow');
        Route::post('milestones/{milestone}/proposal/answer', [ProjectFlowController::class, 'answerProposal'])->middleware('throttle:60,1,project-flow');
        Route::patch('milestones/{milestone}', [ProjectFlowController::class, 'edit'])->middleware('throttle:30,1,project-flow');
        Route::post('milestones/{milestone}/family-change/answer', [ProjectFlowController::class, 'answerFamilyChange'])->middleware('throttle:60,1,project-flow');
        Route::patch('milestones/{milestone}/deliverables', [ProjectFlowController::class, 'tick'])->middleware('throttle:60,1,project-flow');

        // ---- Admin ----
        Route::prefix('admin')->middleware('admin')->group(function () {
            Route::get('stats', [AdminController::class, 'stats']);
            Route::get('users', [AdminController::class, 'users']);
            Route::get('users/{user}', [AdminController::class, 'user']);
            Route::patch('users/{user}', [AdminController::class, 'updateUser']);
            Route::patch('users/{user}/status', [AdminController::class, 'updateUserStatus']);
            Route::patch('users/{user}/kyc-tier', [AdminController::class, 'setUserKycTier']);
            Route::get('wallets', [AdminController::class, 'wallets']);
            Route::get('wallets/{wallet}', [AdminController::class, 'walletDetail']);
            Route::post('wallets/{wallet}/adjust', [AdminController::class, 'adjustWallet']);
            Route::patch('wallets/{wallet}/status', [AdminController::class, 'updateWalletStatus']);
            Route::get('transactions', [AdminController::class, 'transactions']);
            Route::get('transactions/{transaction}', [AdminController::class, 'transactionShow']);
            Route::post('transactions/{transaction}/reverse', [AdminController::class, 'reverseTransaction']);
            Route::get('approvals', [AdminController::class, 'approvals']);
            Route::get('approvals/{approvalRequest}', [AdminController::class, 'approvalShow']);

            // Broadcast in-app notifications
            Route::post('notifications/broadcast', [AdminController::class, 'broadcastNotification']);

            // Support requests (backend-team escalations from the AI assistant)
            Route::get('support-requests', [AdminController::class, 'supportRequests']);
            Route::get('support-requests/{supportRequest}', [AdminController::class, 'supportRequestShow']);
            Route::patch('support-requests/{supportRequest}/status', [AdminController::class, 'updateSupportRequestStatus'])->middleware('throttle:60,1');

            // Loans
            Route::get('loans', [AdminController::class, 'loans']);
            Route::post('loans/run-due', [AdminController::class, 'runDueLoans']);
            Route::get('loans/{loan}', [AdminController::class, 'loanShow']);
            Route::post('loans/{loan}/approve', [AdminController::class, 'approveLoan']);
            Route::post('loans/{loan}/reject', [AdminController::class, 'rejectLoan']);
            Route::post('loans/{loan}/default', [AdminController::class, 'defaultLoan']);
            Route::post('loans/{loan}/recover', [AdminController::class, 'recoverLoan']);

            // Projects (Vendor & Project System)
            Route::get('projects', [AdminController::class, 'projects']);
            Route::get('projects/{project}', [AdminController::class, 'projectShow']);

            // Vendors: verify a business item by item (VON-09) and grant the badge.
            Route::get('vendors', [VendorAdminController::class, 'index']);
            Route::get('vendors/{vendorProfile}', [VendorAdminController::class, 'show']);
            Route::get('vendors/{vendorProfile}/documents/{document}', [VendorAdminController::class, 'document']);
            Route::get('vendors/{vendorProfile}/directors/{director}/selfie', [VendorAdminController::class, 'selfie']);
            Route::post('vendors/{vendorProfile}/review', [VendorAdminController::class, 'review'])->middleware('throttle:60,1,admin-vendor-review');

            // Disputes: Patriai's decision when the two sides can't agree (DSP-08/09).
            Route::get('disputes', [DisputeAdminController::class, 'index']);
            Route::get('disputes/{dispute}', [DisputeAdminController::class, 'show']);
            Route::post('disputes/{dispute}/decide', [DisputeAdminController::class, 'decide'])->middleware('throttle:30,1,admin-dispute');
            Route::post('disputes/{dispute}/messages', [DisputeAdminController::class, 'message'])->middleware('throttle:60,1,admin-dispute');

            // KYC & Compliance (tier verification)
            Route::get('kyc', [AdminController::class, 'kyc']);
            Route::get('kyc/{submission}', [AdminController::class, 'kycShow']);
            Route::post('kyc/{submission}/approve', [AdminController::class, 'approveKyc']);
            Route::post('kyc/{submission}/reject', [AdminController::class, 'rejectKyc']);
            Route::get('emergency-requests', [EmergencyAdminController::class, 'index']);
            Route::get('emergency-requests/{emergencyUnlockRequest}', [EmergencyAdminController::class, 'show']);
            Route::get('emergency-requests/{emergencyUnlockRequest}/document', [EmergencyAdminController::class, 'document']);
            Route::post('emergency-requests/{emergencyUnlockRequest}/approve', [EmergencyAdminController::class, 'approve']);
            Route::post('emergency-requests/{emergencyUnlockRequest}/reject', [EmergencyAdminController::class, 'reject']);
            Route::post('wallets/{wallet}/emergency/crisis-unlock', [EmergencyAdminController::class, 'crisisUnlock']);

            // Organisations people give to, and charities' share of early-break fees.
            Route::get('organisations', [OrganisationAdminController::class, 'index']);
            Route::post('organisations', [OrganisationAdminController::class, 'store'])->middleware('throttle:60,1');
            Route::patch('organisations/{organisation}', [OrganisationAdminController::class, 'update'])->middleware('throttle:60,1');
            Route::post('organisations/{organisation}/donations/paid', [OrganisationAdminController::class, 'markDonationsPaid'])->middleware('throttle:30,1');
        });
    });
});
