<?php

namespace App\Http\Controllers\Api;

use App\Services\Assistant\AssistantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssistantController extends ApiController
{
    // POST /assistant/chat  { message }
    public function chat(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            // Prior conversation turns for multi-turn context. Text only — the
            // client must NEVER put a PIN/secret in here (it isn't needed and
            // would be sent to the LLM). Server also never emits one.
            'history' => ['sometimes', 'array', 'max:40'],
            'history.*.role' => ['required_with:history', 'in:user,assistant'],
            'history.*.content' => ['required_with:history', 'string', 'max:4000'],
        ]);

        $assistant = AssistantService::make();

        if (!$assistant->isConfigured()) {
            return $this->fail('The assistant is not configured.', 503);
        }

        try {
            // The service loop derives the acting user from $request (Sanctum),
            // never from AI-supplied input.
            $result = $assistant->chat($request, $data['message'], $data['history'] ?? []);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('The assistant is temporarily unavailable.', 502);
        }

        return $this->ok('Assistant reply', [
            'reply' => $result['reply'],
            // Optional structured UI action (e.g. secure_transfer PIN hand-off).
            'action' => $result['action'],
        ]);
    }
}
