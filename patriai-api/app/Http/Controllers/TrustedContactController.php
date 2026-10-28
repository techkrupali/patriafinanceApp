<?php

namespace App\Http\Controllers;

use App\Models\EmergencyTrustedContact;
use App\Services\EmergencyService;
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
    // GET /e/{token}
    public function show(string $token): View
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);

        return view('emergency.trusted', EmergencyService::make()->trustedView($contact) + ['token' => $token]);
    }

    // POST /e/{token}  { note?, proof? }
    public function store(Request $request, string $token): RedirectResponse
    {
        $contact = EmergencyTrustedContact::findByToken($token) ?? abort(404);
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
