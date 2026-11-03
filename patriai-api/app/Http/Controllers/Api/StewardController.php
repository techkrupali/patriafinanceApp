<?php

namespace App\Http\Controllers\Api;

use App\Models\StewardAction;
use App\Services\StewardSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** AIS-05 what Steward may do, RUL-09 its auto-actions, AIS-06 what it did. */
class StewardController extends ApiController
{
    // GET /steward/settings
    public function settings(Request $request): JsonResponse
    {
        return $this->ok('Steward', StewardSettingsService::make()->describe($request->user()));
    }

    // PUT /steward/settings { mode?, limit?, answer_vendors?, tell_after? }
    public function save(Request $request): JsonResponse
    {
        $d = $request->validate([
            'mode' => ['nullable', 'in:suggest,prepare,act'],
            'limit' => ['nullable', 'numeric', 'min:0'],
            'answer_vendors' => ['nullable', 'boolean'],
            'tell_after' => ['nullable', 'boolean'],
        ]);
        if (isset($d['limit'])) {
            $d['limit'] = $this->toKobo($d['limit']);
        }

        return $this->ok('Saved', StewardSettingsService::make()->save($request->user(), array_filter($d, fn ($v) => $v !== null)));
    }

    // POST /steward/auto-actions { when, will, limit?, tell?, wallet_id?, percent? } — RUL-09.
    public function autoAction(Request $request): JsonResponse
    {
        $d = $request->validate([
            'when' => ['required', 'in:salary,vendor_chat,bill_due,goal_behind'],
            'will' => ['required', 'in:tithe,answer_vendor,catchup'],
            'limit' => ['nullable', 'numeric', 'min:1000'],
            'tell' => ['nullable', 'boolean'],
            'wallet_id' => ['nullable', 'integer'],
            'percent' => ['nullable', 'integer', 'between:1,30'],
        ]);
        if (isset($d['limit'])) {
            $d['limit'] = $this->toKobo($d['limit']);
        }
        $r = StewardSettingsService::make()->autoAction($request->user(), $d);

        return $this->ok('Turned on', $r + ['steward' => StewardSettingsService::make()->describe($request->user()->fresh())]);
    }

    // GET /steward/actions — AIS-06 "What Steward did".
    public function actions(Request $request): JsonResponse
    {
        $rows = StewardAction::where('user_id', $request->user()->id)->latest('id')->limit(100)->get()->map(fn (StewardAction $a) => [
            'id' => $a->id,
            'kind' => $a->kind,
            'summary' => $a->summary,
            'amount' => $a->amount !== null ? number_format($a->amount / 100, 2, '.', '') : null,
            'reference' => $a->reference,
            'at' => $a->created_at?->toIso8601String(),
            'undone' => (bool) $a->undone_at,
        ]);

        return $this->ok('Steward actions', ['actions' => $rows]);
    }
}
