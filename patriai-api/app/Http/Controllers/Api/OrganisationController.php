<?php

namespace App\Http\Controllers\Api;

use App\Models\Organisation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GIV-02 "Search churches, mosques and charities" and BRK-02 "Choose a charity":
 * the organisations Patriai lists, verified ones first.
 */
class OrganisationController extends ApiController
{
    public static function serialize(Organisation $o): array
    {
        return [
            'id' => $o->id,
            'name' => $o->name,
            'kind' => $o->kind,
            'cause' => $o->cause,
            'area' => $o->area,
            'state' => $o->state,
            'about' => $o->about,
            'verified' => $o->verified,
            'bank_name' => $o->bank_name,
            'masked_number' => '•••• ' . substr($o->account_number, -2),
        ];
    }

    // GET /organisations?q=&kind=&state=&cause=
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:80'],
            'kind' => ['nullable', 'in:' . implode(',', Organisation::KINDS)],
            'state' => ['nullable', 'string', 'max:40'],
            'cause' => ['nullable', 'in:' . implode(',', Organisation::CAUSES)],
        ]);
        $query = Organisation::where('active', true)
            ->when($data['q'] ?? null, fn ($q, $term) => $q->whereRaw('LOWER(name) LIKE ?', ['%' . mb_strtolower(str_replace(['%', '_'], '', $term)) . '%']))
            ->when($data['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->when($data['state'] ?? null, fn ($q, $state) => $q->where('state', $state))
            ->when($data['cause'] ?? null, fn ($q, $cause) => $q->where('cause', $cause));

        return $this->ok('Organisations fetched', [
            'organisations' => (clone $query)->orderByDesc('verified')->orderBy('name')->limit(30)->get()->map(fn ($o) => self::serialize($o))->values(),
            'total' => $query->count(),
            'states' => Organisation::where('active', true)->whereNotNull('state')
                ->when($data['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
                ->distinct()->orderBy('state')->pluck('state'),
        ]);
    }
}
