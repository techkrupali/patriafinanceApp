<?php

use App\Http\Controllers\Api\Admin\AdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BankController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\WalletController;
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

        Route::get('wallets', [WalletController::class, 'index']);
        Route::post('wallets', [WalletController::class, 'store']);
        Route::get('wallets/{wallet}', [WalletController::class, 'show']);
        Route::get('wallets/{wallet}/transactions', [WalletController::class, 'transactions']);
        Route::get('wallets/{wallet}/funding-details', [WalletController::class, 'fundingDetails']);
        Route::post('wallets/{wallet}/withdraw', [WalletController::class, 'withdraw'])->middleware('throttle:10,1');

        Route::post('transfers', [TransferController::class, 'store'])->middleware('throttle:20,1');

        Route::get('banks', [BankController::class, 'index']);
        Route::post('banks/verify-account', [BankController::class, 'verifyAccount'])->middleware('throttle:20,1');

        // ---- Admin ----
        Route::prefix('admin')->middleware('admin')->group(function () {
            Route::get('stats', [AdminController::class, 'stats']);
            Route::get('users', [AdminController::class, 'users']);
            Route::get('users/{user}', [AdminController::class, 'user']);
            Route::patch('users/{user}/status', [AdminController::class, 'updateUserStatus']);
            Route::get('wallets', [AdminController::class, 'wallets']);
            Route::get('transactions', [AdminController::class, 'transactions']);
        });
    });
});
