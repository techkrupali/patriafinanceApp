<?php

namespace App\Services\Assistant\Tools;

use App\Services\Assistant\Contracts\AssistantTool;
use App\Services\KycService;
use Illuminate\Http\Request;

/**
 * Read-only: authoritative help/how-the-app-works content for the AI Assistant.
 *
 * Every article is grounded in the real app — its behaviour, validation, and
 * configuration (transfer fee, KYC limits are read live) — and mirrors the app's
 * own Help & FAQ. The AI must answer app/how-to questions from this content
 * rather than inventing details; when no article matches, the tool says so
 * (found=false) so the assistant can decline instead of hallucinating.
 *
 * This tool performs NO financial action and exposes NO secret (PIN/OTP/etc.).
 * Account-specific questions ("what are my wallets?", "why is my transfer
 * pending?") should still use get_wallets / find_transactions.
 */
class AppKnowledgeTool implements AssistantTool
{
    public function name(): string
    {
        return 'get_app_info';
    }

    public function description(): string
    {
        return 'Get accurate information about how the Patriai app works and how to '
            .'do things, to answer the user\'s app/how-to/support questions. Pass a '
            .'topic to get that article; omit it to list the topics you can explain. '
            ."\nTopics: creating_a_wallet, sending_money, bank_transfers, withdrawals, "
            .'approvals, disputes, transaction_history, automations, fees, limits, '
            .'pin_and_security, pending_or_failed, funding_a_wallet, kyc_tiers, '
            .'family_roles, freezing_a_wallet, money_safety, getting_support.'
            ."\nAnswer ONLY from what this returns — do not invent app details. If it "
            .'returns found=false, tell the user you can\'t confidently answer and '
            .'offer to help them raise a dispute or contact support. This tool never '
            .'moves money and never handles a PIN. Use get_wallets / find_transactions '
            .'for the user\'s own data.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'topic' => [
                    'type' => 'string',
                    'description' => 'The help topic to explain (e.g. "sending_money", "fees", "pending_or_failed"). Omit to list available topics.',
                ],
            ],
            'required' => [],
            'additionalProperties' => false,
        ];
    }

    public function handle(Request $request, array $input): array
    {
        $articles = $this->articles();
        $topic = $this->resolve(trim((string) ($input['topic'] ?? '')));

        if ($topic === null || !isset($articles[$topic])) {
            return [
                'found' => false,
                'message' => 'No matching help article. If you can\'t confidently answer '
                    .'from other topics or the user\'s own data, say you can\'t resolve it '
                    .'and offer to raise a dispute or contact support — do not guess.',
                'available_topics' => $this->topicList($articles),
            ];
        }

        return [
            'found' => true,
            'topic' => $topic,
            'title' => $articles[$topic]['title'],
            'answer' => $articles[$topic]['answer'],
        ];
    }

    /** Map a free-text topic to a known slug (exact, normalized, or alias). */
    private function resolve(string $topic): ?string
    {
        if ($topic === '') {
            return null;
        }
        $slug = strtolower(str_replace([' ', '-'], '_', $topic));
        $articles = $this->articles();
        if (isset($articles[$slug])) {
            return $slug;
        }

        $aliases = [
            'create_wallet' => 'creating_a_wallet', 'new_wallet' => 'creating_a_wallet', 'wallets' => 'creating_a_wallet',
            'send_money' => 'sending_money', 'transfer' => 'sending_money', 'transfers' => 'sending_money',
            'bank_transfer' => 'bank_transfers', 'external_transfer' => 'bank_transfers', 'send_to_bank' => 'bank_transfers',
            'withdraw' => 'withdrawals', 'withdrawal' => 'withdrawals', 'cash_out' => 'withdrawals',
            'approval' => 'approvals', 'approve' => 'approvals',
            'dispute' => 'disputes', 'flag' => 'disputes', 'report_a_problem' => 'disputes', 'flag_transaction' => 'disputes',
            'history' => 'transaction_history', 'transactions' => 'transaction_history', 'statement' => 'transaction_history',
            'automation' => 'automations', 'rules' => 'automations', 'recurring' => 'automations', 'smart_rules' => 'automations',
            'fee' => 'fees', 'charges' => 'fees', 'cost' => 'fees',
            'limit' => 'limits', 'daily_limit' => 'limits', 'transfer_limit' => 'limits',
            'pin' => 'pin_and_security', 'security' => 'pin_and_security', 'password' => 'pin_and_security', 'biometrics' => 'pin_and_security',
            'pending' => 'pending_or_failed', 'failed' => 'pending_or_failed', 'stuck' => 'pending_or_failed', 'why_pending' => 'pending_or_failed',
            'fund' => 'funding_a_wallet', 'funding' => 'funding_a_wallet', 'add_money' => 'funding_a_wallet', 'top_up' => 'funding_a_wallet',
            'kyc' => 'kyc_tiers', 'verification' => 'kyc_tiers', 'tiers' => 'kyc_tiers', 'verify' => 'kyc_tiers',
            'family' => 'family_roles', 'roles' => 'family_roles', 'members' => 'family_roles', 'permissions' => 'family_roles',
            'freeze' => 'freezing_a_wallet', 'lock' => 'freezing_a_wallet',
            'safe' => 'money_safety', 'safety' => 'money_safety',
            'support' => 'getting_support', 'help' => 'getting_support', 'contact' => 'getting_support', 'escalate' => 'getting_support',
        ];

        return $aliases[$slug] ?? null;
    }

    /** @return array<int,array{topic:string,title:string}> */
    private function topicList(array $articles): array
    {
        $out = [];
        foreach ($articles as $slug => $a) {
            $out[] = ['topic' => $slug, 'title' => $a['title']];
        }

        return $out;
    }

    /**
     * The help content. Fee and KYC limits are read live from config/KycService so
     * the answers can never drift from the real app.
     *
     * @return array<string,array{title:string,answer:string}>
     */
    private function articles(): array
    {
        $fee = number_format(((int) config('services.matrix.transfer_fee_kobo', 2000)) / 100, 2, '.', '');
        $kyc = KycService::make();
        $naira = fn (?int $kobo) => $kobo === null ? 'no daily limit' : '₦'.number_format($kobo / 100, 0);
        $t01 = $kyc->limits(0);
        $t2 = $kyc->limits(2);
        $t3 = $kyc->limits(3);

        return [
            'creating_a_wallet' => [
                'title' => 'Creating a wallet',
                'answer' => 'You can create wallets like savings, goal, emergency, giving, spending, shared or joint. '
                    .'Open Wallets → New, pick a type and name it — a new wallet starts empty (₦0, NGN) and you fund it '
                    .'separately. You can also just ask me to create one. How many wallets you can have depends on your '
                    .'KYC tier. (Project wallets are set up through the Projects feature; your Main wallet is created for '
                    .'you automatically.)',
            ],
            'sending_money' => [
                'title' => 'Sending money',
                'answer' => 'Open a wallet and tap Transfer, or ask me. You can send to another of your wallets, to a '
                    .'Patriai user, or to a bank account. Every transfer is authorised with your transaction PIN, '
                    .'which you enter on the secure screen — I never see or handle it. I can set the transfer up and hand '
                    .'you to that secure screen to finish it.',
            ],
            'bank_transfers' => [
                'title' => 'Transferring to a bank account',
                'answer' => 'Choose a bank and enter the recipient\'s 10-digit account number. The account holder\'s name '
                    .'is verified before you send, so you can confirm it\'s right. External bank transfers carry a ₦'.$fee
                    .' fee (moving money between your own wallets or to another Patriai user is free). You authorise it '
                    .'with your PIN on the secure screen.',
            ],
            'withdrawals' => [
                'title' => 'Withdrawals',
                'answer' => 'A withdrawal sends money from a wallet to a bank account, using the same secure, PIN-protected '
                    .'flow as a bank transfer, with the ₦'.$fee.' external fee. On shared wallets a withdrawal may need '
                    .'approval before it goes through.',
            ],
            'approvals' => [
                'title' => 'Spending approvals',
                'answer' => 'On shared wallets you can require chosen members to approve withdrawals and transfers above a '
                    .'set threshold. When approval is needed the spend is held as a pending request until enough eligible '
                    .'approvers (owner, co-owner, admin, or anyone granted approval rights) sign off; then it completes '
                    .'automatically. Approving does not need a PIN, and you can\'t approve your own request. I can help you '
                    .'approve a pending withdrawal.',
            ],
            'disputes' => [
                'title' => 'Flagging or disputing a transaction',
                'answer' => 'If something looks wrong with a transaction you can flag it: go to Profile → Dispute Center → '
                    .'Raise a dispute, add the transaction reference and a reason, and the team will review it. You can also '
                    .'ask me to flag a specific transaction for you.',
            ],
            'transaction_history' => [
                'title' => 'Transaction history',
                'answer' => 'You can see your transactions across all your wallets, and filter by wallet, type, status, date '
                    .'range, or search for a recipient or account. Ask me things like "show my last 10 transactions", '
                    .'"show today\'s transactions", or "how much have I sent to John?" and I\'ll pull them up.',
            ],
            'automations' => [
                'title' => 'Automations (smart rules)',
                'answer' => 'Automations move money on a schedule — for example a monthly allowance from your Main wallet to a '
                    .'child or savings wallet. Rules run daily, weekly, or monthly and can keep a minimum balance in the '
                    .'source wallet. Automations only move money between your OWN wallets — recurring transfers to an '
                    .'external bank account aren\'t supported. I can help you create a rule.',
            ],
            'fees' => [
                'title' => 'Fees',
                'answer' => 'Transfers to an external bank account have a ₦'.$fee.' fee. Moving money between your own wallets, '
                    .'or sending to another Patriai user, is free. Funding a wallet from your bank is free.',
            ],
            'limits' => [
                'title' => 'Transfer & wallet limits',
                'answer' => 'Your daily transfer limit and how many wallets you can hold depend on your KYC tier: '
                    .'Tier 0–1 — '.$naira($t01['daily_transfer_limit']).'/day, up to '.$t01['max_wallets'].' wallets; '
                    .'Tier 2 — '.$naira($t2['daily_transfer_limit']).'/day, up to '.$t2['max_wallets'].' wallets; '
                    .'Tier 3 — '.$naira($t3['daily_transfer_limit']).', up to '.$t3['max_wallets'].' wallets. '
                    .'Verify a higher tier (Profile → Identity verification) to raise your limits.',
            ],
            'pin_and_security' => [
                'title' => 'PIN & security',
                'answer' => 'Every spend is protected by your transaction PIN, which you enter only on the secure '
                    .'screen — it is never shared with me and I can never see, store, or ask for it. Too many wrong attempts '
                    .'temporarily locks it. You can also enable biometric (Face/Fingerprint) unlock. Never share your PIN, '
                    .'password, or any one-time code with anyone.',
            ],
            'pending_or_failed' => [
                'title' => 'Why a transfer is pending or failed',
                'answer' => 'A transfer can be pending because it is awaiting approval on a shared wallet, or because a bank '
                    .'payout is still being confirmed with the bank — in that case it will complete shortly or be reversed '
                    .'automatically, so you should not retry it. A transfer shows as failed if the bank rejected it; the '
                    .'money (and any fee) is automatically refunded to your wallet. If you tell me the transaction, I can '
                    .'look up its current status for you.',
            ],
            'funding_a_wallet' => [
                'title' => 'Funding a wallet',
                'answer' => 'Each wallet has its own dedicated account number. Open the wallet and tap Fund to see it, then '
                    .'transfer to that account from any Nigerian bank — the money arrives instantly. Funding is free.',
            ],
            'kyc_tiers' => [
                'title' => 'KYC tiers',
                'answer' => 'Verifying your identity (e.g. BVN, address, source of funds) raises your daily limits and unlocks '
                    .'more wallets. Manage it under Profile → Identity verification.',
            ],
            'family_roles' => [
                'title' => 'Family roles & permissions',
                'answer' => 'Members of a shared wallet can be Co-owner, Admin, Contributor or Viewer, and you can fine-tune '
                    .'View / Fund / Request / Withdraw per person under Wallet access. A Viewer, for example, can see the '
                    .'wallet but cannot move money out of it.',
            ],
            'freezing_a_wallet' => [
                'title' => 'Freezing a wallet',
                'answer' => 'Open the wallet\'s Settings → Freeze & scheduled access. While a wallet is frozen no money can '
                    .'leave it — even for you — but incoming funds still arrive.',
            ],
            'money_safety' => [
                'title' => 'Is my money safe?',
                'answer' => 'Balances are tracked to the kobo on an immutable ledger, your PIN protects every spend, and you '
                    .'can enable biometric unlock. I never have access to your PIN or passwords.',
            ],
            'getting_support' => [
                'title' => 'Getting help / support',
                'answer' => 'For a problem with a specific transaction, raise a dispute (Profile → Dispute Center) — I can '
                    .'help you flag the transaction. For anything I can\'t resolve here, please use the Dispute Center or '
                    .'contact support so the team can look into it. I won\'t guess at things I\'m not sure about.',
            ],
        ];
    }
}
