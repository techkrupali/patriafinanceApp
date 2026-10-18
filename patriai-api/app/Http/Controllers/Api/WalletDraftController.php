<?php

namespace App\Http\Controllers\Api;

use App\Models\Wallet;
use App\Models\WalletDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Wallet drafts (client: "Allow draft for all wallet types, so they can pick up
 * where they left off"). The app auto-saves the setup form here; POST /wallets
 * with draft_id deletes the draft once the wallet exists.
 */
class WalletDraftController extends ApiController
{
    private const MAX_DRAFTS = 20;

    /** Drafts are a convenience, not a vault — keep them small. */
    private const MAX_DATA_BYTES = 50_000;

    private function serialize(WalletDraft $draft): array
    {
        return [
            'id' => $draft->id,
            'type' => $draft->type,
            'name' => $draft->name,
            'step' => $draft->step,
            'total_steps' => $draft->total_steps,
            'data' => $draft->data ?? (object) [],
            'updated_at' => $draft->updated_at?->toIso8601String(),
        ];
    }

    /** Secrets (e.g. an emergency PIN) are never stored in a draft, whatever the client sends. */
    private function withoutSecrets(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $clean = [];
        foreach ($value as $key => $item) {
            if (is_string($key) && preg_match('/pin|password|secret/i', $key)) {
                continue;
            }
            $clean[$key] = $this->withoutSecrets($item);
        }

        return $clean;
    }

    private function validated(Request $request, bool $creating): array
    {
        $data = $request->validate([
            'type' => [$creating ? 'required' : 'sometimes', 'in:' . implode(',', array_diff(Wallet::TYPES, ['main']))],
            'name' => ['nullable', 'string', 'max:100'],
            'step' => ['sometimes', 'integer', 'between:1,10'],
            'total_steps' => ['sometimes', 'integer', 'between:1,10'],
            'data' => ['sometimes', 'nullable', 'array'],
        ]);
        if (array_key_exists('data', $data)) {
            $data['data'] = $this->withoutSecrets($data['data'] ?? []);
            if (strlen((string) json_encode($data['data'])) > self::MAX_DATA_BYTES) {
                throw ValidationException::withMessages(['data' => 'This draft is too large to save.']);
            }
        }

        return $data;
    }

    // GET /wallet-drafts
    public function index(Request $request): JsonResponse
    {
        $drafts = WalletDraft::where('user_id', $request->user()->id)->latest('updated_at')->get();

        return $this->ok('Drafts fetched', ['drafts' => $drafts->map(fn ($d) => $this->serialize($d))->values()]);
    }

    // POST /wallet-drafts  { type, name?, step?, total_steps?, data? }
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (WalletDraft::where('user_id', $user->id)->count() >= self::MAX_DRAFTS) {
            return $this->fail('You have too many unfinished wallets — finish or discard one first.', 422);
        }

        $draft = WalletDraft::create($this->validated($request, creating: true) + ['user_id' => $user->id]);

        return $this->ok('Draft saved', ['draft' => $this->serialize($draft)], 201);
    }

    // PUT /wallet-drafts/{walletDraft}
    public function update(Request $request, WalletDraft $walletDraft): JsonResponse
    {
        if ($walletDraft->user_id !== $request->user()->id) {
            return $this->fail('Draft not found', 404);
        }

        $walletDraft->update($this->validated($request, creating: false));
        $walletDraft->touch();

        return $this->ok('Draft saved', ['draft' => $this->serialize($walletDraft->refresh())]);
    }

    // DELETE /wallet-drafts/{walletDraft}
    public function destroy(Request $request, WalletDraft $walletDraft): JsonResponse
    {
        if ($walletDraft->user_id !== $request->user()->id) {
            return $this->fail('Draft not found', 404);
        }
        $walletDraft->delete();

        return $this->ok('Draft discarded');
    }
}
