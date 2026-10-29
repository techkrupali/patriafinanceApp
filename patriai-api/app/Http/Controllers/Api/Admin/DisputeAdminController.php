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
    // GET /admin/disputes?status=&kind=
    public function index(Request $request): JsonResponse
    {
        $service = DisputeService::make();
        $page = Dispute::with(['user', 'against', 'project', 'milestone'])
            ->when($request->query('status'), fn ($q, $s) => $s === 'active'
                ? $q->whereIn('status', ['open', 'responded', 'fixing', 'escalated', 'under_review'])
                : $q->where('status', $s))
            ->when($request->query('kind'), fn ($q, $k) => $q->where('kind', $k))
            // Escalated first, the nearest decision date on top.
            ->orderByRaw("CASE status WHEN 'escalated' THEN 0 WHEN 'under_review' THEN 1 WHEN 'open' THEN 2 WHEN 'responded' THEN 3 WHEN 'fixing' THEN 4 ELSE 5 END")
            ->orderBy('decision_due')
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Disputes fetched', [
            'disputes' => collect($page->items())->map(fn (Dispute $d) => $service->summary($d, $request->user()) + [
                'raised_by_name' => $d->user?->fullName(),
                'status_label' => $service->statusLabel($d, false),
            ])->values(),
            'counts' => Dispute::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
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

    // POST /admin/disputes/{dispute}/decide  {outcome, refund?, note}
    public function decide(Request $request, Dispute $dispute): JsonResponse
    {
        $outcomes = $dispute->kind === 'milestone' ? 'release_full,partial_refund,full_refund' : 'resolved,rejected';
        $data = $request->validate([
            'outcome' => ['required', 'in:' . $outcomes],
            'refund' => ['required_if:outcome,partial_refund', 'nullable', 'numeric', 'min:1'],
            'note' => ['required', 'string', 'max:2000'],
        ]);
        $refund = isset($data['refund']) ? $this->toKobo($data['refund']) : null;
        $dispute = DisputeService::make()->decide($dispute, $request->user(), $data['outcome'], $refund, trim($data['note']));

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
