<?php

namespace App\Http\Controllers\Api;

use App\Models\Dispute;
use App\Models\DisputeMessage;
use App\Models\Transaction;
use App\Services\DisputeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Disputes (DSP-01…09): about a project milestone (the builder answers, the
 * payment waits) or about a payment made or received (Patriai looks at it).
 * The builder's own list is VDM-08 (GET /vendors/me/disputes).
 */
class DisputeController extends ApiController
{
    // GET /disputes?status=open|closed  — DSP-01
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $service = DisputeService::make();
        $disputes = $service->visibleTo($user)
            ->with(['user', 'project', 'milestone'])
            ->when($request->query('status') === 'open', fn ($q) => $q->whereIn('status', ['open', 'responded', 'fixing', 'escalated', 'under_review']))
            ->when($request->query('status') === 'closed', fn ($q) => $q->whereIn('status', ['resolved', 'rejected']))
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Disputes fetched', [
            'disputes' => collect($disputes->items())->map(fn (Dispute $d) => $service->summary($d, $user))->values(),
            'pagination' => [
                'page' => $disputes->currentPage(),
                'per_page' => $disputes->perPage(),
                'total' => $disputes->total(),
                'last_page' => $disputes->lastPage(),
            ],
        ]);
    }

    // POST /disputes — DSP-02…04 {kind, milestone_id?, reference?, reason, remedy?, description, subject?, files[]?}
    // Without kind: the older {subject, category, reference?, description} form.
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$request->filled('kind')) {
            $data = $request->validate([
                'subject' => ['required', 'string', 'max:150'],
                'category' => ['required', 'in:' . implode(',', Dispute::CATEGORIES)],
                'reference' => ['nullable', 'string', 'max:100'],
                'description' => ['required', 'string', 'max:2000'],
            ]);
            $dispute = DisputeService::make()->open($user, $data);

            return $this->ok('Dispute submitted', ['dispute' => DisputeService::make()->present($dispute, $user)], 201);
        }

        $data = $request->validate([
            'kind' => ['required', 'in:' . implode(',', Dispute::KINDS)],
            'milestone_id' => ['required_if:kind,milestone', 'nullable', 'integer'],
            'reference' => ['required_unless:kind,milestone', 'nullable', 'string', 'max:100'],
            'reason' => ['required', 'in:' . implode(',', Dispute::REASONS)],
            'remedy' => ['required_if:kind,milestone', 'nullable', 'in:' . implode(',', Dispute::REMEDIES)],
            'description' => ['required', 'string', 'max:2000'],
            'subject' => ['nullable', 'string', 'max:150'],
            'files' => ['sometimes', 'array', 'max:6'],
            'files.*' => ['file', 'mimes:jpg,jpeg,png,webp,heic,mp4,mov,quicktime,m4v,pdf', 'max:51200'],
        ]);
        if ($data['kind'] !== 'milestone') {
            // DSP-02 "Pick from your transactions": one this person can see.
            $txn = Transaction::with('wallet')->where('reference', $data['reference'])->first();
            if (!$txn || !$txn->wallet || !$txn->wallet->canView($user)) {
                return $this->fail('Choose one of your transactions', 422, ['reference' => ['Choose one of your transactions.']]);
            }
        }

        $service = DisputeService::make();
        $dispute = $service->open($user, $data);
        foreach ($request->file('files', []) as $file) {
            $service->addFile($dispute, $user, $file);
        }

        return $this->ok('Dispute opened', ['dispute' => $service->present($dispute->refresh(), $user)], 201);
    }

    // GET /disputes/{dispute} — DSP-05/06/07/09
    public function show(Request $request, Dispute $dispute): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }

        return $this->ok('Dispute fetched', ['dispute' => $service->present($dispute, $request->user())]);
    }

    // POST /disputes/{dispute}/files  (multipart: file) — DSP-04, either side
    public function addFile(Request $request, Dispute $dispute): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }
        $request->validate(['file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,mp4,mov,quicktime,m4v,pdf', 'max:51200']]);
        $service->addFile($dispute, $request->user(), $request->file('file'));

        return $this->ok('Evidence added', ['dispute' => $service->present($dispute->refresh(), $request->user())], 201);
    }

    // POST /disputes/{dispute}/respond — DSP-07 {type: fix|partial_refund|disagree, fix_by?, amount?, body?}
    public function respond(Request $request, Dispute $dispute): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }
        $data = $request->validate([
            'type' => ['required', 'in:fix,partial_refund,disagree'],
            'fix_by' => ['nullable', 'date', 'after_or_equal:today'],
            'amount' => ['nullable', 'numeric', 'min:1'],
            'body' => ['nullable', 'string', 'max:2000'],
        ]);
        if (isset($data['amount'])) {
            $data['amount'] = $this->toKobo($data['amount']);
        }
        $service->respond($dispute, $request->user(), $data);

        return $this->ok('Reply sent', ['dispute' => $service->present($dispute->refresh(), $request->user())]);
    }

    // POST /disputes/{dispute}/messages — DSP-06 {body}
    public function message(Request $request, Dispute $dispute): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $service->message($dispute, $request->user(), trim($data['body']));

        return $this->ok('Sent', ['dispute' => $service->present($dispute->refresh(), $request->user())], 201);
    }

    // POST /disputes/{dispute}/offers/{message}/answer — DSP-06 {accept}
    public function answerOffer(Request $request, Dispute $dispute, DisputeMessage $message): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }
        $data = $request->validate(['accept' => ['required', 'boolean']]);
        $dispute = $service->answerOffer($dispute, $request->user(), $message, (bool) $data['accept']);

        return $this->ok($data['accept'] ? 'Offer accepted' : 'Not yet', ['dispute' => $service->present($dispute, $request->user())]);
    }

    // POST /disputes/{dispute}/escalate — DSP-08 {note?}
    public function escalate(Request $request, Dispute $dispute): JsonResponse
    {
        $service = DisputeService::make();
        if (!$service->canView($dispute, $request->user())) {
            return $this->fail('Dispute not found', 404);
        }
        $data = $request->validate(['note' => ['nullable', 'string', 'max:1000']]);
        $dispute = $service->escalate($dispute, $request->user(), $data['note'] ?? null);

        return $this->ok('Sent to Patriai', ['dispute' => $service->present($dispute, $request->user())]);
    }
}
