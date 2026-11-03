<?php

namespace App\Http\Controllers;

use App\Models\EmergencyTrustedContact;
use App\Services\EmergencyService;
use App\Services\NotificationService;
use App\Services\OtpService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * EMG-05 trusted contacts: the page behind the secure link in their SMS. No app
 * or account — the link is the key. They can ask the keyholders for a release
 * and add proof, as the fund's owner allowed; the keyholders still decide.
 */
class TrustedContactController extends Controller
{
    private const OTP_PURPOSE = 'trusted_contact';

    // GET /e/{token} — INV-T1 the first time (accept or decline), then the fund.
    public function show(string $token): View
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);
        if ($contact->declined_at || !$contact->accepted_at) {
            $otp = app(OtpService::class);
            // "Code sent to 0803 •••• 214" — once, then the usual wait before another.
            if (!$contact->declined_at && $otp->cooldown($contact->phone, self::OTP_PURPOSE, 'sms') === 0) {
                $otp->issue($contact->phone, self::OTP_PURPOSE, 'sms');
            }

            return view('emergency.trusted_invite', [
                'contact' => $contact,
                'wallet' => $contact->wallet,
                'owner' => $contact->wallet->owner,
                'token' => $token,
                'state' => $contact->declined_at ? 'declined' : 'invite',
                'masked' => strlen($contact->phone) > 6 ? '0' . substr(preg_replace('/^\+?234/', '', $contact->phone), 0, 3) . ' •••• ' . substr($contact->phone, -3) : $contact->phone,
                'can_see_balance' => (bool) $contact->wallet->emergencySetting?->trusted_can_see_balance,
            ]);
        }

        return view('emergency.trusted', EmergencyService::make()->trustedView($contact) + ['token' => $token]);
    }

    // POST /e/{token}/accept {code} — INV-T1 "Accept" → INV-T2 "Thank you, Dr Chika".
    public function accept(Request $request, string $token): RedirectResponse
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);
        $data = $request->validate(['code' => ['required', 'string', 'max:10']]);
        try {
            app(OtpService::class)->verify($contact->phone, self::OTP_PURPOSE, trim($data['code']));
        } catch (ValidationException $e) {
            return redirect("/e/{$token}")->withErrors(['code' => collect($e->errors())->flatten()->first()]);
        }
        $contact->update(['accepted_at' => now(), 'declined_at' => null]);
        if ($owner = $contact->wallet->owner) {
            NotificationService::make()->push($owner, 'trusted_contact_accepted', "{$contact->name} is your trusted contact", "For {$contact->wallet->name}. They can start a request if you can't.", ['wallet_id' => $contact->wallet_id]);
        }

        return redirect("/e/{$token}")->with('accepted', true);
    }

    // POST /e/{token}/decline — INV-T1 "Decline", or "stop being a trusted contact" later.
    public function decline(string $token): RedirectResponse
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);
        $was = (bool) $contact->accepted_at;
        $contact->update(['declined_at' => now(), 'accepted_at' => null]);
        if ($owner = $contact->wallet->owner) {
            NotificationService::make()->push($owner, 'trusted_contact_declined', $was ? "{$contact->name} stopped being a trusted contact" : "{$contact->name} declined to be a trusted contact", "For {$contact->wallet->name}. You can add someone else in its emergency rules.", ['wallet_id' => $contact->wallet_id]);
        }

        return redirect("/e/{$token}");
    }

    // POST /e/{token}  { note?, proof? }
    public function store(Request $request, string $token): RedirectResponse
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);
        if (!$contact->accepted_at) {
            return redirect("/e/{$token}")->withErrors(['contact' => 'Accept first, with the code we texted you.']);
        }
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
            'proof' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'],
        ]);

        try {
            EmergencyService::make()->trustedRequest($contact, $data['note'] ?? null, $request->file('proof'));
        } catch (ValidationException $e) {
            return redirect("/e/{$token}")->withErrors($e->errors())->withInput();
        }

        return redirect("/e/{$token}")->with('status', 'The keyholders have been told. They decide together.');
    }
}
