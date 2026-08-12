<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\SupportService;
use Illuminate\Http\Request;

/**
 * ACTION tool: escalate an unresolved issue to the backend/support team.
 *
 * Use ONLY when the assistant genuinely cannot resolve the user's problem with
 * get_app_info or the account tools (a persistent/unexplained transfer issue, the
 * app appears to misbehave, or the user explicitly asks for support). It creates a
 * minimal SupportRequest (via SupportService), which redacts any secret and
 * notifies the team through the existing notification mechanism.
 *
 * It accepts no user_id — the requester is always $request->user() — and no
 * PIN/OTP/password/token field. Nothing is created without confirmed=true.
 */
class CreateSupportRequestTool implements AssistantTool
{
    public function name(): string
    {
        return 'create_support_request';
    }

    public function description(): string
    {
        return 'Escalate an issue you cannot resolve to the human support team. Use '
            .'this only after get_app_info and the account tools (get_wallets, '
            .'find_transactions) cannot resolve the problem, or when the user '
            .'explicitly asks to contact support — do NOT create one for questions you '
            .'can already answer or actions you can already perform. '
            ."\n\nHOW TO USE:\n"
            .'1. Summarise the issue: a short subject and a clear description of what '
            .'the user is experiencing. If it relates to a specific transaction, '
            .'include its reference (get it from find_transactions). NEVER include a '
            .'PIN, OTP, password, or token — those are secret.\n'
            .'2. Show the user what you\'ll send and ask them to confirm.\n'
            .'3. ONLY after they clearly say yes, call this with confirmed=true. If '
            .'they cancel, do not.\n\n'
            .'Calling with confirmed=false (or omitted) never creates anything — it '
            .'returns the summary to confirm.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'subject' => [
                    'type' => 'string',
                    'description' => 'Short summary of the issue (max ~150 chars).',
                ],
                'description' => [
                    'type' => 'string',
                    'description' => 'A clear description of the problem for the support team. Do not include any PIN/OTP/password/token.',
                ],
                'category' => [
                    'type' => 'string',
                    'enum' => ['transfer', 'withdrawal', 'wallet', 'account', 'transaction', 'other'],
                    'description' => 'The kind of issue (defaults to "other").',
                ],
                'reference' => [
                    'type' => 'string',
                    'description' => 'Optional safe reference, e.g. a transaction reference from find_transactions.',
                ],
                'confirmed' => [
                    'type' => 'boolean',
                    'description' => 'Must be true to actually send the request to support. Set true ONLY after the user has seen a summary and explicitly confirmed.',
                ],
            ],
            'required' => ['subject', 'description', 'confirmed'],
            'additionalProperties' => false,
            // NOTE: no pin / otp / password / token / user_id / owner_id field.
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $subject = trim((string) ($input['subject'] ?? ''));
        $description = trim((string) ($input['description'] ?? ''));

        if ($subject === '' || $description === '') {
            return ['created' => false, 'error' => 'I need a short subject and a description of the issue before I can send it to support.'];
        }

        $support = SupportService::make();

        // Redact the summary too, so no secret is echoed even at the confirm step.
        $summary = [
            'subject' => $support->redact($subject),
            'category' => $this->category($input['category'] ?? null),
            'reference' => isset($input['reference']) ? $support->redact(trim((string) $input['reference'])) : null,
        ];

        // Confirmation gate — never create without an explicit confirmed=true.
        if (($input['confirmed'] ?? false) !== true) {
            return [
                'created' => false,
                'needs_confirmation' => true,
                'message' => 'Show the user this support summary and ask them to '
                    .'confirm. Call create_support_request again with confirmed=true '
                    .'only after they say yes.',
                'summary' => $summary,
            ];
        }

        try {
            $result = $support->create($request->user(), [
                'subject' => $subject,
                'description' => $description,
                'category' => $input['category'] ?? null,
                'reference' => $input['reference'] ?? null,
            ]);
            $req = $result['request'];

            return [
                'created' => true,
                'duplicate' => $result['duplicate'],
                'support_request' => [
                    'id' => $req->id,
                    'category' => $req->category,
                    'subject' => $req->subject,
                    'status' => $req->status,
                ],
            ];
        } catch (\Throwable $e) {
            report($e);

            return ['created' => false, 'error' => 'Sorry, I couldn\'t send that to support right now.'];
        }
    }

    private function category(?string $category): string
    {
        $c = strtolower(trim((string) $category));

        return in_array($c, \App\Models\SupportRequest::CATEGORIES, true) ? $c : 'other';
    }
}
