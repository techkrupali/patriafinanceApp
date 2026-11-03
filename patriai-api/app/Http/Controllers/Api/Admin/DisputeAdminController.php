<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ApiController;
use App\Models\Dispute;
use App\Services\DisputeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin side of disputes (DSP-08/09): a case officer reads both sides and the
 * evidence, can write to them, and makes the final decision — release the
 * milestone in full, release it less a refund, or refund it in full. A payment
 * dispute is resolved or not upheld.
 */
class DisputeAdminController extends ApiController
{
    // GET /admin/disputes?status=&kind=&search=
    public function index(Request $request): JsonResponse
    {
        $service = DisputeService::make();
        $search = trim((string) $request->query('search', ''));
        $page = Dispute::with(['user', 'against', 'project', 'milestone'])
            // Subject, DSP number, project, or who raised it (any database).
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . mb_strtolower(ltrim($search, '#')) . '%';
                $q->where(function ($w) use ($search, $like) {
                    $w->whereRaw('LOWER(subject) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(number) LIKE ?', [$like])
                        ->orWhereHas('project', fn ($p) => $p->whereRaw('LOWER(title) LIKE ?', [$like]))
                        ->orWhereHas('user', fn ($u) => $u->whereRaw("LOWER(first_name || ' ' || last_name) LIKE ?", [$like]));
                    if (ctype_digit(ltrim($search, '#'))) {
                        $w->orWhere('id', (int) ltrim($search, '#'));
                    }
                });
            })
            ->when($request->query('status'), fn ($q, $s) => $s === 'active'
                ? $q->whereIn('status', Dispute::ACTIVE)
                : $q->where('status', $s))
            ->when($request->query('kind'), fn ($q, $k) => $q->where('kind', $k))
            // Escalated first, the nearest decision date on top.
            ->orderByRaw("CASE status WHEN 'escalated' THEN 0 WHEN 'under_review' THEN 1 WHEN 'open' THEN 2 WHEN 'responded' THEN 3 WHEN 'fixing' THEN 4 WHEN 'agreed' THEN 5 ELSE 6 END")
            ->orderBy('decision_due')
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Disputes fetched', [
            'disputes' => collect($page->items())->map(fn (Dispute $d) => $service->summary($d, $request->user()) + [
                'raised_by_name' => $d->user?->fullName(),
                'status_label' => $service->statusLabel($d, false),
                // Past the decision date and still with Patriai: shown in red.
                'overdue' => in_array($d->status, ['escalated', 'under_review', 'open'], true) && $d->decision_due && $d->decision_due->isPast(),
                'officer' => $d->officer_id ? \App\Models\User::find($d->officer_id)?->first_name : null,
            ])->values(),
            'counts' => Dispute::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            // A payment dispute goes straight to Patriai; only a milestone dispute waits for a builder.
            'waiting' => [
                'decision' => Dispute::whereIn('status', ['escalated', 'under_review'])->orWhere(fn ($q) => $q->where('status', 'open')->where(fn ($k) => $k->whereNull('kind')->orWhere('kind', '!=', 'milestone')))->count(),
                'builder' => Dispute::where('status', 'open')->where('kind', 'milestone')->count(),
            ],
            'summary' => [
                'all' => Dispute::count(),
                'active' => Dispute::whereIn('status', Dispute::ACTIVE)->count(),
                'on_hold' => number_format(((int) Dispute::whereIn('status', Dispute::ACTIVE)->sum('amount_on_hold')) / 100, 2, '.', ''),
                'overdue' => Dispute::whereIn('status', ['escalated', 'under_review', 'open'])->whereNotNull('decision_due')->where('decision_due', '<', now())->count(),
                'closed_30d' => Dispute::whereNotIn('status', Dispute::ACTIVE)->where('resolved_at', '>=', now()->subDays(30))->count(),
                'by_kind' => Dispute::whereIn('status', Dispute::ACTIVE)->selectRaw('kind, count(*) as n')->groupBy('kind')->pluck('n', 'kind'),
            ],
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'last_page' => $page->lastPage(),
            ],
        ]);
    }

    // GET /admin/disputes/{dispute}
    public function show(Request $request, Dispute $dispute): JsonResponse
    {
        return $this->ok('Dispute fetched', ['dispute' => DisputeService::make()->present($dispute, $request->user(), admin: true)]);
    }

    // POST /admin/disputes/{dispute}/take — "Take case"
    public function take(Request $request, Dispute $dispute): JsonResponse
    {
        $dispute = DisputeService::make()->take($dispute, $request->user());

        return $this->ok('Case taken', ['dispute' => DisputeService::make()->present($dispute, $request->user(), admin: true)]);
    }

    // POST /admin/disputes/{dispute}/decide  {outcome, refund?, fix_by?, note}
    public function decide(Request $request, Dispute $dispute): JsonResponse
    {
        $outcomes = $dispute->kind === 'milestone' ? 'release_full,partial_refund,full_refund,fix' : 'refund,resolved,rejected';
        $data = $request->validate([
            'outcome' => ['required', 'in:' . $outcomes],
            'refund' => ['required_if:outcome,partial_refund', 'required_if:outcome,refund', 'nullable', 'numeric', 'min:1'],
            'fix_by' => ['required_if:outcome,fix', 'nullable', 'date'],
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $refund = isset($data['refund']) ? $this->toKobo($data['refund']) : null;
        $dispute = DisputeService::make()->decide($dispute, $request->user(), $data['outcome'], $refund, trim($data['note']), $data['fix_by'] ?? null);

        return $this->ok('Decision recorded', ['dispute' => DisputeService::make()->present($dispute, $request->user(), admin: true)]);
    }

    // POST /admin/disputes/{dispute}/messages  {body} — from Patriai, seen by both sides
    public function message(Request $request, Dispute $dispute): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        DisputeService::make()->adminMessage($dispute, trim($data['body']));

        return $this->ok('Sent', ['dispute' => DisputeService::make()->present($dispute->refresh(), $request->user(), admin: true)], 201);
    }
}
