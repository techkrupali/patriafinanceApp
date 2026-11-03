<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\KycSubmission;
use App\Models\KycTier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Settings → Verification tiers: change a tier's limits, add a new tier on top
 * (Tier 4 …), or remove the top added tier when nobody is on it. The app reads
 * the same table (ME-11 My limits, ME-23 Account level, KYC).
 */
class AdminTierController extends ApiController
{
    /** Every tier with how many customers are on it. */
    public static function list(): array
    {
        $counts = User::where('role', 'user')->selectRaw('kyc_tier, count(*) as n')->groupBy('kyc_tier')->pluck('n', 'kyc_tier');
        $pending = KycSubmission::where('status', 'pending')->selectRaw('target_tier, count(*) as n')->groupBy('target_tier')->pluck('n', 'target_tier');

        return KycTier::orderBy('level')->get()->map(fn (KycTier $t) => [
            'tier' => $t->level,
            'name' => $t->name,
            'needs' => $t->needs,
            'description' => $t->description,
            'daily' => $t->daily,
            'single' => $t->single,
            'max_balance' => $t->max_balance,
            'max_wallets' => $t->max_wallets,
            'shared_wallets' => $t->shared_wallets,
            'loan_cap' => $t->loan_cap,
            'users' => (int) ($counts[$t->level] ?? 0) + ($t->level === 1 ? (int) ($counts[0] ?? 0) : 0),
            'pending' => (int) ($pending[$t->level] ?? 0),
            'base' => in_array($t->level, KycTier::BASE_LEVELS, true),
            'updated_at' => $t->updated_at?->toIso8601String(),
        ])->values()->all();
    }

    /** Naira in, kobo out; "no limit" is null. */
    private function payload(Request $request, bool $creating): array
    {
        $d = $request->validate([
            'name' => [$creating ? 'nullable' : 'sometimes', 'nullable', 'string', 'max:40'],
            'needs' => [$creating ? 'required' : 'sometimes', 'string', 'min:3', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:300'],
            'daily' => [$creating ? 'present' : 'sometimes', 'nullable', 'numeric', 'min:100', 'max:1000000000'],
            'single' => [$creating ? 'present' : 'sometimes', 'nullable', 'numeric', 'min:100', 'max:1000000000'],
            'max_balance' => [$creating ? 'present' : 'sometimes', 'nullable', 'numeric', 'min:1000', 'max:10000000000'],
            'max_wallets' => [$creating ? 'required' : 'sometimes', 'integer', 'between:1,100'],
            'shared_wallets' => [$creating ? 'required' : 'sometimes', 'boolean'],
            'loan_cap' => ['sometimes', 'numeric', 'min:0', 'max:1000000000'],
        ]);
        foreach (['daily', 'single', 'max_balance', 'loan_cap'] as $k) {
            if (array_key_exists($k, $d)) {
                $d[$k] = $d[$k] === null ? null : $this->toKobo($d[$k]);
            }
        }
        if (array_key_exists('loan_cap', $d) && $d['loan_cap'] === null) {
            $d['loan_cap'] = 0;
        }

        return $d;
    }

    private function guardOrder(array $t): void
    {
        if ($t['single'] !== null && $t['daily'] !== null && $t['single'] > $t['daily']) {
            throw ValidationException::withMessages(['single' => 'One payment can\'t be more than the daily limit.']);
        }
    }

    // POST /admin/tiers — "Add a tier" on top of the highest.
    public function store(Request $request): JsonResponse
    {
        $d = $this->payload($request, true);
        $level = KycTier::maxLevel() + 1;
        if ($level > 9) {
            throw ValidationException::withMessages(['tier' => 'There can be up to 9 tiers.']);
        }
        $d += ['loan_cap' => 0, 'description' => null];
        $d['name'] = trim((string) ($d['name'] ?? '')) ?: "Tier {$level}";
        $this->guardOrder($d);
        KycTier::create($d + ['level' => $level, 'updated_by' => $request->user()->id]);

        return $this->ok("Tier {$level} added", ['tiers' => self::list()], 201);
    }

    // PUT /admin/tiers/{level}
    public function update(Request $request, int $level): JsonResponse
    {
        $tier = KycTier::where('level', $level)->firstOrFail();
        $d = $this->payload($request, false);
        if (array_key_exists('name', $d)) {
            $d['name'] = trim((string) $d['name']) ?: "Tier {$level}";
        }
        $this->guardOrder(array_merge($tier->only(['daily', 'single']), $d));
        $tier->update($d + ['updated_by' => $request->user()->id]);

        return $this->ok("Tier {$level} saved", ['tiers' => self::list()]);
    }

    // DELETE /admin/tiers/{level} — only the top added tier, with nobody on it.
    public function destroy(int $level): JsonResponse
    {
        $tier = KycTier::where('level', $level)->firstOrFail();
        if (in_array($level, KycTier::BASE_LEVELS, true)) {
            throw ValidationException::withMessages(['tier' => 'Tiers 1 to 3 have their own steps in the app and can\'t be removed. Change their limits instead.']);
        }
        if ($level !== KycTier::maxLevel()) {
            throw ValidationException::withMessages(['tier' => 'Remove the highest tier first.']);
        }
        if (User::where('kyc_tier', '>=', $level)->exists()) {
            throw ValidationException::withMessages(['tier' => "Some customers are on Tier {$level}. Move them to another tier first."]);
        }
        if (KycSubmission::where('status', 'pending')->where('target_tier', $level)->exists()) {
            throw ValidationException::withMessages(['tier' => "Someone has asked for Tier {$level}. Approve or reject it first."]);
        }
        $tier->delete();

        return $this->ok("Tier {$level} removed", ['tiers' => self::list()]);
    }
}
