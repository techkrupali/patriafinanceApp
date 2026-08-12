<?php

namespace App\Services\Assistant\Contracts;

use Illuminate\Http\Request;

/**
 * A single capability the AI assistant may invoke.
 *
 * Security contract for EVERY tool:
 *  - The tool derives the acting user from $request->user() (the Sanctum-
 *    authenticated identity) — never from AI-supplied input.
 *  - Tools must NOT declare a user_id / account / owner parameter; the AI can
 *    only ever act as the currently authenticated user.
 *  - Tools reuse existing controllers/services (same authorization + scoping)
 *    rather than touching the database directly.
 */
interface AssistantTool
{
    /** Wire name the model calls (snake_case, e.g. "get_wallets"). */
    public function name(): string;

    /** Prescriptive description: what it does and when to call it. */
    public function description(): string;

    /** JSON Schema for the tool input (empty object when it takes no arguments). */
    public function inputSchema(): array;

    /**
     * Execute the tool for the authenticated user.
     *
     * @param  array<string,mixed>  $input  Validated model-supplied arguments.
     * @return array<string,mixed>          JSON-serialisable result for the model.
     */
    public function handle(Request $request, array $input): array;
}
