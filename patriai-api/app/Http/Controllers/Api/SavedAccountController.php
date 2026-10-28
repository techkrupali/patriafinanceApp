<?php

namespace App\Http\Controllers\Api;

use App\Models\Organisation;
use App\Models\SavedAccount;
use App\Models\SavedAccountGroup;
use App\Services\MatrixBankingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Saved accounts (GIV-07 "Add a recipient, save for later", SND-16 "Choose saved
 * accounts"): bank accounts checked with the bank when added, or a verified
 * organisation's account, filed under a category and maybe in groups.
 */
class SavedAccountController extends ApiController
{
    public static function serialize(SavedAccount $a): array
    {
        return [
            'id' => $a->id,
            'nickname' => $a->nickname,
            'account_name' => $a->account_name,
            'account_number' => $a->account_number,
            'masked_number' => $a->maskedNumber(),
            'bank_code' => $a->bank_code,
            'bank_name' => $a->bank_name,
            'category' => $a->category,
            'verified' => $a->isVerified(),
            'organisation' => $a->organisation ? [
                'id' => $a->organisation->id,
                'kind' => $a->organisation->kind,
                'area' => $a->organisation->area,
                'state' => $a->organisation->state,
            ] : null,
            'groups' => $a->relationLoaded('groups') ? $a->groups->pluck('name') : [],
        ];
    }

    public static function serializeGroup(SavedAccountGroup $g): array
    {
        return [
            'id' => $g->id,
            'name' => $g->name,
            'accounts' => $g->accounts->map(fn (SavedAccount $a) => ['id' => $a->id, 'nickname' => $a->nickname, 'verified' => $a->isVerified()])->values(),
        ];
    }

    // GET /saved-accounts
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->ok('Saved accounts fetched', [
            'accounts' => SavedAccount::with(['organisation', 'groups'])->where('user_id', $user->id)->where('listed', true)->orderBy('nickname')->get()->map(fn ($a) => self::serialize($a))->values(),
            'groups' => SavedAccountGroup::with('accounts.organisation')->where('user_id', $user->id)->orderBy('name')->get()->map(fn ($g) => self::serializeGroup($g))->values(),
        ]);
    }

    // POST /saved-accounts  {organisation_id} | {account_number, bank_code, nickname?, category?, listed?, group?}
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'organisation_id' => ['nullable', 'integer'],
            'account_number' => ['required_without:organisation_id', 'nullable', 'digits:10'],
            'bank_code' => ['required_without:organisation_id', 'nullable', 'string', 'max:10'],
            'nickname' => ['nullable', 'string', 'max:80'],
            'category' => ['nullable', 'string', 'max:40'],
            'listed' => ['sometimes', 'boolean'],
            'group' => ['nullable', 'string', 'max:80'],
        ]);

        if (!empty($data['organisation_id'])) {
            $org = Organisation::where('active', true)->find((int) $data['organisation_id']);
            if (!$org) {
                return $this->fail('Organisation not found', 404);
            }
            $details = [
                'organisation_id' => $org->id,
                'account_name' => $org->account_name,
                'account_number' => $org->account_number,
                'bank_code' => $org->bank_code,
                'bank_name' => $org->bank_name,
                'nickname' => $data['nickname'] ?? $org->name,
                'category' => $data['category'] ?? 'institutions',
            ];
        } else {
            // "checked with the bank": the name comes from the bank, never from the user.
            try {
                $checked = MatrixBankingService::make()->verifyBankAccount($data['account_number'], $data['bank_code']);
            } catch (\RuntimeException $e) {
                return $this->fail($e->getMessage(), 422);
            }
            $name = trim("{$checked['first_name']} {$checked['last_name']}");
            $details = [
                'account_name' => $name,
                'account_number' => $data['account_number'],
                'bank_code' => $data['bank_code'],
                'bank_name' => $checked['bank_name'],
                'nickname' => trim((string) ($data['nickname'] ?? '')) ?: ucwords(strtolower($name)),
                'category' => strtolower(trim((string) ($data['category'] ?? 'family'))) ?: 'family',
            ];
        }

        $account = DB::transaction(function () use ($user, $details, $data) {
            $account = SavedAccount::updateOrCreate(
                ['user_id' => $user->id, 'bank_code' => $details['bank_code'], 'account_number' => $details['account_number']],
                $details + ['listed' => (bool) ($data['listed'] ?? true)],
            );
            if (!empty($data['group'])) {
                $group = SavedAccountGroup::firstOrCreate(['user_id' => $user->id, 'name' => trim($data['group'])]);
                $group->accounts()->syncWithoutDetaching([$account->id]);
            }

            return $account;
        });

        return $this->ok('Account saved', ['account' => self::serialize($account->load(['organisation', 'groups']))], 201);
    }

    // DELETE /saved-accounts/{savedAccount}
    public function destroy(Request $request, SavedAccount $savedAccount): JsonResponse
    {
        if ($savedAccount->user_id !== $request->user()->id) {
            return $this->fail('Account not found', 404);
        }
        // Kept for giving dates and history that still point at it; just not listed.
        $savedAccount->update(['listed' => false]);

        return $this->ok('Account removed');
    }

    // POST /saved-account-groups  {name, saved_account_ids}
    public function storeGroup(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'saved_account_ids' => ['required', 'array', 'min:2', 'max:20'],
            'saved_account_ids.*' => ['integer'],
        ]);
        $ids = SavedAccount::where('user_id', $user->id)->whereIn('id', $data['saved_account_ids'])->pluck('id');
        if ($ids->count() !== count(array_unique($data['saved_account_ids']))) {
            return $this->fail('Choose your own saved accounts', 422);
        }
        $group = SavedAccountGroup::firstOrCreate(['user_id' => $user->id, 'name' => trim($data['name'])]);
        $group->accounts()->sync($ids);

        return $this->ok('Group saved', ['group' => self::serializeGroup($group->load('accounts.organisation'))], 201);
    }
}
