<?php

use App\Http\Controllers\AppLinkController;
use App\Http\Controllers\DirectorController;
use App\Http\Controllers\GoalLinkController;
use App\Http\Controllers\TrustedContactController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// EMG-05: an emergency fund's trusted contact opens the secure link from their SMS.
Route::get('/e/{token}', [TrustedContactController::class, 'show'])->middleware('throttle:30,1');
Route::post('/e/{token}', [TrustedContactController::class, 'store'])->middleware('throttle:10,1');
// INV-T1 / INV-T2: accept (with the texted code) or decline being a trusted contact.
Route::post('/e/{token}/accept', [TrustedContactController::class, 'accept'])->middleware('throttle:10,1');
Route::post('/e/{token}/decline', [TrustedContactController::class, 'decline'])->middleware('throttle:10,1');

// GLW-04 contribution link: anyone with it can add money to a goal.
Route::get('/g/{slug}', [GoalLinkController::class, 'show'])->middleware('throttle:60,1')->where('slug', '[a-z0-9-]+');

// VON-05: another director verifies with their BVN and a selfie from the SMS link.
Route::get('/d/{token}', [DirectorController::class, 'show'])->middleware('throttle:30,1');
Route::post('/d/{token}', [DirectorController::class, 'store'])->middleware('throttle:10,1');


// SYS-08: links in SMS and WhatsApp hand over to the app (referral, invitation, a request).
Route::get('/join/{code}', [AppLinkController::class, 'referral'])->middleware('throttle:60,1')->where('code', '[A-Za-z0-9_-]{3,32}');
// REQ-02 "patriai.app/r/N3V8": anyone can pay a money request, even without the app.
Route::get('/r/{code}', [AppLinkController::class, 'moneyRequest'])->middleware('throttle:60,1')->where('code', '[A-Za-z0-9]{4,12}');
Route::get('/i', [AppLinkController::class, 'invite'])->middleware('throttle:60,1');
// INV-02 "patriai.app/i/K7Q2": the invite's own link (INV-04 when it has expired).
Route::get('/i/{code}', [AppLinkController::class, 'inviteCode'])->middleware('throttle:60,1')->where('code', '[A-Za-z0-9]{4,12}');
// "Ask Ngozi for a new invite" from an expired, declined or cancelled invite's page.
Route::post('/i/{code}/ask', [AppLinkController::class, 'askAgain'])->middleware('throttle:10,1')->where('code', '[A-Za-z0-9]{4,12}');
Route::get('/a/{id}', [AppLinkController::class, 'request'])->middleware('throttle:60,1')->where('id', '[0-9]{1,10}');
Route::get('/p/{tag}', [AppLinkController::class, 'pay'])->middleware('throttle:60,1')->where('tag', '@?[A-Za-z0-9_.]{2,30}');

// CHD-09: the photo a child sent of a task done, from a 30-minute signed link.
Route::get('/child-task-photos/{task}', [\App\Http\Controllers\Api\ChildController::class, 'taskPhoto'])->name('child-task.photo')->middleware(['signed', 'throttle:60,1']);

// BRK-05: a donation receipt, from a 10-minute signed link the app asked for.
Route::get('/donation-receipts/{donation}', [\App\Http\Controllers\Api\EarlyBreakController::class, 'receipt'])->name('donation.receipt')->middleware(['signed', 'throttle:30,1']);

// TXN-03: a receipt download, from a 10-minute signed link the app asked for.
Route::get('/receipts/{transaction}', [\App\Http\Controllers\Api\PaymentsController::class, 'receipt'])->name('transaction.receipt')->middleware(['signed', 'throttle:30,1']);
