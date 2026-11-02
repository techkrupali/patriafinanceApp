<?php

namespace App\Http\Controllers\Api;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectProposal;
use App\Models\User;
use App\Models\VendorListing;
use App\Models\VendorProfile;
use App\Models\VendorReview;
use App\Services\NotificationService;
use App\Services\PinService;
use App\Services\ProposalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * VPJ-01…06 a builder's proposal (draft, files, send) and the family's answer
 * (accept and fund, or decline); VLS-01/02 a finished project on the builder's
 * public profile, once the family agrees.
 */
class ProposalController extends ApiController
{
    // POST /vendor/proposals — VPJ-01…04 save a draft; PUT /vendor/proposals/{proposal} to edit it
    public function save(Request $request, ?ProjectProposal $proposal = null): JsonResponse
    {
        $data = $request->validate([
            'family_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'invite_phone' => ['nullable', 'string', 'max:20'],
            'title' => ['required', 'string', 'max:120'],
            'kind' => ['nullable', 'in:' . implode(',', ProjectProposal::KINDS)],
            'location' => ['nullable', 'string', 'max:200'],
            'lines' => ['required', 'array', 'min:1', 'max:20'],
            'lines.*.label' => ['required', 'string', 'max:80'],
            'lines.*.amount' => ['required', 'numeric', 'min:1'],
            'scope' => ['nullable', 'string', 'max:3000'],
            'phases' => ['required', 'array', 'min:1', 'max:12'],
            'phases.*.title' => ['required', 'string', 'max:80'],
            'phases.*.percent' => ['required', 'integer', 'between:1,100'],
            'phases.*.proof' => ['nullable', 'string', 'max:200'],
            'terms' => ['required', 'array'],
            'terms.upfront' => ['required', 'boolean'],
            'terms.retention_percent' => ['required', 'integer', 'between:0,20'],
            'terms.retention_months' => ['required', 'integer', 'between:1,12'],
            'terms.start_within_days' => ['required', 'integer', 'between:1,90'],
            'terms.show_on_profile' => ['required', 'boolean'],
        ]);
        foreach ($data['lines'] as $i => $l) {
            $data['lines'][$i]['amount'] = $this->toKobo((string) $l['amount']);
        }
        $saved = ProposalService::make()->save($request->user(), $data, $proposal);

        return $this->ok('Saved', ['proposal' => $this->proposal($saved, $request->user())], $proposal ? 200 : 201);
    }

    // POST /vendor/proposals/{proposal}/documents multipart {file, kind: quote|drawing|other}
    public function document(Request $request, ProjectProposal $proposal): JsonResponse
    {
        $data = $request->validate(['file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:20480'], 'kind' => ['nullable', 'in:quote,drawing,other']]);
        $path = $request->file('file')->store('proposals', 'public');
        $saved = ProposalService::make()->addDocument($proposal, $request->user(), $request->file('file'), $data['kind'] ?? 'other', $request->getSchemeAndHttpHost() . '/storage/' . $path);

        return $this->ok('Added', ['proposal' => $this->proposal($saved, $request->user())]);
    }

    // POST /vendor/proposals/{proposal}/send — VPJ-04
    public function send(Request $request, ProjectProposal $proposal): JsonResponse
    {
        $sent = ProposalService::make()->send($proposal, $request->user());

        return $this->ok($sent->family ? "Sent to {$sent->family->first_name}" : "We texted {$sent->invite_phone} a link", ['proposal' => $this->proposal($sent, $request->user())]);
    }

    // GET /proposals — the family's proposals waiting for an answer, and the builder's own
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $list = ProjectProposal::with(['vendor', 'family'])
            ->where(fn ($q) => $q->where('family_user_id', $user->id)->where('status', 'sent'))
            ->orWhere('vendor_id', $user->id)
            ->latest('id')->limit(30)->get();

        return $this->ok('Proposals', ['proposals' => $list->map(fn ($p) => $this->proposal($p, $user))->values()]);
    }

    // GET /proposals/{proposal} — VPJ-05
    public function show(Request $request, ProjectProposal $proposal): JsonResponse
    {
        $user = $request->user();
        if (!in_array($user->id, [$proposal->vendor_id, $proposal->family_user_id], true)) {
            return $this->fail('Proposal not found', 404);
        }

        return $this->ok('Proposal', ['proposal' => $this->proposal($proposal, $user)]);
    }

    // POST /proposals/{proposal}/accept — VPJ-06 {pin, approvers, co_approver_id?, source_wallet_id, monthly?, monthly_wallet_id?, co_pledge?}
    public function accept(Request $request, ProjectProposal $proposal): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'pin' => ['required', 'string', self::TXN_PIN],
            'approvers' => ['required', 'in:me,both,per_phase'],
            'co_approver_id' => ['nullable', 'integer'],
            'source_wallet_id' => ['required', 'integer'],
            'monthly' => ['nullable', 'numeric', 'min:0'],
            'monthly_wallet_id' => ['nullable', 'integer'],
            'co_pledge' => ['nullable', 'numeric', 'min:0'],
        ]);
        if ($proposal->family_user_id !== $user->id) {
            return $this->fail('Proposal not found', 404);
        }
        app(PinService::class)->verify($user, $data['pin']);
        foreach (['monthly', 'co_pledge'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = $this->toKobo((string) $data[$k]);
            }
        }
        $project = ProposalService::make()->accept($proposal, $user, $data);

        return $this->ok('Project started', ['project' => $this->serializeProject($project->load(['wallet', 'owner', 'vendor']), $user)], 201);
    }

    // POST /proposals/{proposal}/decline {note?}
    public function decline(Request $request, ProjectProposal $proposal): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);
        $done = ProposalService::make()->decline($proposal, $request->user(), $data['note'] ?? null);

        return $this->ok('Declined', ['proposal' => $this->proposal($done, $request->user())]);
    }

    // ------------------------------------------------------------- listings

    // GET /vendor/listing-candidates — VLS-01 finished projects not shown yet
    public function candidates(Request $request): JsonResponse
    {
        $user = $request->user();
        $listed = VendorListing::whereIn('vendor_profile_id', VendorProfile::where('user_id', $user->id)->pluck('id'))->pluck('project_id');
        $projects = Project::with(['milestones.evidence', 'owner'])->where('vendor_id', $user->id)->where('status', 'completed')->whereNotIn('id', $listed->filter())->get();

        return $this->ok('Finished projects', ['projects' => $projects->map(fn (Project $p) => $this->finished($p))->values()]);
    }

    // POST /vendor/listings {project_id, title, photos: [url], cost_min?, cost_max?} — VLS-01 "Ask the Eze family and publish"
    public function list(Request $request): JsonResponse
    {
        $user = $request->user();
        $profile = VendorProfile::where('user_id', $user->id)->first();
        $data = $request->validate([
            'project_id' => ['required', 'integer'],
            'title' => ['required', 'string', 'max:120'],
            'photos' => ['required', 'array', 'min:1', 'max:12'],
            'photos.*.url' => ['required', 'string', 'max:500'],
            'photos.*.caption' => ['nullable', 'string', 'max:40'],
            'cost_min' => ['nullable', 'numeric', 'min:1'],
            'cost_max' => ['nullable', 'numeric', 'min:1'],
        ]);
        $project = Project::with('milestones.evidence', 'owner')->where('vendor_id', $user->id)->where('status', 'completed')->find($data['project_id']);
        if (!$profile || !$project) {
            return $this->fail('Only a finished project of yours can be listed', 422);
        }
        // Only the project's own photos.
        $own = $project->milestones->flatMap->evidence->pluck('url');
        $photos = collect($data['photos'])->filter(fn ($p) => $own->contains($p['url']))->values()->all();
        if (!$photos) {
            return $this->fail('Choose photos from the project', 422);
        }
        $f = $this->finished($project);
        $listing = VendorListing::updateOrCreate(['vendor_profile_id' => $profile->id, 'project_id' => $project->id], [
            'family_user_id' => $project->owner_id,
            'title' => trim($data['title']),
            'photos' => $photos,
            'cost_min' => isset($data['cost_min']) ? $this->toKobo((string) $data['cost_min']) : null,
            'cost_max' => isset($data['cost_max']) ? $this->toKobo((string) $data['cost_max']) : null,
            'months' => $f['months'],
            'location' => $f['location'],
            'status' => 'asking',
        ]);
        if ($project->owner) {
            NotificationService::make()->push($project->owner, 'vendor_listing_request', "{$profile->business_name} wants to show your project", "\"{$listing->title}\" on their public profile, with photos and a cost range, no exact prices. You decide.", ['listing_id' => $listing->id]);
        }

        return $this->ok("We asked the {$project->owner?->last_name} family", ['listing' => $this->listing($listing, $user)], 201);
    }

    // POST /listings/{listing}/answer {agree} — the family
    public function answer(Request $request, VendorListing $listing): JsonResponse
    {
        if ($listing->family_user_id !== $request->user()->id || $listing->status !== 'asking') {
            return $this->fail('Request not found', 404);
        }
        $data = $request->validate(['agree' => ['required', 'boolean']]);
        $listing->update(['status' => $data['agree'] ? 'published' : 'declined', 'published_at' => $data['agree'] ? now() : null]);
        if ($vendor = $listing->profile?->user) {
            NotificationService::make()->push($vendor, 'vendor_listing_answered', $data['agree'] ? "\"{$listing->title}\" is on your profile" : "The family kept \"{$listing->title}\" private", $data['agree'] ? 'Families looking for a builder can see it now.' : 'It stays off your profile.', ['listing_id' => $listing->id]);
        }

        return $this->ok($data['agree'] ? 'Published' : 'Kept private', ['listing' => $this->listing($listing->refresh(), $request->user())]);
    }

    // GET /vendors/{vendorProfile}/listings — VND-02 / VDM-07
    public function listings(Request $request, VendorProfile $vendorProfile): JsonResponse
    {
        $mine = $vendorProfile->user_id === $request->user()->id;
        $list = VendorListing::where('vendor_profile_id', $vendorProfile->id)->when(!$mine, fn ($q) => $q->where('status', 'published'))->latest('id')->get();

        return $this->ok('Listings', ['listings' => $list->map(fn ($l) => $this->listing($l, $request->user()))->values()]);
    }

    // GET /listings/{listing} — VLS-02
    public function listingShow(Request $request, VendorListing $listing): JsonResponse
    {
        $user = $request->user();
        if ($listing->status !== 'published' && !in_array($user->id, [$listing->family_user_id, $listing->profile?->user_id], true)) {
            return $this->fail('Not found', 404);
        }

        return $this->ok('Listing', ['listing' => $this->listing($listing, $user)]);
    }

    // ------------------------------------------------------------- shapes

    private function finished(Project $p): array
    {
        $ms = $p->milestones->where('status', 'released');
        $start = $p->created_at;
        $end = $ms->max('released_at') ?? $p->updated_at;
        $town = $p->meta['location'] ?? null;

        return [
            'id' => $p->id,
            'title' => $p->title,
            'family' => $p->owner?->last_name ? "{$p->owner->last_name} family" : $p->owner?->fullName(),
            'milestones' => $ms->count(),
            'all_approved' => $ms->count() === $p->milestones->whereNotIn('status', ['cancelled', 'proposed'])->count(),
            'months' => max(1, (int) round($start->floatDiffInMonths($end))),
            'location' => $town ? trim((string) collect(explode(',', $town))->last()) : null,
            'total' => number_format($ms->sum('amount') / 100, 2, '.', ''),
            'photos' => $p->milestones->flatMap->evidence->whereIn('kind', ['image'])->map(fn ($e) => ['url' => $e->url, 'caption' => $e->caption])->values(),
        ];
    }

    private function listing(VendorListing $l, User $viewer): array
    {
        $profile = $l->profile;
        $project = $l->project;
        $review = $project ? VendorReview::with('user')->where('project_id', $project->id)->where('vendor_profile_id', $l->vendor_profile_id)->latest('id')->first() : null;

        return [
            'id' => $l->id,
            'title' => $l->title,
            'business' => $profile?->business_name,
            'vendor_profile_id' => $l->vendor_profile_id,
            'vendor_user_id' => $profile?->user_id,
            'photos' => $l->photos,
            'milestones' => $project ? $project->milestones()->where('status', 'released')->count() : null,
            'months' => $l->months,
            'cost_min' => $l->cost_min ? number_format($l->cost_min / 100, 2, '.', '') : null,
            'cost_max' => $l->cost_max ? number_format($l->cost_max / 100, 2, '.', '') : null,
            'location' => $l->location,
            'status' => $l->status,
            // "Family said · Ifeoma, Enugu · ★★★★★"
            'review' => $review && $review->body ? ['body' => $review->body, 'rating' => $review->rating, 'by' => trim(($review->user?->first_name ?? 'The family') . ($l->location ? ", {$l->location}" : ''))] : null,
            'mine' => $profile?->user_id === $viewer->id,
            'can_answer' => $l->family_user_id === $viewer->id && $l->status === 'asking',
        ];
    }

    private function proposal(ProjectProposal $p, User $viewer): array
    {
        $naira = fn (int $k) => number_format($k / 100, 2, '.', '');
        $profile = VendorProfile::where('user_id', $p->vendor_id)->first();
        $terms = $p->terms;
        $first = $p->phases[0] ?? null;

        return [
            'id' => $p->id,
            'title' => $p->title,
            'kind' => $p->kind,
            'location' => $p->location,
            'vendor' => ['id' => $p->vendor_id, 'name' => $p->vendor?->fullName(), 'business' => $profile?->business_name, 'profile_id' => $profile?->id, 'verified' => (bool) $profile?->verified],
            'family' => $p->family ? ['id' => $p->family->id, 'name' => $p->family->fullName(), 'first_name' => $p->family->first_name] : null,
            'invite_phone' => $p->invite_phone,
            'lines' => collect($p->lines)->map(fn ($l) => ['label' => $l['label'], 'amount' => $naira((int) $l['amount'])])->values(),
            'total' => $naira($p->total),
            'scope' => $p->scope,
            'documents' => $p->documents ?? [],
            'phases' => collect($p->phases)->map(fn ($ph) => ['title' => $ph['title'], 'percent' => $ph['percent'], 'amount' => $naira((int) $ph['amount']), 'proof' => $ph['proof']])->values(),
            'terms' => $terms,
            // VPJ-05 "₦960,000 upfront · 5% held back"
            'upfront' => $terms['upfront'] && $first ? $naira((int) $first['amount']) : null,
            'held_back' => $naira(intdiv($p->total * (int) $terms['retention_percent'], 100)),
            'status' => $p->status,
            'project_id' => $p->project_id,
            'family_note' => $p->family_note,
            'sent_at' => $p->sent_at?->toIso8601String(),
            'mine' => $p->vendor_id === $viewer->id,
            'can_answer' => $p->family_user_id === $viewer->id && $p->status === 'sent',
        ];
    }
}
