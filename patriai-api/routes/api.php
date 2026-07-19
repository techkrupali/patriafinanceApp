<?php

use App\Http\Controllers\Api\Admin\AdminController;
use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BankController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\FamilyController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\KycController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\MilestoneController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\SpousalSyncController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\WalletController;
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
    });

    // Banking rails webhook (server-to-server)
    Route::post('webhooks/banking', [WebhookController::class, 'banking']);

    // ---- Authenticated ----
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::put('profile', [ProfileController::class, 'update']);
        Route::post('profile/change-password', [ProfileController::class, 'changePassword']);
        Route::post('profile/change-pin', [ProfileController::class, 'changePin']);
        Route::post('profile/verify-pin', [ProfileController::class, 'verifyPin'])->middleware('throttle:10,1');
        Route::post('devices', [ProfileController::class, 'registerDevice']);
        Route::get('devices', [ProfileController::class, 'devices']);

        Route::get('dashboard', [DashboardController::class, 'index']);

        // Family Hub (aggregated people/invitations/stats across the user's wallets)
        Route::get('family', [FamilyController::class, 'index']);

        // Spousal Sync (two-person financial-transparency link)
        Route::get('sync', [SpousalSyncController::class, 'show']);
        Route::post('sync', [SpousalSyncController::class, 'store'])->middleware('throttle:20,1');
        Route::post('sync/{spousalSync}/respond', [SpousalSyncController::class, 'respond'])->middleware('throttle:30,1');
        Route::patch('sync/{spousalSync}', [SpousalSyncController::class, 'updateTransparency'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/pause', [SpousalSyncController::class, 'pause'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/resume', [SpousalSyncController::class, 'resume'])->middleware('throttle:30,1');
        Route::post('sync/{spousalSync}/end', [SpousalSyncController::class, 'end'])->middleware('throttle:30,1');

        Route::get('wallets', [WalletController::class, 'index']);
        Route::post('wallets', [WalletController::class, 'store']);
        Route::get('wallets/{wallet}', [WalletController::class, 'show']);
        Route::patch('wallets/{wallet}', [WalletController::class, 'updateSettings'])->middleware('throttle:30,1');
        Route::get('wallets/{wallet}/transactions', [WalletController::class, 'transactions']);
        Route::get('wallets/{wallet}/funding-details', [WalletController::class, 'fundingDetails']);
        Route::post('wallets/{wallet}/withdraw', [WalletController::class, 'withdraw'])->middleware('throttle:10,1');

        // Wallet members
        Route::get('wallets/{wallet}/members', [WalletMemberController::class, 'index']);
        Route::patch('wallets/{wallet}/members/{member}', [WalletMemberController::class, 'update'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/members/{member}', [WalletMemberController::class, 'destroy'])->middleware('throttle:30,1');

        // Wallet invitations
        Route::get('wallets/{wallet}/invitations', [InvitationController::class, 'walletIndex']);
        Route::post('wallets/{wallet}/invitations', [InvitationController::class, 'store'])->middleware('throttle:30,1');
        Route::delete('wallets/{wallet}/invitations/{invitation}', [InvitationController::class, 'cancel'])->middleware('throttle:30,1');
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

        // Loans (Patria Lending)
        Route::get('loans', [LoanController::class, 'index']);
        Route::get('loans/eligibility', [LoanController::class, 'eligibility']);
        Route::post('loans', [LoanController::class, 'store'])->middleware('throttle:20,1');
        Route::get('loans/{loan}', [LoanController::class, 'show']);
        Route::post('loans/{loan}/repay', [LoanController::class, 'repay'])->middleware('throttle:15,1');
        Route::post('loans/{loan}/cancel', [LoanController::class, 'cancel'])->middleware('throttle:30,1');

        // Vendor & Project System (escrow-backed milestones)
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store'])->middleware('throttle:20,1');
        Route::get('projects/{project}', [ProjectController::class, 'show']);
        Route::post('projects/{project}/cancel', [ProjectController::class, 'cancel'])->middleware('throttle:30,1');
        Route::post('projects/{project}/vendor', [ProjectController::class, 'assignVendor'])->middleware('throttle:30,1');
        Route::delete('projects/{project}/vendor', [ProjectController::class, 'removeVendor'])->middleware('throttle:30,1');
        Route::post('projects/{project}/milestones', [ProjectController::class, 'addMilestone'])->middleware('throttle:30,1');
        Route::delete('milestones/{milestone}', [ProjectController::class, 'removeMilestone'])->middleware('throttle:30,1');
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
        });
    });
});
