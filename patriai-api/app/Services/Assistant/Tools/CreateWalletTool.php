<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\WalletController;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * ACTION tool: create a new personal wallet for the authenticated user.
 *
 * Reuses the existing endpoint verbatim — it builds the same payload
 * POST /wallets accepts and calls WalletController::store() with the
 * authenticated Request, so request validation, the KYC wallet-count limit, and
 * WalletService::createWallet() (owner assignment, main-uniqueness, member row,
 * virtual-account provisioning) all run unchanged. The tool never queries or
 * writes the database itself and never accepts a user_id — the owner is always
 * $request->user().
 *
 * Scope: only single-owner personal wallet types that POST /wallets creates
 * completely are exposed. Deliberately EXCLUDED:
 *   - project — must go through the Projects flow (ProjectService::createProject
 *     also creates the escrow Project + milestones/vendor); a bare project wallet
 *     would be orphaned.
 *   - child   — needs the family/child linkage set up separately.
 *   - main    — auto-provisioned, exactly one per user.
 * shared/joint wallets are created owner-first here; members are invited afterward
 * through the existing invitation flow.
 *
 * The backend has no initial-balance or currency create parameter, so this tool
 * exposes neither (wallets start at ₦0 and are funded separately; currency is NGN).
 */
class CreateWalletTool implements AssistantTool
{
    /** Types safe to create fully through POST /wallets (subset of CREATABLE_TYPES). */
    private const ALLOWED_TYPES = ['savings', 'goal', 'emergency', 'giving', 'spending', 'shared', 'joint'];

    public function name(): string
    {
        return 'create_wallet';
    }

    public function description(): string
    {
        return 'Create a new wallet for the current user (e.g. "create a savings '
            .'wallet called Vacation Fund", "create a shared wallet called Family '
            .'Shopping"). '
            ."\n\nHOW TO USE:\n"
            .'1. Collect the wallet name and type conversationally (do not ask for '
            .'everything at once). Supported types: savings, goal, emergency, '
            .'giving, spending, shared, joint.\n'
            .'2. Show the user a short summary and ask them to confirm.\n'
            .'3. ONLY after they clearly say yes, call this tool with confirmed=true. '
            .'If they cancel, do not call it.\n\n'
            .'New wallets start at ₦0 (currency NGN) and are funded separately — '
            .'there is no initial balance. This tool CANNOT create a Project wallet '
            .'(use the Projects feature — it sets up escrow, milestones and a vendor), '
            .'a Child wallet, or a Main wallet (created automatically). If the user '
            .'asks for one of those, tell them so. For shared/joint wallets, mention '
            .'that members are invited separately after the wallet is created. '
            .'Calling with confirmed=false (or omitted) never creates anything.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'name' => [
                    'type' => 'string',
                    'description' => 'The wallet name (max 100 chars), e.g. "Vacation Fund".',
                ],
                'wallet_type' => [
                    'type' => 'string',
                    'enum' => self::ALLOWED_TYPES,
                    'description' => 'The kind of wallet to create.',
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'Optional short description (max 200 chars).',
                ],
                'target_amount' => [
                    'type' => 'number',
                    'description' => 'Optional savings/goal target in Naira. Ignored for wallet types without a target.',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to actually create the wallet. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => ['name', 'wallet_type', 'confirmed'],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $type = $input['wallet_type'] ?? null;

        // Guard: never route unsupported/special types through POST /wallets.
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            return [
                'created' => false,
                'error' => $this->unsupportedTypeMessage($type),
            ];
        }

        // Gate 1 — confirmation. Never write without an explicit confirmed=true.
        if (($input['confirmed'] ?? false) !== true) {
            return [
                'created' => false,
                'needs_confirmation' => true,
                'message' => 'Show the user a summary of this wallet and ask them to '
                    .'confirm. Call create_wallet again with confirmed=true only after '
                    .'they say yes.',
                'summary' => [
                    'name' => $input['name'] ?? null,
                    'wallet_type' => $type,
                    'currency' => 'NGN',
                    'description' => $input['description'] ?? null,
                    'target_amount' => $input['target_amount'] ?? null,
                ],
            ];
        }

        // Only forward fields the endpoint actually supports.
        $payload = [
            'type' => $type,
            'name' => $input['name'] ?? null,
        ];
        if (!empty($input['description'])) {
            $payload['description'] = $input['description'];
        }
        if (isset($input['target_amount'])) {
            $payload['target_amount'] = $input['target_amount'];
        }

        // Reuse the existing endpoint under the SAME authenticated user.
        $sub = Request::create('/api/v1/wallets', 'POST', $payload);
        $sub->setUserResolver(fn () => $request->user());

        try {
            $response = app(WalletController::class)->store($sub);

            // The controller returns a 422 JsonResponse (not an exception) when the
            // KYC wallet limit is hit — surface its message as a clean error.
            if ($response->getStatusCode() >= 400) {
                return [
                    'created' => false,
                    'error' => $response->getData(true)['message'] ?? 'The wallet could not be created.',
                ];
            }

            return [
                'created' => true,
                'wallet' => $response->getData(true)['data']['wallet'] ?? null,
            ];
        } catch (ValidationException $e) {
            $first = collect($e->errors())->flatten()->first() ?? 'The wallet could not be created.';

            return [
                'created' => false,
                'error' => $first,
            ];
        } catch (\Throwable $e) {
            report($e);

            return [
                'created' => false,
                'error' => 'Sorry, I couldn\'t create that wallet right now.',
            ];
        }
    }

    private function unsupportedTypeMessage(?string $type): string
    {
        return match ($type) {
            'project' => 'Project wallets are created through the Projects feature, which also sets up escrow, milestones and a vendor — I can\'t create one here.',
            'child' => 'Child wallets are set up through the family/child flow, so I can\'t create one here.',
            'main' => 'Your Main wallet is created automatically and there can only be one.',
            default => 'That wallet type isn\'t supported. You can create a savings, goal, emergency, giving, spending, shared or joint wallet.',
        };
    }
}
