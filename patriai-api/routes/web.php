<?php

use App\Http\Controllers\DirectorController;
use App\Http\Controllers\GoalLinkController;
use App\Http\Controllers\Api\WalletManageController;
use App\Http\Controllers\TrustedContactController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// EMG-05: an emergency fund's trusted contact opens the secure link from their SMS.
Route::get('/e/{token}', [TrustedContactController::class, 'show'])->middleware('throttle:30,1');
Route::post('/e/{token}', [TrustedContactController::class, 'store'])->middleware('throttle:10,1');

// GLW-04 contribution link: anyone with it can add money to a goal.
Route::get('/g/{slug}', [GoalLinkController::class, 'show'])->middleware('throttle:60,1')->where('slug', '[a-z0-9-]+');

// VON-05: another director verifies with their BVN and a selfie from the SMS link.
Route::get('/d/{token}', [DirectorController::class, 'show'])->middleware('throttle:30,1');
Route::post('/d/{token}', [DirectorController::class, 'store'])->middleware('throttle:10,1');

// WAL-15: a statement download, from a 10-minute signed link the app asked for.
Route::get('/statements/{wallet}', [WalletManageController::class, 'download'])->name('wallet.statement')->middleware(['signed', 'throttle:30,1']);
