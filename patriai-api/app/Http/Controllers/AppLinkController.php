<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\View\View;

/**
 * SYS-08: the web side of a Patriai link. SMS and WhatsApp only make https
 * links tappable, so /join, /i, /a and /p open this page, which hands over to
 * the app (patriai://…) where the link opens the right screen after the PIN.
 * Nothing private is shown here: no names on approvals, no amounts. A money
 * request (/r) is meant for the person asked, so it shows who and how much.
 */
class AppLinkController extends Controller
{
    // GET /join/{code} — a referral code, filled in at sign-up.
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

    // GET /i/{code} — INV-02 "Ngozi Okafor invited you to join School fees 2027", or INV-04 expired.
    public function inviteCode(string $code): View
    {
        $flow = \App\Services\InviteFlowService::make();
        $invitation = \App\Models\WalletInvitation::with(['wallet', 'inviter'])->where('code', strtoupper($code))->first() ?? abort(404);
        $flow->markOpened($invitation);
        $p = $flow->preview($invitation);
        $first = $p['inviter']['first_name'] ?? 'they';
        $path = 'i/' . $invitation->code;
        $intent = fn (string $path) => 'intent://' . $path . '#Intent;scheme=patriai;package=com.patriai.app;end';
        [$title, $body] = match ($p['status']) {
            'pending' => ["{$p['inviter']['name']} invited you to join {$p['wallet']['name']}", ''],
            'accepted' => ['This invite has been used', "It was accepted already. Open Patriai to see {$p['wallet']['name']}."],
            'declined' => ['This invite was declined', "Ask {$first} to send a new one if you changed your mind."],
            'cancelled' => ['This invite was cancelled', "Ask {$first} to send a new one."],
            default => ['This invite has expired', "Invites last 7 days. Ask {$first} to send a new one. We can remind them for you."],
        };

        return view('link.invite', [
            'state' => $p['status'] === 'pending' ? 'open' : 'closed',
            'url' => preg_replace('#^https?://#', '', (string) $invitation->link()),
            'title' => $title,
            'body' => $body,
            'inviter' => $p['inviter']['name'] ?? 'Someone',
            'initials' => collect(explode(' ', (string) ($p['inviter']['name'] ?? '?')))->map(fn ($w) => mb_substr($w, 0, 1))->take(2)->join(''),
            'wallet' => $p['wallet']['name'],
            'role' => $p['role_label'],
            'can' => $p['can'],
            'cannot' => $p['cannot'],
            'note' => $p['note'],
            'appUrl' => 'patriai://' . $path,
            'androidUrl' => $intent($path),
            'declineUrl' => 'patriai://' . $path . '?decline=1',
            'first' => $first,
            'code' => $invitation->code,
            'canAsk' => $p['status'] !== 'accepted' && $invitation->inviter_id !== null,
            'androidDeclineUrl' => $intent($path . '?decline=1'),
        ]);
    }

    // POST /i/{code}/ask — the page of a closed invite tells the inviter someone wants a new one.
    public function askAgain(string $code): \Illuminate\Http\RedirectResponse
    {
        $invitation = \App\Models\WalletInvitation::with(['wallet', 'inviter'])->where('code', strtoupper($code))->first() ?? abort(404);
        $back = redirect('/i/' . $invitation->code);
        if ($invitation->status === 'pending' && !$invitation->isExpired()) {
            return $back;
        }
        try {
            \App\Services\InviteFlowService::make()->askAgain($invitation, null);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return $back->withErrors($e->errors());
        }

        return $back->with('asked', true);
    }

    // GET /a/{id} — a request waiting for your yes.
    public function request(int $id): View
    {
        return $this->page('request/' . $id, 'Someone needs your yes', 'Open the request in Patriai to approve or decline it.');
    }

    // GET /p/{tag}?amount= — QR-01 "Show this to get paid".
    public function pay(\Illuminate\Http\Request $request, string $tag): View
    {
        $owner = User::whereRaw('lower(username) = ?', [strtolower(ltrim($tag, '@'))])->where('status', 'active')->first();
        $amount = preg_match('/^\d+(\.\d{1,2})?$/', (string) $request->query('amount')) ? (string) $request->query('amount') : null;

        return $this->page('pay/' . ltrim($tag, '@') . ($amount ? "?amount={$amount}" : ''), $owner ? "Pay {$owner->first_name} on Patriai" : 'Pay on Patriai', $amount ? 'They asked for ₦' . number_format((float) $amount) . '. Open Patriai to check and pay with your PIN.' : 'Open Patriai to choose how much and pay with your PIN.');
    }

    // GET /r/{code} — REQ-02 a money request: pay in the app, or by bank transfer with the code.
    public function moneyRequest(string $code): View
    {
        $found = \App\Models\MoneyRequest::with(['requester', 'wallet'])->where('code', strtoupper($code))->first() ?? abort(404);
        $wallet = $found->wallet;
        if ($found->status === 'pending' && $wallet && !$wallet->virtual_account) {
            \App\Services\WalletService::make()->ensureVirtualAccount($wallet);
            $wallet->refresh();
        }

        return view('link.request', [
            'request' => $found,
            'first' => $found->requester->first_name,
            'amount' => '₦' . number_format($found->left() / 100),
            'appUrl' => 'patriai://r/' . $found->code,
            'androidUrl' => 'intent://r/' . $found->code . '#Intent;scheme=patriai;package=com.patriai.app;end',
            'account_number' => $wallet?->virtual_account,
            'bank' => $wallet?->virtual_account_bank,
            'account_name' => $wallet ? 'PATRIAI/' . strtoupper($wallet->owner->fullName()) : null,
        ]);
    }

    private function page(string $path, string $title, string $body): View
    {
        return view('link.open', ['appUrl' => 'patriai://' . $path, 'androidUrl' => 'intent://' . $path . '#Intent;scheme=patriai;package=com.patriai.app;end', 'title' => $title, 'body' => $body]);
    }
}
