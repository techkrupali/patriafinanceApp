<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Services\ChildService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** CHW-06 "KMS-4821 · Code expires in 9:41": codes to link a child's own phone. */
class ChildController extends ApiController
{
    // POST /children/link-code  {first_name} — shown during setup, held for 10 minutes.
    public function reserve(Request $request): JsonResponse
    {
        $data = $request->validate(['first_name' => ['required', 'string', 'max:60']]);

        return $this->ok('Code ready', ChildService::make()->reserveCode($request->user(), $data['first_name']));
    }

    // POST /wallets/{wallet}/child/link-code — a new code to link later (WCR-07 "Edit").
    public function renew(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->type !== 'child' || !in_array($wallet->roleOf($request->user()), ['owner', 'co_owner'], true)) {
            return $this->fail('Child wallet not found', 404);
        }

        return $this->ok('New code ready', ChildService::make()->newCode($wallet, $request->user()));
    }
}
