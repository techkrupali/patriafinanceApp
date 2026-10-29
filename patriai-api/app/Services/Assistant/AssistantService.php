<?php

namespace App\Services\Assistant;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Runs a server-side Claude tool-use loop for the AI assistant.
 *
 * The LLM never touches the database or the user's identity. Each tool call it
 * requests is executed here, on the server, for the CURRENTLY authenticated
 * user (derived from $request->user()), by delegating to a tool in the registry
 * — which in turn reuses the app's existing controllers/services. The API key
 * is read from config (env-backed) and is never sent to the client.
 */
class AssistantService
{
    /** Hard cap on tool-use round trips to prevent runaway loops. */
    private const MAX_STEPS = 5;

    /** Hard cap on transactions shown in one transaction_list action. */
    private const MAX_DISPLAY = 50;

    public function __construct(private ToolRegistry $tools)
    {
    }

    public static function make(): self
    {
        return new self(new ToolRegistry());
    }

    public function isConfigured(): bool
    {
        return !empty(config('services.anthropic.api_key'));
    }

    /**
     * Answer a user message, executing any tools Claude requests.
     *
     * @param  array<int,array{role:string,content:string}>  $history  prior turns
     * @return array{reply:string, action:?array}  the reply text plus an optional
     *         structured client action (e.g. the create_transfer secure-PIN
     *         hand-off) for the frontend to render. The action never contains a
     *         PIN — the tool itself is PIN-less.
     */
    public function chat(Request $request, string $message, array $history = []): array
    {
        $messages = $this->buildMessages($history, $message);
        $action = null;

        for ($step = 0; $step < self::MAX_STEPS; $step++) {
            $response = $this->callClaude($messages);

            $stopReason = $response['stop_reason'] ?? null;
            $content = $response['content'] ?? [];

            if ($stopReason !== 'tool_use') {
                return ['reply' => $this->extractText($content), 'action' => $action];
            }

            // Echo the assistant turn back verbatim (preserving thinking/tool_use
            // blocks), then answer every tool_use with a tool_result.
            $messages[] = ['role' => 'assistant', 'content' => $content];

            $toolResults = [];
            foreach ($content as $block) {
                if (($block['type'] ?? null) !== 'tool_use') {
                    continue;
                }
                $run = $this->runTool($request, $block);
                $toolResults[] = $run['block'];

                // Surface the create_transfer secure hand-off to the client so the
                // PIN UI can render inside the chat. Carries no secret — the tool
                // returns wallet ids / amount / idempotency_key only, never a PIN.
                if (($block['name'] ?? null) === 'create_transfer'
                    && ($run['raw']['requires_pin_authorization'] ?? false) === true) {
                    $action = [
                        'type' => 'secure_transfer',
                        'summary' => $run['raw']['summary'] ?? null,
                        'authorization' => $run['raw']['authorization'] ?? null,
                    ];
                }

                // Surface find_transactions results as a structured list the app can
                // render natively. Reuses the tool's own authorized, scoped output —
                // no query/authorization logic here.
                if (($block['name'] ?? null) === 'find_transactions'
                    && is_array($run['raw']['transactions'] ?? null)) {
                    $action = $this->transactionListAction($run['raw']);
                }

                // Surface group_transactions results as a structured grouped summary
                // + list. Reuses the tool's authorized aggregate/rows — no logic here.
                if (($block['name'] ?? null) === 'group_transactions'
                    && ($run['raw']['is_group'] ?? false) === true) {
                    $action = $this->transactionGroupAction($run['raw']);
                }

                // Surface a created support escalation so the app can show a card.
                if (($block['name'] ?? null) === 'create_support_request'
                    && ($run['raw']['created'] ?? false) === true) {
                    $sr = $run['raw']['support_request'] ?? [];
                    $action = [
                        'type' => 'support_request',
                        'request_id' => $sr['id'] ?? null,
                        'category' => $sr['category'] ?? null,
                        'subject' => $sr['subject'] ?? null,
                        'status' => $sr['status'] ?? null,
                    ];
                }
            }

            $messages[] = ['role' => 'user', 'content' => $toolResults];
        }

        return ['reply' => 'I wasn\'t able to finish answering that. Please try rephrasing.', 'action' => $action];
    }

    /** Prior conversation turns (validated) plus the new user message. */
    private function buildMessages(array $history, string $message): array
    {
        $messages = [];
        foreach ($history as $turn) {
            $role = $turn['role'] ?? null;
            $text = $turn['content'] ?? null;
            if (in_array($role, ['user', 'assistant'], true) && is_string($text) && $text !== '') {
                $messages[] = ['role' => $role, 'content' => $text];
            }
        }
        $messages[] = ['role' => 'user', 'content' => $message];

        return $messages;
    }

    /**
     * Execute one tool_use block. Returns the tool_result block for the loop plus
     * the raw tool result so the caller can surface a client action.
     *
     * @return array{block:array, raw:?array}
     */
    /** Tools that read the person's transactions (ME-12 privacy switch). */
    private const READS_TRANSACTIONS = ['find_transactions', 'group_transactions', 'flag_transaction'];

    private function runTool(Request $request, array $block): array
    {
        $tool = $this->tools->get($block['name'] ?? '');

        if (!$tool) {
            return ['block' => [
                'type' => 'tool_result',
                'tool_use_id' => $block['id'],
                'content' => 'Unknown tool.',
                'is_error' => true,
            ], 'raw' => null];
        }

        // ME-12 "Steward can read my transactions" turned off: the tools that read them say so.
        if (in_array($block['name'] ?? '', self::READS_TRANSACTIONS, true) && $request->user()?->setting('steward_reads_transactions', true) === false) {
            return ['block' => [
                'type' => 'tool_result',
                'tool_use_id' => $block['id'],
                'content' => json_encode(['error' => 'The person turned off "Steward can read my transactions" in Privacy and data. Tell them, and that they can turn it back on there.']),
            ], 'raw' => null];
        }

        try {
            $result = $tool->handle($request, (array) ($block['input'] ?? []));

            return ['block' => [
                'type' => 'tool_result',
                'tool_use_id' => $block['id'],
                'content' => json_encode($result),
            ], 'raw' => $result];
        } catch (\Throwable $e) {
            report($e);

            return ['block' => [
                'type' => 'tool_result',
                'tool_use_id' => $block['id'],
                'content' => 'The tool failed to run.',
                'is_error' => true,
            ], 'raw' => null];
        }
    }

    /** POST /v1/messages with the current conversation + tool definitions. */
    private function callClaude(array $messages): array
    {
        $cfg = config('services.anthropic');

        $response = Http::withHeaders([
            'x-api-key' => $cfg['api_key'],
            'anthropic-version' => $cfg['version'],
            'content-type' => 'application/json',
        ])->timeout(60)->post(rtrim($cfg['base_url'], '/').'/messages', [
            'model' => $cfg['model'],
            'max_tokens' => $cfg['max_tokens'],
            'system' => $this->systemPrompt(),
            'tools' => $this->tools->definitions(),
            'messages' => $messages,
        ]);

        if (!$response->successful()) {
            throw new RuntimeException('Assistant provider error: '.$response->status());
        }

        return $response->json();
    }

    /**
     * Build the client-facing transaction_list action from find_transactions'
     * already-authorized output. Caps the displayed rows and reflects has_more so
     * the app never renders hundreds of rows at once.
     *
     * @param  array  $raw  the find_transactions tool result
     */
    private function transactionListAction(array $raw): array
    {
        $all = $raw['transactions'] ?? [];
        $shown = array_slice($all, 0, self::MAX_DISPLAY);

        return [
            'type' => 'transaction_list',
            'title' => 'Transactions',
            'summary' => [
                'total_transactions' => $raw['total'] ?? count($shown),
                'count' => count($shown),
                'total_amount' => $raw['total_amount'] ?? null,
            ],
            'transactions' => $shown,
            'page' => $raw['page'] ?? 1,
            'per_page' => $raw['per_page'] ?? null,
            'has_more' => ($raw['has_more'] ?? false) || count($all) > self::MAX_DISPLAY,
        ];
    }

    /**
     * Build the client-facing transaction_group action from group_transactions'
     * authorized output. The summary is a true grand total over all matching
     * authorized transactions; the list is a capped page.
     */
    private function transactionGroupAction(array $raw): array
    {
        $all = $raw['transactions'] ?? [];
        $shown = array_slice($all, 0, self::MAX_DISPLAY);

        return [
            'type' => 'transaction_group',
            'title' => $raw['title'] ?? 'Transactions',
            'target' => $raw['target'] ?? null,
            'summary' => $raw['summary'] ?? null,
            'transactions' => $shown,
            'page' => $raw['page'] ?? 1,
            'per_page' => $raw['per_page'] ?? null,
            'has_more' => ($raw['has_more'] ?? false) || count($all) > self::MAX_DISPLAY,
        ];
    }

    private function systemPrompt(): string
    {
        $today = now()->toDateString();

        return 'You are the Patriai in-app assistant for a family-finance app. '
            .'Help the signed-in user with their own wallets and money. Use the '
            .'provided tools to look up the user\'s real data instead of guessing. '
            .'You can only ever see and act on the currently signed-in user\'s '
            .'account. Money amounts are in Nigerian Naira (₦). '
            ."Today's date is {$today}. "
            .'For questions about how the app works or how to do something (creating '
            .'wallets, sending money, bank transfers, withdrawals, approvals, disputes, '
            .'transaction history, automations, fees, limits, PIN/security, why a '
            .'transfer is pending or failed, navigation, support), use get_app_info '
            .'and answer from what it returns — never invent app details. For a '
            .'question about the user\'s OWN data (their wallets, a specific '
            .'transaction, why THEIR transfer is pending), use get_wallets / '
            .'find_transactions. NEVER reveal, request, or repeat a PIN, OTP, '
            .'password, token, or any secret — you never have access to them. If you '
            .'cannot confidently answer from get_app_info or the user\'s data, say '
            .'plainly that you can\'t resolve it and offer to help raise a dispute '
            .'(Dispute Center) or contact support — do NOT guess or make up an answer. '
            .'If you truly cannot resolve the issue (a persistent or unexplained '
            .'transfer/withdrawal problem, the app appears to behave incorrectly, or '
            .'the user explicitly asks to reach support), offer to send it to the '
            .'support team and, once they agree, use create_support_request. Do NOT '
            .'escalate things get_app_info can answer, instructions you can give, or '
            .'actions you can already perform. Never put a PIN, OTP, password, or '
            .'token in a support request. Summarise the issue, show the user what '
            .'you\'ll send, and only call create_support_request with confirmed=true '
            .'after they say yes. '
            .'When the user asks for a relative time '
            .'range (e.g. last 24 hours, last 7 days, last month, last 3 months), '
            .'compute explicit date_from/date_to values from today before calling '
            .'a tool. When you call find_transactions, the app automatically renders '
            .'the results as a structured transaction list — do NOT re-list the '
            .'transactions line by line in your text. Instead give a short summary '
            .'(e.g. "Here are your 8 transactions to John, totalling ₦85,000.") and '
            .'let the list show the detail. Use per_page of 10–20 (never more than '
            .'50). If the user asks to "show more", call find_transactions again with '
            .'the next page number. '
            ."\n\nFor grouped/aggregate questions about ONE target — a wallet, a bank "
            .'account number, or a recipient (e.g. "how much have I sent to account '
            .'1234567890?", "how many times have I paid John?", "total everything '
            .'sent to Savings this month") — use group_transactions, not '
            .'find_transactions. It returns a grand-total summary (count, total, '
            .'first/latest date) over all matching authorised transactions, and the '
            .'app renders it as a grouped list. Give a short summary in text (e.g. '
            .'"You have sent ₦85,000 to that account across 8 transactions."); the '
            .'card shows the detail. If it returns needs_disambiguation, ask the user '
            .'which recipient they mean before continuing. For "show more" on a group, '
            .'call group_transactions again with the SAME target/filters and the next '
            .'page. '
            ."\n\nWhen the user wants to set up a recurring rule/automation, use "
            .'create_rule. Collect the required details conversationally (source '
            .'wallet, destination wallet, amount, how often, and the day for '
            .'weekly/monthly) without asking for everything at once, and resolve '
            .'wallet names to ids with get_wallets. Rules can only move money '
            .'between the user\'s OWN wallets — recurring payouts to external bank '
            .'accounts are not supported; if asked, say so. Before creating, show a '
            .'clear summary and ask the user to confirm; only call create_rule with '
            .'confirmed=true after they explicitly say yes, and never if they '
            .'cancel. '
            ."\n\nWhen the user wants to create a new wallet, use create_wallet. "
            .'Collect the name and type conversationally. Supported types are '
            .'savings, goal, giving, spending, shared and joint. You '
            .'cannot create a Project wallet (that\'s the Projects feature), an '
            .'Emergency wallet (its access rules, emergency PIN and recipients are '
            .'set in the guided flow: Wallets → Create wallet → Emergency), a '
            .'Child wallet, or a Main wallet — say so if asked. New wallets start '
            .'empty (₦0, NGN) and are funded separately. Show a summary, get an '
            .'explicit yes, then call create_wallet with confirmed=true. '
            ."\n\nWhen the user wants to move money between their wallets, use "
            .'create_transfer. NEVER ask for, accept, or repeat a transaction PIN, '
            .'password, or OTP — you must never handle secrets. Collect source '
            .'wallet, destination wallet and amount, show a summary, and get an '
            .'explicit yes before calling create_transfer with confirmed=true. The '
            .'transfer tool does not move money itself; it returns a secure hand-off, '
            .'and the user finishes the transfer by entering their PIN on the secure '
            .'screen. Relay that to the user. create_transfer also supports one-off '
            .'transfers to an external bank account (destination_type="bank"): '
            .'collect the bank and 10-digit account number, and the tool will verify '
            .'and show the real account holder name before you confirm. Recurring '
            .'external-bank transfers are NOT supported — if the user asks to send to '
            .'a bank account on a schedule (e.g. monthly), explain that recurring bank '
            .'payouts aren\'t available yet and offer a one-off bank transfer instead; '
            .'do not use create_rule for that (rules are wallet-to-wallet only). '
            .'Never treat an ambiguous message as confirmation. '
            ."\n\nWhen the user wants to approve a pending withdrawal, use "
            .'approve_withdrawal. First call it with no id to list the withdrawals '
            .'awaiting their approval, match the one they mean, show a summary '
            .'(requester, wallet, amount, date, status) and ask them to confirm. '
            .'Only after an explicit yes, call it again with the approval_request_id '
            .'and confirmed=true. Approving needs no PIN — never ask for one. The '
            .'backend decides whether they may approve. Never treat an ambiguous '
            .'message as confirmation. '
            ."\n\nWhen the user wants to flag/dispute a transaction, use "
            .'flag_transaction. First locate the transaction with find_transactions '
            .'(if several match, show them and ask which one), then ask for a reason, '
            .'show a summary and get an explicit yes before calling flag_transaction '
            .'with the transaction_reference, reason and confirmed=true. Flagging '
            .'needs no PIN. Never treat an ambiguous message as confirmation. Keep '
            .'replies concise and friendly.';
    }

    /** Concatenate the text blocks of an assistant message. */
    private function extractText(array $content): string
    {
        $text = '';
        foreach ($content as $block) {
            if (($block['type'] ?? null) === 'text') {
                $text .= $block['text'];
            }
        }

        return trim($text) !== '' ? $text : 'Sorry, I don\'t have a response for that.';
    }
}
