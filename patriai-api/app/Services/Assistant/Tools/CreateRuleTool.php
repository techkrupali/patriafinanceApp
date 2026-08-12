<?php

namespace App\Services\Assistant\Tools;

use App\Http\Controllers\Api\AutomationController;
use App\Services\Assistant\Contracts\AssistantTool;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * ACTION tool: create a recurring automation rule that moves money between two
 * of the user's OWN wallets on a schedule.
 *
 * Reuses the existing automation stack verbatim — it builds the same payload the
 * REST endpoint accepts and calls AutomationController::store() with the
 * authenticated Request, so request validation (frequency/day/amount),
 * naira→kobo conversion, and AutomationService::createRule()'s authorization
 * (BOTH wallets must belong to the caller, source ≠ destination, amount > 0) all
 * run unchanged. The tool never queries or writes the database itself and never
 * accepts a user_id — identity is always $request->user().
 *
 * Two safety gates before anything is written:
 *   1. confirmed must be true (the AI shows a summary and gets an explicit "yes"
 *      first); otherwise the tool returns a confirmation payload and writes
 *      nothing.
 *   2. The backend remains the sole authority on whether the rule is allowed.
 *
 * Scope note: the current rule engine only supports internal wallet-to-wallet
 * transfers between the user's own wallets. External bank-account recurring
 * rules are NOT supported by the backend, so this tool does not expose them.
 */
class CreateRuleTool implements AssistantTool
{
    public function name(): string
    {
        return 'create_rule';
    }

    public function description(): string
    {
        return 'Create a recurring automation rule that automatically moves money '
            .'from one of the user\'s wallets to another of THEIR OWN wallets on a '
            .'schedule (e.g. "move ₦5,000 from Main Wallet to Savings every month"). '
            ."\n\nHOW TO USE:\n"
            .'1. Resolve wallet names to ids with get_wallets first.\n'
            .'2. Collect the missing details conversationally — do not demand '
            .'everything at once. Required: source_wallet_id, destination_wallet_id, '
            .'amount, frequency. For weekly rules also collect day_of_week (1=Mon…'
            .'7=Sun); for monthly rules collect day_of_month (1–28).\n'
            .'3. Show the user a plain-language summary of the rule and ask them to '
            .'confirm.\n'
            .'4. ONLY after the user clearly says yes, call this tool with '
            .'confirmed=true. If they say no/cancel, do not call it.\n\n'
            .'This tool ONLY supports transfers between the user\'s own wallets. It '
            .'CANNOT send money to an external bank account — if the user asks for '
            .'that, tell them recurring bank payouts aren\'t supported yet. '
            .'Calling with confirmed=false (or omitted) never creates anything — it '
            .'returns the details to confirm.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'source_wallet_id' => [
                    'type' => 'integer',
                    'description' => 'Wallet the money comes FROM (must be one of the user\'s own wallets).',
                ],
                'destination_wallet_id' => [
                    'type' => 'integer',
                    'description' => 'Wallet the money goes TO (must be another of the user\'s own wallets).',
                ],
                'amount' => [
                    'type' => 'number',
                    'description' => 'Amount to move each run, in Naira (e.g. 5000).',
                ],
                'frequency' => [
                    'type' => 'string',
                    'enum' => ['daily', 'weekly', 'monthly'],
                ],
                'day_of_week' => [
                    'type' => 'integer',
                    'minimum' => 1,
                    'maximum' => 7,
                    'description' => 'For weekly rules only: 1=Monday … 7=Sunday.',
                ],
                'day_of_month' => [
                    'type' => 'integer',
                    'minimum' => 1,
                    'maximum' => 28,
                    'description' => 'For monthly rules only: day of the month (1–28).',
                ],
                'min_balance' => [
                    'type' => 'number',
                    'description' => 'Optional. Skip a run if the source wallet would fall below this Naira balance afterwards.',
                ],
                'name' => [
                    'type' => 'string',
                    'description' => 'Optional short label for the rule. A sensible default is generated if omitted.',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to actually create the rule. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => ['source_wallet_id', 'destination_wallet_id', 'amount', 'frequency', 'confirmed'],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        // Gate 1 — confirmation. Never write without an explicit confirmed=true.
        if (($input['confirmed'] ?? false) !== true) {
            return [
                'created' => false,
                'needs_confirmation' => true,
                'message' => 'Show the user a summary of this rule and ask them to '
                    .'confirm. Call create_rule again with confirmed=true only after '
                    .'they say yes.',
                'summary' => [
                    'source_wallet_id' => $input['source_wallet_id'] ?? null,
                    'destination_wallet_id' => $input['destination_wallet_id'] ?? null,
                    'amount' => $input['amount'] ?? null,
                    'frequency' => $input['frequency'] ?? null,
                    'day_of_week' => $input['day_of_week'] ?? null,
                    'day_of_month' => $input['day_of_month'] ?? null,
                    'min_balance' => $input['min_balance'] ?? null,
                ],
            ];
        }

        // Map AI field names → the existing endpoint's payload. Only fields the
        // backend actually supports are forwarded.
        $payload = [
            'name' => $this->ruleName($input),
            'from_wallet_id' => $input['source_wallet_id'] ?? null,
            'to_wallet_id' => $input['destination_wallet_id'] ?? null,
            'amount' => $input['amount'] ?? null,
            'frequency' => $input['frequency'] ?? null,
        ];
        if (($input['frequency'] ?? null) === 'weekly' && isset($input['day_of_week'])) {
            $payload['day_of_week'] = $input['day_of_week'];
        }
        if (($input['frequency'] ?? null) === 'monthly' && isset($input['day_of_month'])) {
            $payload['day_of_month'] = $input['day_of_month'];
        }
        if (isset($input['min_balance'])) {
            $payload['min_balance'] = $input['min_balance'];
        }

        // Reuse the existing endpoint under the SAME authenticated user. The
        // controller runs request validation and the service runs wallet-ownership
        // authorization — the tool trusts neither the AI nor itself for that.
        $sub = Request::create('/api/v1/automations', 'POST', $payload);
        $sub->setUserResolver(fn () => $request->user());

        try {
            $response = app(AutomationController::class)->store($sub);
            $rule = $response->getData(true)['data']['automation'] ?? null;

            return [
                'created' => true,
                'rule' => $rule,
            ];
        } catch (ValidationException $e) {
            // Surface the backend's own message (already user-friendly), never a trace.
            $first = collect($e->errors())->flatten()->first() ?? 'The rule could not be created.';

            return [
                'created' => false,
                'error' => $first,
            ];
        } catch (\Throwable $e) {
            report($e);

            return [
                'created' => false,
                'error' => 'Sorry, I couldn\'t create that rule right now.',
            ];
        }
    }

    /** Use the caller's label, or synthesise a readable default. */
    private function ruleName(array $input): string
    {
        if (!empty($input['name'])) {
            return (string) $input['name'];
        }

        $amount = isset($input['amount']) ? '₦'.number_format((float) $input['amount'], 2) : 'money';
        $freq = $input['frequency'] ?? 'scheduled';

        return trim("Auto-move {$amount} ({$freq})");
    }
}
