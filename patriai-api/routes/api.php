<?php

use App\Http\Controllers\Api\Admin\AdminController;
use App\Http\Controllers\Api\Admin\EmergencyAdminController;
use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AssistantController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\BankController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DisputeController;
use App\Http\Controllers\Api\EmergencyController;
use App\Http\Controllers\Api\FamilyController;
use App\Http\Controllers\Api\HomeController;
use App\Http\Controllers\Api\FamilyMemberController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\KycController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\MilestoneController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PhoneAuthController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ReferralController;
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

        // Dispute Center (report a problem with a payment/project)
        Route::get('disputes', [DisputeController::class, 'index']);
        Route::post('disputes', [DisputeController::class, 'store'])->middleware('throttle:20,1');
        Route::get('disputes/{dispute}', [DisputeController::class, 'show']);

        // Loans (Patria Lending)
        Route::get('loans', [LoanController::class, 'index']);
        Route::get('loans/eligibility', [LoanController::class, 'eligibility']);
        Route::post('loans', [LoanController::class, 'store'])->middleware('throttle:20,1');
        Route::get('loans/{loan}', [LoanController::class, 'show']);
        Route::post('loans/{loan}/repay', [LoanController::class, 'repay'])->middleware('throttle:15,1');
        Route::post('loans/{loan}/cancel', [LoanController::class, 'cancel'])->middleware('throttle:30,1');

        // Vendor Directory (browse/search vendors, then assign via projects/{project}/vendor).
        // NOTE: vendors/me MUST come before vendors/{vendorProfile} (route-model-binding).
        Route::get('vendors', [VendorController::class, 'index']);
        Route::get('vendors/me', [VendorController::class, 'me']);
        Route::put('vendors/me', [VendorController::class, 'upsert'])->middleware('throttle:20,1');
        Route::get('vendors/{vendorProfile}', [VendorController::class, 'show']);

        // Vendor & Project System (escrow-backed milestones)
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store'])->middleware('throttle:20,1');
        Route::get('projects/{project}', [ProjectController::class, 'show']);
        Route::post('projects/{project}/cancel', [ProjectController::class, 'cancel'])->middleware('throttle:30,1');
        Route::post('projects/{project}/vendor', [ProjectController::class, 'assignVendor'])->middleware('throttle:30,1');
        Route::delete('projects/{project}/vendor', [ProjectController::class, 'removeVendor'])->middleware('throttle:30,1');
        Route::post('projects/{project}/milestones', [ProjectController::class, 'addMilestone'])->middleware('throttle:30,1');
        Route::delete('milestones/{milestone}', [ProjectController::class, 'removeMilestone'])->middleware('throttle:30,1');
        Route::post('milestones/{milestone}/evidence', [MilestoneController::class, 'uploadEvidence'])->middleware('throttle:20,1');
        Route::post('milestones/{milestone}/submit', [MilestoneController::class, 'submit'])->middleware('throttle:20,1');
        Route::post('milestones/{milestone}/approve', [MilestoneController::class, 'approve'])->middleware('throttle:20,1');
        Route::post('milestones/{milestone}/reject', [MilestoneController::class, 'reject'])->middleware('throttle:30,1');

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
        });
    });
});
