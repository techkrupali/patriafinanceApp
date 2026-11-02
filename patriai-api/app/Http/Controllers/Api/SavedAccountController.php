<?php

namespace App\Http\Controllers\Api;

use App\Models\GivingSchedule;
use App\Models\Organisation;
use App\Models\SavedAccount;
use App\Models\SavedAccountGroup;
use App\Models\Transaction;
use App\Models\Wallet;
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
            // SND-03 "Emeka Okafor · Family · Patriai · @emeka".
            'kind' => $a->isPatriai() ? 'patriai' : 'bank',
            'payee' => $a->isPatriai() && $a->payee ? ['id' => $a->payee->id, 'name' => $a->payee->fullName(), 'username' => $a->payee->username, 'avatar_url' => $a->payee->avatar_url] : null,
        ];
    }

    public static function serializeGroup(SavedAccountGroup $g): array
    {
        return [
            'id' => $g->id,
            'name' => $g->name,
            'accounts' => $g->accounts->map(fn (SavedAccount $a) => ['id' => $a->id, 'nickname' => $a->nickname, 'verified' => $a->isVerified(), 'share' => $a->pivot?->share !== null ? (int) $a->pivot->share : null, 'area' => $a->organisation?->area])->values(),
            // BEN-04 "Default split: Evenly · By % · Fixed amounts".
            'split' => $g->split ?? 'even',
            'split_label' => $g->splitLabel(),
        ];
    }

    // GET /saved-accounts
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return $this->ok('Saved accounts fetched', [
            'accounts' => SavedAccount::with(['organisation', 'groups', 'payee'])->where('user_id', $user->id)->where('listed', true)->orderBy('nickname')->get()->map(fn ($a) => self::serialize($a))->values(),
            'groups' => SavedAccountGroup::with('accounts.organisation')->where('user_id', $user->id)->orderBy('name')->get()->map(fn ($g) => self::serializeGroup($g))->values(),
        ]);
    }

    // POST /saved-accounts  {organisation_id} | {account_number, bank_code, nickname?, category?, listed?, group?}
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'organisation_id' => ['nullable', 'integer'],
            // A Patriai user: "@emeka", a phone number or an email.
            'identifier' => ['nullable', 'string', 'max:120'],
            'account_number' => ['required_without_all:organisation_id,identifier', 'nullable', 'digits:10'],
            'bank_code' => ['required_without_all:organisation_id,identifier', 'nullable', 'string', 'max:10'],
            'nickname' => ['nullable', 'string', 'max:80'],
            'category' => ['nullable', 'string', 'max:40'],
            'listed' => ['sometimes', 'boolean'],
            'group' => ['nullable', 'string', 'max:80'],
        ]);

        if (!empty($data['identifier'])) {
            $payee = $this->findPayee($data['identifier']);
            if (!$payee || $payee->id === $user->id) {
                return $this->fail('No one on Patriai has that @tag, phone or email.', 404);
            }
            $account = SavedAccount::updateOrCreate(
                ['user_id' => $user->id, 'payee_user_id' => $payee->id],
                [
                    'account_name' => $payee->fullName(),
                    'bank_name' => 'Patriai',
                    'nickname' => trim((string) ($data['nickname'] ?? '')) ?: $payee->fullName(),
                    'category' => strtolower(trim((string) ($data['category'] ?? 'family'))) ?: 'family',
                    'listed' => (bool) ($data['listed'] ?? true),
                ],
            );
            if (!empty($data['group'])) {
                SavedAccountGroup::firstOrCreate(['user_id' => $user->id, 'name' => trim($data['group'])])->accounts()->syncWithoutDetaching([$account->id]);
            }

            return $this->ok('Account saved', ['account' => self::serialize($account->load(['organisation', 'groups', 'payee']))], 201);
        }

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

    // GET /saved-accounts/{savedAccount} — BEN-03: paid this year, the next payment, the rules that pay it.
    public function show(Request $request, SavedAccount $savedAccount): JsonResponse
    {
        $user = $request->user();
        if ($savedAccount->user_id !== $user->id) {
            return $this->fail('Account not found', 404);
        }
        $paid = $this->payments($savedAccount, $user->id)->where('created_at', '>=', now('Africa/Lagos')->startOfYear()->utc());
        $rules = $this->rules($savedAccount);
        $next = $rules->filter(fn (GivingSchedule $r) => $r->enabled)
            ->map(fn (GivingSchedule $r) => ['rule' => $r, 'on' => $r->upcoming(now('Africa/Lagos')->startOfDay(), 1)->first()])
            ->filter(fn ($x) => $x['on'])->sortBy(fn ($x) => $x['on']->timestamp)->first();

        return $this->ok('Saved account', [
            'account' => self::serialize($savedAccount->load(['organisation', 'groups', 'payee'])),
            'paid_this_year' => number_format((int) (clone $paid)->sum('amount') / 100, 2, '.', ''),
            'payments_this_year' => (clone $paid)->count(),
            'next_payment' => $next ? ['on' => $next['on']->toDateString(), 'amount' => number_format($next['rule']->amount / 100, 2, '.', ''), 'label' => $next['rule']->label] : null,
            'rules' => $rules->map(fn (GivingSchedule $r) => ['id' => $r->id, 'label' => $r->label, 'amount' => number_format($r->amount / 100, 2, '.', ''), 'when' => $r->when(), 'enabled' => (bool) $r->enabled, 'wallet' => $r->wallet?->name])->values(),
        ]);
    }

    // PATCH /saved-accounts/{savedAccount}  {nickname?, category?}
    public function update(Request $request, SavedAccount $savedAccount): JsonResponse
    {
        if ($savedAccount->user_id !== $request->user()->id) {
            return $this->fail('Account not found', 404);
        }
        $data = $request->validate([
            'nickname' => ['sometimes', 'string', 'min:1', 'max:80'],
            'category' => ['sometimes', 'string', 'min:1', 'max:40'],
        ]);
        $savedAccount->update(array_filter([
            'nickname' => isset($data['nickname']) ? trim($data['nickname']) : null,
            'category' => isset($data['category']) ? strtolower(trim($data['category'])) : null,
        ]));

        return $this->ok('Account updated', ['account' => self::serialize($savedAccount->load(['organisation', 'groups', 'payee']))]);
    }

    // DELETE /saved-accounts/{savedAccount}  {rules?: pause|delete} — BEN-05 "1 rule pays this account".
    public function destroy(Request $request, SavedAccount $savedAccount): JsonResponse
    {
        if ($savedAccount->user_id !== $request->user()->id) {
            return $this->fail('Account not found', 404);
        }
        $data = $request->validate(['rules' => ['nullable', 'in:pause,delete']]);
        $rules = $this->rules($savedAccount);
        if ($rules->where('enabled', true)->isNotEmpty() && empty($data['rules'])) {
            return $this->fail('Rules still pay this account. Pause them or delete them too.', 422, ['rules' => $rules->count()]);
        }
        DB::transaction(function () use ($savedAccount, $rules, $data) {
            foreach ($rules as $rule) {
                ($data['rules'] ?? null) === 'delete' ? $rule->delete() : $rule->update(['enabled' => false]);
            }
            // Kept for giving dates and history that still point at it; just not listed.
            $savedAccount->update(['listed' => false]);
            $savedAccount->groups()->detach();
        });

        return $this->ok('Account removed', ['rules' => $rules->count()]);
    }

    // GET /saved-account-groups/{group} — BEN-04.
    public function showGroup(Request $request, SavedAccountGroup $group): JsonResponse
    {
        if ($group->user_id !== $request->user()->id) {
            return $this->fail('Group not found', 404);
        }

        return $this->ok('Group', ['group' => self::serializeGroup($group->load('accounts.organisation'))]);
    }

    // PATCH /saved-account-groups/{group}  {name?, split?, shares?: {id: share}, saved_account_ids?}
    public function updateGroup(Request $request, SavedAccountGroup $group): JsonResponse
    {
        $user = $request->user();
        if ($group->user_id !== $user->id) {
            return $this->fail('Group not found', 404);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80'],
            'split' => ['sometimes', 'in:' . implode(',', SavedAccountGroup::SPLITS)],
            'shares' => ['sometimes', 'array'],
            'shares.*' => ['numeric', 'min:0'],
            'saved_account_ids' => ['sometimes', 'array', 'min:2', 'max:20'],
            'saved_account_ids.*' => ['integer'],
        ]);
        if (isset($data['saved_account_ids'])) {
            $ids = SavedAccount::where('user_id', $user->id)->where('listed', true)->whereIn('id', $data['saved_account_ids'])->pluck('id');
            if ($ids->count() !== count(array_unique($data['saved_account_ids']))) {
                return $this->fail('Choose your own saved accounts', 422);
            }
            $group->accounts()->sync($ids);
        }
        $split = $data['split'] ?? $group->split;
        if ($split !== 'even' && isset($data['shares'])) {
            $ids = $group->accounts()->pluck('saved_accounts.id')->all();
            $shares = collect($data['shares'])->only(array_map('strval', $ids));
            if ($shares->count() !== count($ids)) {
                return $this->fail('Give every account in the group a share.', 422);
            }
            if ($split === 'percent' && (int) round($shares->sum()) !== 100) {
                return $this->fail('The percentages need to add up to 100.', 422);
            }
            foreach ($shares as $id => $share) {
                $group->accounts()->updateExistingPivot((int) $id, ['share' => $split === 'fixed' ? $this->toKobo((string) $share) : (int) round($share)]);
            }
        }
        $group->update(array_filter(['name' => isset($data['name']) ? trim($data['name']) : null, 'split' => $split]));

        return $this->ok('Group saved', ['group' => self::serializeGroup($group->fresh()->load('accounts.organisation'))]);
    }

    /** The person's payments to this saved account (bank by account number, Patriai user by their Main). */
    private function payments(SavedAccount $account, int $userId)
    {
        $wallets = Wallet::where('user_id', $userId)->pluck('id');
        $q = Transaction::whereIn('wallet_id', $wallets)->where('direction', 'debit')->where('status', 'successful');
        if ($account->isPatriai()) {
            return $q->where('counterparty->wallet_id', (int) $account->payee?->mainWallet()?->id);
        }

        return $q->where('counterparty->account_number', $account->account_number);
    }

    /** Rules that pay this account, alone or in a group (giving schedules today). */
    private function rules(SavedAccount $account)
    {
        $groups = $account->groups()->pluck('saved_account_groups.id');

        return GivingSchedule::with('wallet')->where(fn ($q) => $q->where('saved_account_id', $account->id)->orWhereIn('group_id', $groups))->get();
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
