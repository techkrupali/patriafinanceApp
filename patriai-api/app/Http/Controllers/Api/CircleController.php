<?php

namespace App\Http\Controllers\Api;

use App\Models\Circle;
use App\Models\CircleMember;
use App\Models\User;
use App\Models\Wallet;
use App\Services\CircleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Family circles: HOM-06 switcher, FAM-02/07/08/09/10/11/12. */
class CircleController extends ApiController
{
    private function svc(): CircleService
    {
        return CircleService::make();
    }

    // GET /circles — HOM-06 "Your circles".
    public function index(Request $request): JsonResponse
    {
        return $this->ok('Circles', ['circles' => $this->svc()->forUser($request->user())]);
    }

    // POST /circles — FAM-11 "New circle".
    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:60'],
            'kind' => ['required', Rule::in(array_diff(Circle::KINDS, ['family']))],
            'purpose' => ['nullable', 'string', 'max:160'],
        ]);
        $circle = $this->svc()->create($request->user(), $d['name'], $d['kind'], $d['purpose'] ?? null);

        return $this->ok("{$circle->name} is ready", ['circle' => $this->svc()->describe($circle, $request->user())], 201);
    }

    // GET /circles/{circle}/view — FAM-02 "Who is in which wallet".
    public function view(Request $request, int $circle): JsonResponse
    {
        $user = $request->user();
        $c = $this->svc()->resolve($user, $circle ?: null);
        $wallets = $this->svc()->visibleWallets($c, $user);
        $people = $this->svc()->people($c, $user, $this->svc()->universe($c, $user));
        $everyone = collect([$user])->merge(collect($people)->pluck('user'))->values();
        $owner = $c->owner_id;
        $everyone = $everyone->sortBy(fn (User $u) => $u->id === $owner ? 0 : ($u->id === $user->id ? 1 : 2))->values();
        $about = $this->svc()->describe($c, $user);
        $initials = fn (User $u) => mb_strtoupper(implode('', array_map(fn ($p) => mb_substr($p, 0, 1), array_slice(preg_split('/\s+/', trim($u->fullName())) ?: [], 0, 2))));

        return $this->ok('Circle', [
            'circle' => $about,
            'people' => $everyone->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->fullName(),
                'short' => $u->id === $user->id ? 'You' : $u->first_name,
                'initials' => $initials($u),
            ])->all(),
            'wallets' => $wallets->map(fn (Wallet $w) => [
                'id' => $w->id,
                'name' => $w->name,
                'type' => $w->type,
                'balance' => $about['sees_all'] || $w->user_id === $user->id ? number_format($w->balance / 100, 2, '.', '') : null,
                'in' => $everyone->filter(fn (User $u) => $w->user_id === $u->id || $w->members->contains('user_id', $u->id))->pluck('id')->values()->all(),
            ])->all(),
        ]);
    }

    // GET /circles/{circle}/members/{user} — FAM-07.
    public function member(Request $request, int $circle, User $member): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);

        return $this->ok('Member', $this->svc()->member($c, $request->user(), $member));
    }

    // PUT /circles/{circle}/members/{user}/role — FAM-08.
    public function role(Request $request, int $circle, User $member): JsonResponse
    {
        $d = $request->validate([
            'role' => ['required', Rule::in(array_keys(CircleMember::DEFAULTS))],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['boolean'],
        ]);
        $c = $this->svc()->resolve($request->user(), $circle ?: null);
        $res = $this->svc()->setRole($c, $request->user(), $member, $d['role'], $d['permissions']);

        return $this->ok('Saved', $res + ['member' => $this->svc()->member($c, $request->user(), $member)]);
    }

    // GET /circles/{circle}/members/{user}/remove — FAM-09 sheet.
    public function removePreview(Request $request, int $circle, User $member): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);

        return $this->ok('Remove', $this->svc()->removePreview($c, $request->user(), $member));
    }

    // DELETE /circles/{circle}/members/{user} — FAM-09.
    public function remove(Request $request, int $circle, User $member): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);

        return $this->ok("{$member->first_name} was removed", $this->svc()->remove($c, $request->user(), $member));
    }

    // GET /circles/{circle}/activity?filter=everyone|money|approvals|people — FAM-10.
    public function activity(Request $request, int $circle): JsonResponse
    {
        $d = $request->validate([
            'filter' => ['nullable', Rule::in(['everyone', 'money', 'approvals', 'people'])],
            'before' => ['nullable', 'date'],
        ]);
        $c = $this->svc()->resolve($request->user(), $circle ?: null);

        return $this->ok('Activity', ['items' => $this->svc()->activity($c, $request->user(), $d['filter'] ?? 'everyone', null, 60, $d['before'] ?? null)]);
    }

    // GET /circles/{circle}/transfer — FAM-12 candidates.
    public function transferInfo(Request $request, int $circle): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);

        return $this->ok('Transfer', [
            'circle' => $this->svc()->describe($c, $request->user()),
            'candidates' => $c->owner_id === $request->user()->id ? $this->svc()->transferCandidates($c, $request->user()) : [],
            'accept_days' => CircleService::ACCEPT_DAYS,
            'effect_hours' => CircleService::EFFECT_HOURS,
        ]);
    }

    // POST /circles/{circle}/transfer { to_user_id, pin } — FAM-12 "Continue with PIN".
    public function transfer(Request $request, int $circle): JsonResponse
    {
        $d = $request->validate(['to_user_id' => ['required', 'integer', 'exists:users,id'], 'pin' => ['required', 'string']]);
        $c = $this->svc()->resolve($request->user(), $circle ?: null);
        $c = $this->svc()->requestTransfer($c, $request->user(), User::findOrFail($d['to_user_id']), $d['pin']);

        return $this->ok('Asked', ['circle' => $this->svc()->describe($c, $request->user())]);
    }

    // POST /circles/{circle}/transfer/accept
    public function acceptTransfer(Request $request, int $circle): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);
        $c = $this->svc()->acceptTransfer($c, $request->user());

        return $this->ok('Accepted', ['circle' => $this->svc()->describe($c, $request->user())]);
    }

    // POST /circles/{circle}/transfer/cancel
    public function cancelTransfer(Request $request, int $circle): JsonResponse
    {
        $c = $this->svc()->resolve($request->user(), $circle ?: null);
        $c = $this->svc()->cancelTransfer($c, $request->user());

        return $this->ok('Cancelled', ['circle' => $this->svc()->describe($c, $request->user())]);
    }

    // PATCH /wallets/{wallet}/circle { circle_id|null } — "Nothing is shared unless you move it."
    public function moveWallet(Request $request, Wallet $wallet): JsonResponse
    {
        $d = $request->validate(['circle_id' => ['nullable', 'integer']]);
        $w = $this->svc()->moveWallet($wallet, $request->user(), $d['circle_id'] ?? null);

        return $this->ok('Moved', ['wallet_id' => $w->id, 'circle_id' => $w->circle_id]);
    }
}
