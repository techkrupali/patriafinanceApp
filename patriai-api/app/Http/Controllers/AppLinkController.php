<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\View\View;

/**
 * SYS-08: the web side of a Patriai link. SMS and WhatsApp only make https
 * links tappable, so /r, /i and /a open this page, which hands over to the
 * app (patriai://…) where the link opens the right screen after the PIN.
 * Nothing private is shown here: no names on requests, no amounts.
 */
class AppLinkController extends Controller
{
    // GET /r/{code} — a referral code, filled in at sign-up.
    public function referral(string $code): View
    {
        $owner = User::whereRaw('lower(referral_code) = ?', [strtolower($code)])->where('status', 'active')->first();

        return $this->page('ref/' . strtoupper($code), $owner ? "{$owner->first_name} invited you to Patriai" : 'You were invited to Patriai', 'Use code ' . strtoupper($code) . ' when you sign up, and you both get ₦500 when you create a shared wallet.');
    }

    // GET /i — a family wallet invitation.
    public function invite(): View
    {
        return $this->page('invite', 'You have a family wallet invitation', 'Open Patriai and sign in with the number or email the invite was sent to.');
    }

    // GET /a/{id} — a request waiting for your yes.
    public function request(int $id): View
    {
        return $this->page('request/' . $id, 'Someone needs your yes', 'Open the request in Patriai to approve or decline it.');
    }

    private function page(string $path, string $title, string $body): View
    {
        return view('link.open', ['appUrl' => 'patriai://' . $path, 'androidUrl' => 'intent://' . $path . '#Intent;scheme=patriai;package=com.patriai.app;end', 'title' => $title, 'body' => $body]);
    }
}
