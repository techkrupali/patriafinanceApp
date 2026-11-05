<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\Agent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** ADD-06 the cash agents people see near them: added, corrected and switched off here. */
class AgentAdminController extends ApiController
{
    private function serialize(Agent $a): array
    {
        return $a->only(['id', 'name', 'address', 'area', 'city', 'state', 'lat', 'lng', 'hours', 'phone', 'cash_in', 'cash_out', 'active']) + [
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }

    private function rules(bool $create): array
    {
        $req = $create ? 'required' : 'sometimes';

        return [
            'name' => [$req, 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'area' => ['nullable', 'string', 'max:80'],
            'city' => [$req, 'string', 'max:80'],
            'state' => ['nullable', 'string', 'max:80'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'hours' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:30'],
            'cash_in' => ['sometimes', 'boolean'],
            'cash_out' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    // GET /admin/agents?q=&status=active|off
    public function index(Request $request): JsonResponse
    {
        $all = Agent::query();
        $agents = Agent::query()
            ->when($request->query('q'), function ($q, $term) {
                $t = '%' . mb_strtolower((string) $term) . '%';
                $q->where(fn ($w) => $w->whereRaw('LOWER(name) LIKE ?', [$t])->orWhereRaw('LOWER(city) LIKE ?', [$t])->orWhereRaw('LOWER(COALESCE(area, \'\')) LIKE ?', [$t]));
            })
            ->when($request->query('status') === 'active', fn ($q) => $q->where('active', true))
            ->when($request->query('status') === 'off', fn ($q) => $q->where('active', false))
            ->orderBy('city')->orderBy('name')
            ->get();

        return $this->ok('Agents fetched', [
            'agents' => $agents->map(fn ($a) => $this->serialize($a))->values(),
            'summary' => [
                'all' => (clone $all)->count(),
                'active' => (clone $all)->where('active', true)->count(),
                'off' => (clone $all)->where('active', false)->count(),
                'cash_out' => (clone $all)->where('active', true)->where('cash_out', true)->count(),
                'no_location' => (clone $all)->where('active', true)->where(fn ($q) => $q->whereNull('lat')->orWhereNull('lng'))->count(),
                'cities' => (clone $all)->where('active', true)->distinct()->count('city'),
            ],
        ]);
    }

    // POST /admin/agents
    public function store(Request $request): JsonResponse
    {
        $agent = Agent::create($request->validate($this->rules(true)));

        return $this->ok('Agent added', ['agent' => $this->serialize($agent)], 201);
    }

    // PATCH /admin/agents/{agent}
    public function update(Request $request, Agent $agent): JsonResponse
    {
        $agent->update($request->validate($this->rules(false)));

        return $this->ok('Agent updated', ['agent' => $this->serialize($agent->refresh())]);
    }
}
