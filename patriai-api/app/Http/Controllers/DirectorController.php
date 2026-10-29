<?php

namespace App\Http\Controllers;

use App\Models\VendorDirector;
use App\Services\VendorAccountService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * VON-05: a business's other director opens the link from their SMS and
 * verifies with their BVN and a selfie. No app or account needed; the link is
 * the key and stops working once they've sent their details.
 */
class DirectorController extends Controller
{
    // GET /d/{token}
    public function show(string $token): View
    {
        $director = $this->find($token);

        return view('vendor.director', ['director' => $director, 'profile' => $director?->vendorProfile, 'token' => $token]);
    }

    // POST /d/{token}  { bvn, selfie }
    public function store(Request $request, string $token): RedirectResponse
    {
        $director = $this->find($token) ?? abort(404);
        $data = $request->validate([
            'bvn' => ['required', 'digits:11'],
            'selfie' => ['required', 'image', 'max:10240'],
        ]);
        VendorAccountService::make()->directorVerified($director, $data['bvn'], $request->file('selfie'));

        return redirect("/d/{$token}")->with('status', 'Thank you. Patriai will check your details, usually within a day.');
    }

    private function find(string $token): ?VendorDirector
    {
        return strlen($token) === 40 ? VendorDirector::with('vendorProfile.user')->where('token', $token)->first() : null;
    }
}
