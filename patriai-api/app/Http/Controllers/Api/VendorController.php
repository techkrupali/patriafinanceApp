<?php

namespace App\Http\Controllers\Api;

use App\Models\Project;
use App\Models\VendorProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Vendor directory (Directory-Based Discovery, V1). Read-only browse/search of
 * vendor profiles plus self-service "become a vendor" profile management. A family
 * finds a vendor here, then assigns them to a project by email/phone through the
 * existing ProjectController::assignVendor flow. No money movement anywhere.
 */
class VendorController extends ApiController
{
    // GET /vendors  ?q=&category=&per_page=
    public function index(Request $request): JsonResponse
    {
        $profiles = VendorProfile::with('user')
            ->when($request->query('q'), function ($query, $q) {
                $query->where(fn ($w) => $w
                    ->where('business_name', 'ilike', "%{$q}%")
                    ->orWhere('bio', 'ilike', "%{$q}%")
                    ->orWhere('location', 'ilike', "%{$q}%"));
            })
            ->when($request->query('category'), function ($query, $category) {
                if ($category !== 'all') {
                    $query->where('category', $category);
                }
            })
            ->orderByDesc('verified')
            ->orderBy('business_name')
            ->paginate(min((int) $request->query('per_page', 20), 100));

        // One grouped query for the projects_completed badge across the whole page.
        $completedCounts = Project::whereIn('vendor_id', collect($profiles->items())->pluck('user_id'))
            ->where('status', 'completed')
            ->groupBy('vendor_id')
            ->selectRaw('vendor_id, count(*) as total')
            ->pluck('total', 'vendor_id');

        return $this->ok('Vendors fetched', [
            'vendors' => collect($profiles->items())
                ->map(fn ($p) => $this->serializeVendorProfile($p, (int) ($completedCounts[$p->user_id] ?? 0))),
            'pagination' => [
                'page' => $profiles->currentPage(),
                'per_page' => $profiles->perPage(),
                'total' => $profiles->total(),
                'last_page' => $profiles->lastPage(),
            ],
        ]);
    }

    // GET /vendors/{vendorProfile}
    public function show(Request $request, VendorProfile $vendorProfile): JsonResponse
    {
        $vendorProfile->load('user');

        return $this->ok('Vendor fetched', [
            'vendor' => $this->serializeVendorProfile($vendorProfile) + [
                // Exposed so a family can assign this vendor to a project by identifier
                // (POST /projects/{project}/vendor { identifier }).
                'email' => $vendorProfile->user?->email,
                'phone' => $vendorProfile->user?->phone,
            ],
        ]);
    }

    // GET /vendors/me
    public function me(Request $request): JsonResponse
    {
        $profile = VendorProfile::where('user_id', $request->user()->id)->first();

        if (!$profile) {
            return $this->ok('Vendor profile fetched', ['profile' => null]);
        }

        $profile->setRelation('user', $request->user());

        return $this->ok('Vendor profile fetched', ['profile' => $this->serializeVendorProfile($profile)]);
    }

    // PUT /vendors/me  { business_name, category, bio?, location? }  ("Become a vendor")
    public function upsert(Request $request): JsonResponse
    {
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:100'],
            'category' => ['required', 'in:' . implode(',', VendorProfile::CATEGORIES)],
            'bio' => ['nullable', 'string', 'max:1000'],
            'location' => ['nullable', 'string', 'max:120'],
        ]);

        // 'verified' is deliberately NOT accepted here — the badge stays false on
        // create and can only be granted by an admin later.
        $profile = VendorProfile::updateOrCreate(
            ['user_id' => $request->user()->id],
            [
                'business_name' => $data['business_name'],
                'category' => $data['category'],
                'bio' => $data['bio'] ?? null,
                'location' => $data['location'] ?? null,
            ],
        );

        $profile->setRelation('user', $request->user());

        return $this->ok('Vendor profile saved', ['profile' => $this->serializeVendorProfile($profile)]);
    }

    protected function serializeVendorProfile(VendorProfile $profile, ?int $projectsCompleted = null): array
    {
        return [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'business_name' => $profile->business_name,
            'category' => $profile->category,
            'bio' => $profile->bio,
            'location' => $profile->location,
            'verified' => (bool) $profile->verified,
            'name' => $profile->user?->fullName(),
            'initials' => $this->businessInitials($profile->business_name),
            'projects_completed' => $projectsCompleted ?? (int) Project::where('vendor_id', $profile->user_id)
                ->where('status', 'completed')
                ->count(),
            'member_since' => $profile->created_at?->toIso8601String(),
        ];
    }

    /** Two-letter uppercase monogram from a business name ("Golden Events" => "GE", "Acme" => "AC"). */
    private function businessInitials(string $businessName): string
    {
        $words = preg_split('/\s+/', trim($businessName), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $initials = count($words) >= 2
            ? mb_substr($words[0], 0, 1) . mb_substr($words[1], 0, 1)
            : mb_substr($words[0] ?? '', 0, 2);

        return mb_strtoupper($initials);
    }
}
