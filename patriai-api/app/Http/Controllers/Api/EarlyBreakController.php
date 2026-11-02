<?php

namespace App\Http\Controllers\Api;

use App\Models\ApprovalRequest;
use App\Models\CharityDonation;
use App\Models\Organisation;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\URL;

/**
 * BRK-03 a charity's profile, BRK-05 "₦47,500 is in Main · ₦1,250 went to
 * Hope Harbour" with its donation receipt, and WPV-09 "Ask Ngozi for more
 * access". Breaking savings early itself is a transfer out of the wallet
 * (POST /transfers): the fee and the charity's half are taken there.
 */
class EarlyBreakController extends ApiController
{
    // GET /organisations/{organisation} — BRK-03
    public function organisation(Organisation $organisation): JsonResponse
    {
        if (!$organisation->active) {
            return $this->fail('Not found', 404);
        }
        $given = (int) CharityDonation::where('organisation_id', $organisation->id)->whereYear('created_at', now()->year)->sum('amount');

        return $this->ok('Organisation', OrganisationController::serialize($organisation) + [
            'since' => $organisation->created_at?->year,
            'given_this_year' => number_format($given / 100, 2, '.', ''),
        ]);
    }

    // GET /early-breaks/{reference} — BRK-05, for the person who took it out.
    public function show(Request $request, string $reference): JsonResponse
    {
        $user = $request->user();
        $out = Transaction::with('wallet')->where('reference', $reference)->where('user_id', $user->id)->where('direction', 'debit')->first();
        if (!$out || !$out->wallet) {
            return $this->fail('Not found', 404);
        }
        $fee = Transaction::where('wallet_id', $out->wallet_id)->where('type', 'fee')->where('counterparty->break_reference', $reference)->first();
        $donation = $fee ? CharityDonation::with('organisation')->where('transaction_id', $fee->id)->first() : null;
        $approval = ApprovalRequest::with('responses.approver')->where('executed_transaction_reference', $reference)->first();
        $wallet = $out->wallet->fresh();
        $yes = $approval?->responses->where('decision', 'approve')->sortBy('created_at')->last();

        return $this->ok('Early break', [
            'reference' => $out->reference,
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'balance' => number_format($wallet->balance / 100, 2, '.', ''), 'locked' => $wallet->isGoalLocked()],
            'to' => $out->counterparty['wallet_name'] ?? null,
            'taken_out' => number_format(($out->amount + ($fee?->amount ?? 0)) / 100, 2, '.', ''),
            'received' => number_format($out->amount / 100, 2, '.', ''),
            'fee' => number_format(($fee?->amount ?? 0) / 100, 2, '.', ''),
            'charity' => $donation ? [
                'donation_id' => $donation->id,
                'name' => $donation->organisation?->name,
                'amount' => number_format($donation->amount / 100, 2, '.', ''),
                'receipt_no' => $donation->receipt_no,
            ] : null,
            'approved_by' => $yes?->approver ? ['name' => $yes->approver->first_name, 'at' => $yes->created_at?->toIso8601String()] : null,
            'at' => $out->created_at?->toIso8601String(),
        ]);
    }

    // POST /donations/{donation}/receipt-link — a 10-minute link to the PDF.
    public function receiptLink(Request $request, CharityDonation $donation): JsonResponse
    {
        if ($donation->user_id !== $request->user()->id) {
            return $this->fail('Not found', 404);
        }

        return $this->ok('Receipt ready', ['url' => URL::temporarySignedRoute('donation.receipt', now()->addMinutes(10), ['donation' => $donation->id])]);
    }

    // GET /donation-receipts/{donation}?signature=… (web, signed) — BRK-05 "Download donation receipt"
    public function receipt(CharityDonation $donation): \Illuminate\Http\Response
    {
        $donation->load(['organisation', 'user']);
        $pdf = new \App\Support\SimplePdf();
        $pdf->text('Patriai · Donation receipt', 16, true);
        $pdf->gap(8);
        foreach ([
            'Receipt' => $donation->receipt_no,
            'Charity' => $donation->organisation?->name ?? '—',
            'Amount' => '₦' . number_format($donation->amount / 100, 2),
            'From' => $donation->user?->fullName() ?? '—',
            'Given as' => 'Half of an early-break fee on savings',
            'Date' => $donation->created_at?->setTimezone('Africa/Lagos')->format('j M Y, g:i a'),
            'Status' => $donation->status === 'paid' ? 'Paid to the charity' : 'Owed to the charity, paid out monthly',
        ] as $label => $value) {
            $pdf->columns([$label, (string) $value], [140, 360], 11);
        }
        $pdf->gap(12);
        $pdf->rule();
        $pdf->text('Counts in your giving statement · Patriai Technologies', 9);

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="patriai-donation-' . $donation->receipt_no . '.pdf"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    // POST /wallets/{wallet}/access-request — WPV-09 "Ask Ngozi for more access", once a day.
    public function askForAccess(Request $request, Wallet $wallet): JsonResponse
    {
        $data = $request->validate(['message' => ['nullable', 'string', 'max:300']]);
        $user = $request->user();
        if ($wallet->user_id === $user->id || !$wallet->isAccessibleBy($user)) {
            return $this->fail('Wallet not found', 404);
        }
        if (!Cache::add("access-request:{$wallet->id}:{$user->id}", 1, now()->addDay())) {
            return $this->fail("You asked today. {$wallet->owner->first_name} will see it.", 429);
        }
        NotificationService::make()->push($wallet->owner, 'access_requested', "{$user->first_name} asked for more access", ($data['message'] ?? null) ? "On {$wallet->name}: \"{$data['message']}\"" : "On {$wallet->name}. You can change what they can do in Members.", ['wallet_id' => $wallet->id, 'user_id' => $user->id]);

        return $this->ok('Asked', ['owner' => $wallet->owner->first_name]);
    }
}
