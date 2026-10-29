<?php

namespace App\Http\Controllers\Api;

use App\Models\Dispute;
use App\Models\Milestone;
use App\Models\Project;
use App\Models\VendorDirector;
use App\Models\VendorDocument;
use App\Models\VendorProfile;
use App\Models\VendorReview;
use App\Models\VendorTeamMember;
use App\Services\DisputeService;
use App\Services\VendorAccountService;
use App\Services\VendorPayoutService;
use App\Services\VendorTeamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Vendors (client sheet "Projects, vendors, disputes"):
 *  - VND-01/02 the directory and a vendor's public profile, with ratings
 *  - VDM-01, VON-01…10 a business account, verified item by item
 *  - VDM-03 the business home, VDM-06 payouts, VDM-07 the public profile,
 *    VDM-08 disputes, VDM-10/11 the team, VND-04 reviews
 */
class VendorController extends ApiController
{
    // GET /vendors  ?q=&category=&near=&verified=1&per_page=
    public function index(Request $request): JsonResponse
    {
        $q = strtolower(trim((string) $request->query('q', '')));
        $near = strtolower(trim((string) $request->query('near', '')));
        $category = (string) $request->query('category', '');
        $profiles = VendorProfile::with('user')
            ->when($q !== '', fn ($query) => $query->where(fn ($w) => $w
                ->whereRaw('LOWER(business_name) LIKE ?', ["%{$q}%"])
                ->orWhereRaw('LOWER(COALESCE(bio, \'\')) LIKE ?', ["%{$q}%"])
                ->orWhereRaw('LOWER(COALESCE(location, \'\')) LIKE ?', ["%{$q}%"])))
            ->when($category !== '' && $category !== 'all', function ($query) use ($category) {
                // "Builders" includes profiles listed under the older "construction".
                $query->whereIn('category', $category === 'building' ? ['building', 'construction'] : [$category]);
            })
            ->when($near !== '', fn ($query) => $query->where(fn ($w) => $w
                ->whereRaw('LOWER(COALESCE(location, \'\')) LIKE ?', ["%{$near}%"])
                ->orWhereRaw('LOWER(COALESCE(areas, \'\')) LIKE ?', ["%{$near}%"])))
            ->when($request->boolean('verified'), fn ($query) => $query->where('verified', true))
            ->orderByDesc('verified')
            ->orderBy('business_name')
            ->paginate(min((int) $request->query('per_page', 20), 100));

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
                'stats' => $this->vendorStats($vendorProfile),
                'email' => $vendorProfile->user?->email,
                'phone' => $vendorProfile->user?->phone,
            ],
        ]);
    }

    // GET /vendors/{vendorProfile}/reviews
    public function reviews(Request $request, VendorProfile $vendorProfile): JsonResponse
    {
        $reviews = $vendorProfile->reviews()->with('user')->latest()->limit(50)->get();

        return $this->ok('Reviews fetched', [
            'reviews' => $reviews->map(fn (VendorReview $r) => [
                'id' => $r->id,
                'rating' => $r->rating,
                'tags' => $r->tags ?? [],
                'body' => $r->body,
                'by' => $r->first_name_only ? ($r->user?->first_name ?? 'A family') : ($r->user?->fullName() ?? 'A family'),
                'created_at' => $r->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    // POST /vendors/{vendorProfile}/reviews  {rating, tags[], body?, first_name_only, milestone_id?, project_id?}
    public function review(Request $request, VendorProfile $vendorProfile): JsonResponse
    {
        $data = $request->validate([
            'rating' => ['required', 'integer', 'between:1,5'],
            'tags' => ['sometimes', 'array', 'max:5'],
            'tags.*' => ['in:' . implode(',', VendorReview::TAGS)],
            'body' => ['nullable', 'string', 'max:1000'],
            'first_name_only' => ['sometimes', 'boolean'],
            'milestone_id' => ['nullable', 'integer'],
            'project_id' => ['nullable', 'integer', 'required_without:milestone_id'],
        ]);
        VendorTeamService::make()->review($vendorProfile, $request->user(), $data);

        return $this->ok('Review posted', ['vendor' => $this->serializeVendorProfile($vendorProfile->refresh()->load('user'))], 201);
    }

    // ----------------------------------------------------------------- my business

    // GET /vendors/me
    public function me(Request $request): JsonResponse
    {
        $profile = VendorProfile::where('user_id', $request->user()->id)->first();
        if (!$profile) {
            return $this->ok('Vendor profile fetched', ['profile' => null]);
        }

        return $this->ok('Vendor profile fetched', ['profile' => $this->owned($profile)]);
    }

    // PUT /vendors/me  — VDM-01 business details; VON-08 / VDM-07 what families see
    public function upsert(Request $request): JsonResponse
    {
        $existing = VendorProfile::where('user_id', $request->user()->id)->exists();
        $data = $request->validate([
            'business_name' => [$existing ? 'sometimes' : 'required', 'string', 'max:100'],
            'rc_number' => ['sometimes', 'nullable', 'string', 'max:30'],
            'since_year' => ['sometimes', 'nullable', 'integer', 'between:1950,' . now()->year],
            'category' => [$existing ? 'sometimes' : 'required', 'in:' . implode(',', VendorProfile::CATEGORIES)],
            'services' => ['sometimes', 'nullable', 'array', 'max:15'],
            'services.*' => ['string', 'max:40'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:120'],
            'areas' => ['sometimes', 'nullable', 'string', 'max:200'],
            'team_size' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);
        // 'verified' is deliberately NOT accepted here — only an admin grants the badge.
        $profile = VendorAccountService::make()->saveDetails($request->user(), $data);

        return $this->ok('Vendor profile saved', ['profile' => $this->owned($profile)]);
    }

    // POST /vendors/me/owner  — VON-02/03 {bvn?, nin?, id_type?, share_percent?}
    public function owner(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate([
            'bvn' => ['sometimes', 'digits:11'],
            'nin' => ['sometimes', 'digits:11'],
            'id_type' => ['sometimes', 'in:' . implode(',', VendorProfile::ID_TYPES)],
            'share_percent' => ['sometimes', 'nullable', 'integer', 'between:1,100'],
        ]);
        $service = VendorAccountService::make();
        $service->saveOwner($profile, $data);
        if (array_key_exists('share_percent', $data)) {
            $service->setOwnerShare($profile, $request->user(), $data['share_percent']);
        }

        return $this->ok('Saved', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/documents  (multipart: item, file)
    public function uploadDocument(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate([
            'item' => ['required', 'in:' . implode(',', VendorProfile::DOCUMENT_ITEMS)],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:10240'], // VON-03 "up to 10 MB"
        ]);
        VendorAccountService::make()->addDocument($profile, $data['item'], $request->file('file'));

        return $this->ok('Uploaded', ['profile' => $this->owned($profile->refresh())], 201);
    }

    // DELETE /vendors/me/documents/{document}
    public function deleteDocument(Request $request, VendorDocument $document): JsonResponse
    {
        $profile = $this->mine($request);
        if ($document->vendor_profile_id !== $profile->id) {
            return $this->fail('Document not found', 404);
        }
        VendorAccountService::make()->deleteDocument($document);

        return $this->ok('Removed', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/directors  — VON-05 {name, phone, share_percent?}
    public function addDirector(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:20'],
            'share_percent' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $data['phone'] = $this->normalizePhone($data['phone']);
        VendorAccountService::make()->addDirector($profile, $request->user(), $data);

        return $this->ok('Director invited', ['profile' => $this->owned($profile->refresh())], 201);
    }

    // DELETE /vendors/me/directors/{director}
    public function removeDirector(Request $request, VendorDirector $director): JsonResponse
    {
        $profile = $this->mine($request);
        if ($director->vendor_profile_id !== $profile->id || $director->user_id === $request->user()->id) {
            return $this->fail('Director not found', 404);
        }
        $director->delete();

        return $this->ok('Removed', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/address  — VON-06 {address}
    public function address(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate(['address' => ['required', 'string', 'max:200']]);
        $profile->update(['address' => trim($data['address'])]);

        return $this->ok('Saved', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/bank  — VON-07 {account_number, bank_code, tin?}
    public function bank(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate([
            'account_number' => ['required', 'digits:10'],
            'bank_code' => ['required', 'string', 'max:10'],
            'tin' => ['sometimes', 'nullable', 'string', 'max:30'],
        ]);
        VendorAccountService::make()->saveBank($profile, $data['account_number'], $data['bank_code']);
        if (array_key_exists('tin', $data)) {
            $profile->update(['tin' => $data['tin']]);
        }

        return $this->ok('Saved', ['profile' => $this->owned($profile->refresh())]);
    }

    // PATCH /vendors/me/payouts  — VDM-06 {auto_withdraw}
    public function payoutSettings(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate(['auto_withdraw' => ['required', 'boolean']]);
        $profile->update(['auto_withdraw' => $data['auto_withdraw']]);

        return $this->ok('Saved', ['payouts' => VendorPayoutService::make()->payouts($request->user())]);
    }

    // POST /vendors/me/logo  (multipart: file) — VDM-07 "Change logo"
    public function logo(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $request->validate(['file' => ['required', 'image', 'max:5120']]);
        $path = $request->file('file')->store('vendor-logos', 'public');
        $profile->update(['logo_url' => $request->getSchemeAndHttpHost() . '/storage/' . $path]);

        return $this->ok('Logo saved', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/past-work  (multipart: file, caption?) — VON-08 "Up to 20"
    public function addPastWork(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate(['file' => ['required', 'image', 'max:10240'], 'caption' => ['nullable', 'string', 'max:40']]);
        $work = $profile->past_work ?? [];
        if (count($work) >= 20) {
            return $this->fail('You can show up to 20 photos.', 422);
        }
        $path = $request->file('file')->store('vendor-work', 'public');
        $work[] = ['url' => $request->getSchemeAndHttpHost() . '/storage/' . $path, 'caption' => $data['caption'] ?? null];
        $profile->update(['past_work' => $work]);

        return $this->ok('Photo added', ['profile' => $this->owned($profile->refresh())], 201);
    }

    // DELETE /vendors/me/past-work/{index}
    public function removePastWork(Request $request, int $index): JsonResponse
    {
        $profile = $this->mine($request);
        $work = $profile->past_work ?? [];
        if (!isset($work[$index])) {
            return $this->fail('Photo not found', 404);
        }
        array_splice($work, $index, 1);
        $profile->update(['past_work' => array_values($work)]);

        return $this->ok('Photo removed', ['profile' => $this->owned($profile->refresh())]);
    }

    // POST /vendors/me/submit  — VON-08 "Submit for review"
    public function submit(Request $request): JsonResponse
    {
        $profile = VendorAccountService::make()->submit($this->mine($request));

        return $this->ok('Sent for review', ['profile' => $this->owned($profile)]);
    }

    // GET /vendor/home  — VDM-03
    public function home(Request $request): JsonResponse
    {
        return $this->ok('Vendor home', VendorPayoutService::make()->home($request->user()));
    }

    // GET /vendor/payouts  — VDM-06
    public function payouts(Request $request): JsonResponse
    {
        return $this->ok('Payouts', ['payouts' => VendorPayoutService::make()->payouts($request->user())]);
    }

    // GET /vendor/disputes  — VDM-08: disputes about this business
    public function disputes(Request $request): JsonResponse
    {
        $user = $request->user();
        $service = DisputeService::make();
        $disputes = $service->visibleTo($user)->with(['project', 'milestone', 'user'])->whereNotNull('against_user_id')->latest()->limit(100)->get()
            ->filter(fn (Dispute $d) => $service->isVendorSide($d, $user))->values();

        return $this->ok('Disputes fetched', ['disputes' => $disputes->map(fn (Dispute $d) => $service->summary($d, $user))->values()]);
    }

    // ----------------------------------------------------------------- team

    // GET /vendors/me/team
    public function team(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $service = VendorTeamService::make();
        $members = $profile->team()->with(['user', 'vendorProfile'])->whereIn('status', ['pending', 'active'])->latest()->get();

        return $this->ok('Team', [
            'owner' => ['name' => $request->user()->fullName()],
            'members' => $members->map(fn (VendorTeamMember $m) => $service->present($m))->values(),
            'projects' => Project::where('vendor_id', $request->user()->id)->whereIn('vendor_status', ['accepted', 'invited', 'changes_proposed'])
                ->orWhere(fn ($q) => $q->where('vendor_id', $request->user()->id)->whereNull('vendor_status'))
                ->get()->map(fn (Project $p) => ['id' => $p->id, 'title' => $p->title, 'location' => $p->meta['location'] ?? null])->values(),
        ]);
    }

    // POST /vendors/me/team  — VDM-11 {phone, role, project_ids[]}
    public function invite(Request $request): JsonResponse
    {
        $profile = $this->mine($request);
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'role' => ['required', 'in:' . implode(',', VendorTeamMember::ROLES)],
            'project_ids' => ['present', 'array'],
            'project_ids.*' => ['integer'],
        ]);
        $member = VendorTeamService::make()->invite($profile, $request->user(), $this->normalizePhone($data['phone']), $data['role'], $data['project_ids']);

        return $this->ok('Invite sent', ['member' => VendorTeamService::make()->present($member->load('vendorProfile'))], 201);
    }

    // PATCH /vendors/me/team/{member}  {role?, project_ids?}
    public function updateMember(Request $request, VendorTeamMember $member): JsonResponse
    {
        $profile = $this->mine($request);
        if ($member->vendor_profile_id !== $profile->id) {
            return $this->fail('Team member not found', 404);
        }
        $data = $request->validate([
            'role' => ['sometimes', 'in:' . implode(',', VendorTeamMember::ROLES)],
            'project_ids' => ['sometimes', 'array'],
            'project_ids.*' => ['integer'],
        ]);
        $member = VendorTeamService::make()->update($member, $profile, $data);

        return $this->ok('Saved', ['member' => VendorTeamService::make()->present($member->load('vendorProfile'))]);
    }

    // DELETE /vendors/me/team/{member}
    public function removeMember(Request $request, VendorTeamMember $member): JsonResponse
    {
        $profile = $this->mine($request);
        if ($member->vendor_profile_id !== $profile->id) {
            return $this->fail('Team member not found', 404);
        }
        VendorTeamService::make()->remove($member);

        return $this->ok('Removed');
    }

    // GET /team-invites  — INV-VT1
    public function teamInvites(Request $request): JsonResponse
    {
        $service = VendorTeamService::make();

        return $this->ok('Team invites', ['invites' => $service->invitesFor($request->user())->map(fn ($m) => $service->present($m))->values()]);
    }

    // POST /team-invites/{member}/answer  {join}
    public function answerTeamInvite(Request $request, VendorTeamMember $member): JsonResponse
    {
        $data = $request->validate(['join' => ['required', 'boolean']]);
        $member = VendorTeamService::make()->answer($member, $request->user(), (bool) $data['join']);

        return $this->ok($data['join'] ? 'You joined the team' : 'Invite declined', ['member' => VendorTeamService::make()->present($member->load('vendorProfile'))]);
    }

    // ----------------------------------------------------------------- shapes

    private function mine(Request $request): VendorProfile
    {
        $profile = VendorProfile::where('user_id', $request->user()->id)->first();
        abort_if(!$profile, 404, 'Set up your business account first.');

        return $profile;
    }

    /** The owner's own view: the public profile plus verification, payouts and private details. */
    private function owned(VendorProfile $profile): array
    {
        $profile->loadMissing('user');

        return $this->serializeVendorProfile($profile) + [
            'stats' => $this->vendorStats($profile),
            'status' => $profile->status,
            'verification' => VendorAccountService::make()->verification($profile),
            'id_type' => $profile->id_type,
            'address' => $profile->address,
            'tin' => $profile->tin,
            'team_size' => $profile->team_size,
            'auto_withdraw' => (bool) $profile->auto_withdraw,
            'bank' => $profile->account_number ? [
                'account_name' => $profile->account_name,
                'bank_name' => $profile->bank_name,
                'bank_code' => $profile->bank_code,
                'last4' => substr($profile->account_number, -4),
            ] : null,
            'submitted_at' => $profile->submitted_at?->toIso8601String(),
            'verified_at' => $profile->verified_at?->toIso8601String(),
        ];
    }

    protected function serializeVendorProfile(VendorProfile $profile, ?int $projectsCompleted = null): array
    {
        $ratings = VendorTeamService::make()->ratings($profile);

        return [
            'id' => $profile->id,
            'user_id' => $profile->user_id,
            'business_name' => $profile->business_name,
            'rc_number' => $profile->rc_number,
            'since_year' => $profile->since_year,
            'category' => $profile->category,
            'services' => $profile->services ?? [],
            'bio' => $profile->bio,
            'location' => $profile->location,
            'areas' => $profile->areas,
            'logo_url' => $profile->logo_url,
            'past_work' => $profile->past_work ?? [],
            'verified' => (bool) $profile->verified,
            'name' => $profile->user?->fullName(),
            'initials' => $this->businessInitials($profile->business_name),
            'rating' => $ratings['rating'],
            'reviews' => $ratings['reviews'],
            'latest_review' => $ratings['latest'],
            'projects_completed' => $projectsCompleted ?? (int) Project::where('vendor_id', $profile->user_id)
                ->where('status', 'completed')
                ->count(),
            'member_since' => $profile->created_at?->toIso8601String(),
        ];
    }

    /** PRW-04 / VND-02 "14 projects · 52 milestones paid · 0 open disputes". */
    protected function vendorStats(VendorProfile $profile): array
    {
        $projectIds = Project::where('vendor_id', $profile->user_id)->pluck('id');

        return [
            'projects' => $projectIds->count(),
            'milestones_paid' => (int) Milestone::whereIn('project_id', $projectIds)->where('status', 'released')->count(),
            'open_disputes' => (int) Dispute::where('against_user_id', $profile->user_id)->whereIn('status', ['open', 'responded', 'fixing', 'escalated', 'under_review'])->count(),
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
