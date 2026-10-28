<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\CharityDonation;
use App\Models\Organisation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The organisations people can give to (GIV-02) and pick for early-break fees
 * (BRK-02). Patriai checks each one and its account before marking it verified.
 * Also what's owed to charities from early-break fees, and marking it paid.
 */
class OrganisationAdminController extends ApiController
{
    private function serialize(Organisation $o): array
    {
        return $o->only(['id', 'name', 'kind', 'cause', 'area', 'state', 'about', 'account_name', 'account_number', 'bank_code', 'bank_name', 'verified', 'active']) + [
            'saved_by' => $o->saved_accounts_count ?? null,
            'owed' => number_format((int) CharityDonation::where('organisation_id', $o->id)->where('status', 'pending')->sum('amount') / 100, 2, '.', ''),
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }

    private function rules(bool $create): array
    {
        $req = $create ? 'required' : 'sometimes';

        return [
            'name' => [$req, 'string', 'max:120'],
            'kind' => [$req, 'in:' . implode(',', Organisation::KINDS)],
            'cause' => ['nullable', 'in:' . implode(',', Organisation::CAUSES)],
            'area' => ['nullable', 'string', 'max:80'],
            'state' => ['nullable', 'string', 'max:40'],
            'about' => ['nullable', 'string', 'max:1000'],
            'account_name' => [$req, 'string', 'max:120'],
            'account_number' => [$req, 'digits:10'],
            'bank_code' => [$req, 'string', 'max:10'],
            'bank_name' => [$req, 'string', 'max:80'],
            'verified' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    // GET /admin/organisations?q=&kind=
    public function index(Request $request): JsonResponse
    {
        $orgs = Organisation::query()
            ->withCount('savedAccounts')
            ->when($request->query('q'), fn ($q, $term) => $q->whereRaw('LOWER(name) LIKE ?', ['%' . mb_strtolower((string) $term) . '%']))
            ->when($request->query('kind'), fn ($q, $kind) => $q->where('kind', $kind))
            ->orderBy('name')
            ->get();

        return $this->ok('Organisations fetched', [
            'organisations' => $orgs->map(fn ($o) => $this->serialize($o))->values(),
            'donations' => CharityDonation::with(['organisation', 'user'])->latest()->limit(50)->get()->map(fn (CharityDonation $d) => [
                'id' => $d->id,
                'organisation' => $d->organisation?->name,
                'from' => $d->user?->fullName(),
                'amount' => number_format($d->amount / 100, 2, '.', ''),
                'receipt_no' => $d->receipt_no,
                'status' => $d->status,
                'created_at' => $d->created_at?->toIso8601String(),
                'paid_at' => $d->paid_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    // POST /admin/organisations
    public function store(Request $request): JsonResponse
    {
        $org = Organisation::create($request->validate($this->rules(true)));

        return $this->ok('Organisation added', ['organisation' => $this->serialize($org)], 201);
    }

    // PATCH /admin/organisations/{organisation}
    public function update(Request $request, Organisation $organisation): JsonResponse
    {
        $organisation->update($request->validate($this->rules(false)));

        return $this->ok('Organisation updated', ['organisation' => $this->serialize($organisation->refresh())]);
    }

    // POST /admin/organisations/{organisation}/donations/paid — everything owed was paid out
    public function markDonationsPaid(Organisation $organisation): JsonResponse
    {
        $count = CharityDonation::where('organisation_id', $organisation->id)->where('status', 'pending')->update(['status' => 'paid', 'paid_at' => now()]);

        return $this->ok("Marked {$count} donation(s) paid", ['organisation' => $this->serialize($organisation->refresh())]);
    }
}
