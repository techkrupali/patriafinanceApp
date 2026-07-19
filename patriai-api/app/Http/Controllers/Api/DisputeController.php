<?php

namespace App\Http\Controllers\Api;

use App\Models\Dispute;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DisputeController extends ApiController
{
    // GET /disputes
    public function index(Request $request): JsonResponse
    {
        $disputes = Dispute::where('user_id', $request->user()->id)
            ->latest()
            ->paginate(min((int) $request->query('per_page', 20), 100));

        return $this->ok('Disputes fetched', [
            'disputes' => collect($disputes->items())->map(fn ($d) => $this->serializeDispute($d)),
            'pagination' => [
                'page' => $disputes->currentPage(),
                'per_page' => $disputes->perPage(),
                'total' => $disputes->total(),
                'last_page' => $disputes->lastPage(),
            ],
        ]);
    }

    // POST /disputes  { subject, category, reference?, description }
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:150'],
            'category' => ['required', 'in:' . implode(',', Dispute::CATEGORIES)],
            'reference' => ['nullable', 'string', 'max:100'],
            'description' => ['required', 'string', 'max:2000'],
        ]);

        $dispute = Dispute::create([
            'user_id' => $request->user()->id,
            'subject' => $data['subject'],
            'category' => $data['category'],
            'reference' => $data['reference'] ?? null,
            'description' => $data['description'],
            'status' => 'open',
        ]);

        NotificationService::make()->push(
            $request->user(),
            'dispute_opened',
            'Dispute submitted',
            "We've received your dispute: {$dispute->subject}. Our team will review it.",
        );

        return $this->ok('Dispute submitted', ['dispute' => $this->serializeDispute($dispute)], 201);
    }

    // GET /disputes/{dispute}
    public function show(Request $request, Dispute $dispute): JsonResponse
    {
        if ($dispute->user_id !== $request->user()->id) {
            return $this->fail('Dispute not found', 404);
        }

        return $this->ok('Dispute fetched', ['dispute' => $this->serializeDispute($dispute)]);
    }

    protected function serializeDispute(Dispute $dispute): array
    {
        return [
            'id' => $dispute->id,
            'subject' => $dispute->subject,
            'category' => $dispute->category,
            'reference' => $dispute->reference,
            'description' => $dispute->description,
            'status' => $dispute->status,
            'resolution' => $dispute->resolution,
            'resolved_at' => $dispute->resolved_at?->toIso8601String(),
            'created_at' => $dispute->created_at?->toIso8601String(),
        ];
    }
}
