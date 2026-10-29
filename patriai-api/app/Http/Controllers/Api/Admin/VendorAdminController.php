<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\Dispute;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\VendorDirector;
use App\Models\VendorDocument;
use App\Models\VendorProfile;
use App\Services\VendorAccountService;
use App\Services\VendorTeamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Admin side of business accounts (VON-09): there's no CAC or BVN provider
 * yet, so a person checks each item (owner identity, ID, CAC papers,
 * directors, address, bank account) and approves it or sends it back with a
 * note. When every item is approved the business is verified and can be paid.
 */
class VendorAdminController extends ApiController
{
    // GET /admin/vendors?status=&q=
    public function index(Request $request): JsonResponse
    {
        $q = strtolower(trim((string) $request->query('q', '')));
        $page = VendorProfile::with('user')
            ->when($request->query('status'), fn ($query, $s) => $query->where('status', $s))
            ->when($q !== '', fn ($query) => $query->whereRaw('LOWER(business_name) LIKE ?', ["%{$q}%"]))
            // Waiting for a check first.
            ->orderByRaw("CASE status WHEN 'submitted' THEN 0 WHEN 'needs_changes' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END")
            ->orderByDesc('submitted_at')
            ->orderByDesc('id')
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Vendors fetched', [
            'vendors' => collect($page->items())->map(fn (VendorProfile $p) => $this->row($p))->values(),
            'counts' => VendorProfile::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    // GET /admin/vendors/{vendorProfile}
    public function show(VendorProfile $vendorProfile): JsonResponse
    {
        $vendorProfile->load(['user', 'documents', 'directors']);
        $service = VendorAccountService::make();
        $mask = fn (?string $v) => $v ? str_repeat('•', max(0, strlen($v) - 4)) . substr($v, -4) : null;
        $base = "/api/v1/admin/vendors/{$vendorProfile->id}";
        $projectIds = Project::where('vendor_id', $vendorProfile->user_id)->pluck('id');

        return $this->ok('Vendor fetched', [
            'vendor' => $this->row($vendorProfile) + [
                'rc_number' => $vendorProfile->rc_number,
                'since_year' => $vendorProfile->since_year,
                'services' => $vendorProfile->services ?? [],
                'bio' => $vendorProfile->bio,
                'areas' => $vendorProfile->areas,
                'team_size' => $vendorProfile->team_size,
                'address' => $vendorProfile->address,
                'tin' => $vendorProfile->tin,
                'id_type' => $vendorProfile->id_type,
                'owner_bvn' => $mask($vendorProfile->owner_bvn),
                'owner_nin' => $mask($vendorProfile->owner_nin),
                'bank' => $vendorProfile->account_number ? [
                    'account_name' => $vendorProfile->account_name,
                    'account_number' => $vendorProfile->account_number,
                    'bank_name' => $vendorProfile->bank_name,
                ] : null,
                'logo_url' => $vendorProfile->logo_url,
                'past_work' => $vendorProfile->past_work ?? [],
                'owner' => $vendorProfile->user ? ['id' => $vendorProfile->user->id, 'name' => $vendorProfile->user->fullName(), 'phone' => $vendorProfile->user->phone, 'email' => $vendorProfile->user->email, 'kyc_tier' => (int) $vendorProfile->user->kyc_tier] : null,
            ],
            'verification' => $service->verification($vendorProfile),
            'documents' => $vendorProfile->documents->map(fn (VendorDocument $d) => [
                'id' => $d->id,
                'item' => $d->item,
                'name' => $d->name,
                'url' => "{$base}/documents/{$d->id}",
                'is_pdf' => str_ends_with(strtolower($d->url), '.pdf'),
                'created_at' => $d->created_at?->toIso8601String(),
            ])->values(),
            'directors' => $vendorProfile->directors->map(fn (VendorDirector $d) => [
                'id' => $d->id,
                'name' => $d->name,
                'phone' => $d->phone,
                'share_percent' => $d->share_percent,
                'status' => $d->status,
                'is_owner' => $d->user_id === $vendorProfile->user_id,
                'bvn' => $mask($d->bvn),
                'selfie_url' => $d->selfie_url ? "{$base}/directors/{$d->id}/selfie" : null,
            ])->values(),
            'stats' => [
                'projects' => $projectIds->count(),
                'milestones_paid' => (int) Milestone::whereIn('project_id', $projectIds)->where('status', 'released')->count(),
                'open_disputes' => (int) Dispute::where('against_user_id', $vendorProfile->user_id)->whereIn('status', ['open', 'responded', 'fixing', 'escalated', 'under_review'])->count(),
            ],
            'labels' => $service->labels(),
        ]);
    }

    // GET /admin/vendors/{vendorProfile}/documents/{document} — streams the private upload
    public function document(VendorProfile $vendorProfile, VendorDocument $document): StreamedResponse|JsonResponse
    {
        if ($document->vendor_profile_id !== $vendorProfile->id || !Storage::disk('local')->exists($document->url)) {
            return $this->fail('Document not found', 404);
        }

        return Storage::disk('local')->response($document->url);
    }

    // GET /admin/vendors/{vendorProfile}/directors/{director}/selfie
    public function selfie(VendorProfile $vendorProfile, VendorDirector $director): StreamedResponse|JsonResponse
    {
        if ($director->vendor_profile_id !== $vendorProfile->id || !$director->selfie_url || !Storage::disk('local')->exists($director->selfie_url)) {
            return $this->fail('Selfie not found', 404);
        }

        return Storage::disk('local')->response($director->selfie_url);
    }

    // POST /admin/vendors/{vendorProfile}/review  {item, approve, note?}
    public function review(Request $request, VendorProfile $vendorProfile): JsonResponse
    {
        $data = $request->validate([
            'item' => ['required', 'in:' . implode(',', VendorProfile::CHECKS)],
            'approve' => ['required', 'boolean'],
            'note' => ['required_if:approve,false', 'nullable', 'string', 'max:300'],
        ]);
        $profile = VendorAccountService::make()->review($vendorProfile, $data['item'], (bool) $data['approve'], $data['note'] ?? null);

        return $this->ok($data['approve'] ? 'Approved' : 'Sent back', [
            'vendor' => $this->row($profile->load('user')),
            'verification' => VendorAccountService::make()->verification($profile),
        ]);
    }

    private function row(VendorProfile $p): array
    {
        $ratings = VendorTeamService::make()->ratings($p);

        return [
            'id' => $p->id,
            'business_name' => $p->business_name,
            'category' => $p->category,
            'location' => $p->location,
            'status' => $p->status ?? ($p->verified ? 'verified' : 'draft'),
            'verified' => (bool) $p->verified,
            'owner_name' => $p->user?->fullName(),
            'rating' => $ratings['rating'],
            'reviews' => $ratings['reviews'],
            'checks' => $p->checks,
            'submitted_at' => $p->submitted_at?->toIso8601String(),
            'verified_at' => $p->verified_at?->toIso8601String(),
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}
