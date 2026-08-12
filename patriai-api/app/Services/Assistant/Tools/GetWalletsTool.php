<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\WalletController;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;

/**
 * Read-only: list the authenticated user's wallets (name, type, balance, role).
 *
 * Reuses the existing GET /api/v1/wallets implementation verbatim — it calls
 * WalletController::index() with the same authenticated Request, so identity,
 * scoping (own + member wallets), and authorization are exactly what the app's
 * REST endpoint already enforces. No arbitrary user_id is accepted, no wallet
 * permissions are changed, and nothing is written.
 */
class GetWalletsTool implements AssistantTool
{
    public function name(): string
    {
        return 'get_wallets';
    }

    public function description(): string
    {
        return 'List the wallets belonging to the current user, with each '
            .'wallet\'s name, type, balance, currency, status and the user\'s '
            .'role. Call this to answer questions like "What wallets do I '
            .'have?", "Show me my wallets", or "What is my Main Wallet '
            .'balance?". Read-only.';
    }

    public function inputSchema(): array
    {
        // No arguments — the tool always acts for the authenticated user.
        return [
            'type' => 'object',
            'properties' => (object) [],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        // Reuse the existing wallet listing endpoint under the same auth context.
        $response = app(WalletController::class)->index($request);
        $wallets = $response->getData(true)['data']['wallets'] ?? [];

        // Return a compact, model-friendly view (the AI never needs internal ids
        // or virtual-account plumbing to answer wallet questions).
        $summary = array_map(fn ($w) => [
            'name' => $w['name'],
            'type' => $w['type'],
            'balance' => $w['balance'],
            'currency' => $w['currency'],
            'status' => $w['status'],
            'my_role' => $w['my_role'] ?? null,
        ], $wallets);

        return [
            'count' => count($summary),
            'wallets' => $summary,
        ];
    }
}
