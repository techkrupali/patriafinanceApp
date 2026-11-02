<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\ProjectProposal;
use App\Models\User;
use App\Models\VendorProfile;
use App\Models\Wallet;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * VPJ-01…06 the builder starts the project: who it's for, the quote, phases by
 * percent, payment terms — sent to the family, who accept and fund it (or ask
 * for changes in chat, or decline). Accepting makes the project with the
 * builder already on it.
 */
class ProposalService
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly InvitationService $invitations,
    ) {
    }

    public static function make(): self
    {
        return new self(NotificationService::make(), InvitationService::make());
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    private function business(User $vendor): string
    {
        return VendorProfile::where('user_id', $vendor->id)->value('business_name') ?? $vendor->fullName();
    }

    /**
     * VPJ-01…04 a draft (or an edit of one): $data {family_user_id?|invite_phone?, title, kind, location?,
     * lines [{label, amount}], scope?, phases [{title, percent, proof?}], terms {upfront, retention_percent,
     * retention_months, start_within_days, show_on_profile}} — amounts in kobo.
     */
    public function save(User $vendor, array $data, ?ProjectProposal $proposal = null): ProjectProposal
    {
        if (!VendorProfile::where('user_id', $vendor->id)->exists()) {
            throw ValidationException::withMessages(['vendor' => 'Set up your business first.']);
        }
        if ($proposal && ($proposal->vendor_id !== $vendor->id || $proposal->status !== 'draft')) {
            throw ValidationException::withMessages(['proposal' => 'This proposal was already sent.']);
        }
        $family = !empty($data['family_user_id']) ? User::find((int) $data['family_user_id']) : null;
        if ($family && ($family->id === $vendor->id || $family->role === 'child')) {
            throw ValidationException::withMessages(['family_user_id' => 'Choose the family this project is for.']);
        }
        $lines = array_values(array_map(fn ($l) => ['label' => trim($l['label']), 'amount' => (int) $l['amount']], $data['lines']));
        $total = array_sum(array_column($lines, 'amount'));
        if ($total <= 0) {
            throw ValidationException::withMessages(['lines' => 'Add what the quote is made of.']);
        }
        $percents = array_sum(array_map(fn ($p) => (int) $p['percent'], $data['phases']));
        if ($percents !== 100) {
            throw ValidationException::withMessages(['phases' => "Percentages must add up to 100% — they add up to {$percents}%."]);
        }
        // Each phase's money from its share; the last takes any rounding.
        $left = $total;
        $phases = [];
        foreach (array_values($data['phases']) as $i => $p) {
            $amount = $i === count($data['phases']) - 1 ? $left : intdiv($total * (int) $p['percent'], 100);
            $left -= $amount;
            $phases[] = ['title' => trim($p['title']), 'percent' => (int) $p['percent'], 'amount' => $amount, 'proof' => trim((string) ($p['proof'] ?? '')) ?: null];
        }
        $terms = [
            'upfront' => (bool) ($data['terms']['upfront'] ?? true),
            'retention_percent' => (int) ($data['terms']['retention_percent'] ?? 5),
            'retention_months' => (int) ($data['terms']['retention_months'] ?? 3),
            'start_within_days' => (int) ($data['terms']['start_within_days'] ?? 7),
            'show_on_profile' => (bool) ($data['terms']['show_on_profile'] ?? true),
        ];
        $attrs = [
            'vendor_id' => $vendor->id,
            'family_user_id' => $family?->id,
            'invite_phone' => $family ? null : (trim((string) ($data['invite_phone'] ?? '')) ?: null),
            'title' => trim($data['title']),
            'kind' => in_array($data['kind'] ?? null, ProjectProposal::KINDS, true) ? $data['kind'] : 'building',
            'location' => trim((string) ($data['location'] ?? '')) ?: null,
            'lines' => $lines,
            'total' => $total,
            'scope' => trim((string) ($data['scope'] ?? '')) ?: null,
            'phases' => $phases,
            'terms' => $terms,
        ];
        if (!$attrs['family_user_id'] && !$attrs['invite_phone']) {
            throw ValidationException::withMessages(['family_user_id' => 'Choose who the project is for.']);
        }

        return $proposal ? tap($proposal)->update($attrs) : ProjectProposal::create($attrs + ['status' => 'draft']);
    }

    /** VPJ-02 "bill-of-quantities.pdf · Site drawings". */
    public function addDocument(ProjectProposal $proposal, User $vendor, UploadedFile $file, string $kind, string $url): ProjectProposal
    {
        if ($proposal->vendor_id !== $vendor->id || $proposal->status !== 'draft') {
            throw ValidationException::withMessages(['proposal' => 'This proposal was already sent.']);
        }
        $docs = $proposal->documents ?? [];
        $docs[] = ['name' => $file->getClientOriginalName() ?: 'document', 'url' => $url, 'kind' => in_array($kind, ['quote', 'drawing', 'other'], true) ? $kind : 'other'];
        $proposal->update(['documents' => array_slice($docs, -12)]);

        return $proposal->refresh();
    }

    /** VPJ-04 "Send proposal to Ngozi": a notification and a card in your chat — or an SMS link. */
    public function send(ProjectProposal $proposal, User $vendor): ProjectProposal
    {
        if ($proposal->vendor_id !== $vendor->id || $proposal->status !== 'draft') {
            throw ValidationException::withMessages(['proposal' => 'This proposal was already sent.']);
        }
        $proposal->update(['status' => 'sent', 'sent_at' => now()]);
        $business = $this->business($vendor);
        $upfront = $proposal->terms['upfront'] ? $proposal->phases[0]['amount'] : 0;
        if ($family = $proposal->family) {
            $this->notifications->push($family, 'project_proposal', "New proposal from {$business}", "{$proposal->title} · {$this->naira($proposal->total)} in " . count($proposal->phases) . ' phases. Accept, ask for changes, or decline.', ['proposal_id' => $proposal->id]);
            ChatService::make()->proposalCard($vendor, $family, ['proposal_id' => $proposal->id, 'title' => $proposal->title, 'total' => number_format($proposal->total / 100, 2, '.', ''), 'phases' => count($proposal->phases)], "Here's my proposal for {$proposal->title}." . ($upfront ? " {$this->naira($upfront)} starts the work." : ''));
        } elseif ($proposal->invite_phone) {
            SmsService::make()->send($proposal->invite_phone, "{$business} sent you a proposal on Patriai: {$proposal->title}, {$this->naira($proposal->total)}, paid by milestone. Get the app to see it: " . rtrim((string) config('app.url'), '/'));
        }

        return $proposal->refresh();
    }

    /** VPJ-05 "Decline" (with a note the builder sees). */
    public function decline(ProjectProposal $proposal, User $family, ?string $note): ProjectProposal
    {
        $this->assertFamily($proposal, $family);
        $proposal->update(['status' => 'declined', 'family_note' => $note ?: null, 'responded_at' => now()]);
        $this->notifications->push($proposal->vendor, 'project_proposal_declined', "{$family->first_name} declined {$proposal->title}", $note ?: 'They chose not to go ahead for now.', ['proposal_id' => $proposal->id]);

        return $proposal->refresh();
    }

    /**
     * VPJ-06 "Fund ₦960,000 and start": the project is made with the builder on it,
     * the phases as milestones and the builder's terms; who approves; the first
     * phase's money moved in from a wallet — and paid upfront if the terms say so;
     * a monthly saving towards the rest.
     *
     * $data: approvers me|both|per_phase, co_approver_id?, source_wallet_id, monthly?, monthly_wallet_id?, co_pledge?
     */
    public function accept(ProjectProposal $proposal, User $family, array $data): Project
    {
        $this->assertFamily($proposal, $family);
        $vendor = $proposal->vendor;
        $profile = VendorProfile::where('user_id', $vendor->id)->first();
        if (!$profile?->canBePaid()) {
            throw ValidationException::withMessages(['proposal' => "{$this->business($vendor)} isn't verified yet. Families can only pay verified businesses."]);
        }
        $first = $proposal->phases[0];
        $source = Wallet::where('id', (int) ($data['source_wallet_id'] ?? 0))->where('user_id', $family->id)->first();
        if (!$source || !$source->canSpend($family)) {
            throw ValidationException::withMessages(['source_wallet_id' => 'Choose one of your wallets to fund the first phase from.']);
        }
        if ($source->availableToSpend() < $first['amount']) {
            throw ValidationException::withMessages(['source_wallet_id' => "{$source->name} has {$this->naira($source->availableToSpend())}. The first phase needs {$this->naira($first['amount'])}."]);
        }
        $co = ($data['approvers'] ?? 'me') === 'both' ? User::find((int) ($data['co_approver_id'] ?? 0)) : null;
        if (($data['approvers'] ?? 'me') === 'both' && (!$co || $co->id === $family->id)) {
            throw ValidationException::withMessages(['co_approver_id' => 'Choose who approves with you.']);
        }

        $projects = ProjectService::make();
        $project = $projects->createProject($family, $proposal->title, $proposal->location, $proposal->total);
        $wallet = $project->wallet;
        $invitation = null;

        DB::transaction(function () use ($proposal, $family, $project, $wallet, $vendor, $source, $first, $co, $data, &$invitation) {
            $terms = $proposal->terms;
            $project->update([
                'vendor_id' => $vendor->id,
                'vendor_status' => 'accepted',
                'vendor_responded_at' => now(),
                'meta' => [
                    'kind' => $proposal->kind === 'extension' ? 'building' : ($proposal->kind === 'other' ? 'building' : $proposal->kind),
                    'location' => $proposal->location,
                    'buffer_percent' => 0,
                    'release' => ['photos' => true, 'video' => false, 'receipts' => false, 'approvers' => $co ? 'all' : 'owner', 'retention_percent' => $terms['retention_percent'], 'retention_months' => $terms['retention_months']],
                    'proposal_id' => $proposal->id,
                    // MLS-03: "Just me" / "Me and Emeka, both" (Emeka joins the approvers when he accepts).
                    'approvals' => ['mode' => 'all', 'approver_ids' => [$family->id], 'needed' => 1, 'overrides' => [], 'site_photo_over' => null],
                ],
            ]);
            $wallet->update(['target_amount' => $proposal->total]);
            foreach ($proposal->phases as $i => $p) {
                Milestone::create([
                    'project_id' => $project->id,
                    'sequence' => $i + 1,
                    'title' => $p['title'],
                    'amount' => $p['amount'],
                    'proof_needed' => $p['proof'],
                    'status' => 'planned',
                ]);
            }
            foreach ($proposal->documents ?? [] as $d) {
                \App\Models\ProjectDocument::create(['project_id' => $project->id, 'user_id' => $vendor->id, 'kind' => $d['kind'] === 'quote' ? 'boq' : 'other', 'name' => mb_substr($d['name'], 0, 120), 'url' => $d['url']]);
            }
            if ($co) {
                $identifier = $this->invitations->identifierFor($co);
                $invitation = [$this->invitations->create($wallet, $family, $co, $identifier, 'co_owner', true, null, !empty($data['co_pledge']) ? (int) $data['co_pledge'] : null), $co];
            }
            if (!empty($data['monthly']) && (int) $data['monthly'] > 0) {
                $from = Wallet::where('id', (int) ($data['monthly_wallet_id'] ?? $source->id))->where('user_id', $family->id)->first() ?? $source;
                AutomationService::make()->createRule($family, ['name' => "Monthly into {$project->title}", 'from_wallet_id' => $from->id, 'to_wallet_id' => $wallet->id, 'amount' => (int) $data['monthly'], 'frequency' => 'monthly', 'day_of_month' => 25]);
            }
            $proposal->update(['status' => 'accepted', 'project_id' => $project->id, 'responded_at' => now()]);
        });

        // The first phase's money (VPJ-06 "Covers Mobilisation now"); moving it in sets it aside.
        WalletService::make()->transferBetweenWallets($source, $wallet->refresh(), $first['amount'], $family, "Moved in from {$source->name}");
        if ($invitation) {
            $this->invitations->deliver($invitation[0], $wallet, $family, $invitation[1]);
        }

        $chat = ChatService::make();
        $chat->projectEvent($project, $family, 'system', "{$family->first_name} accepted the proposal from {$this->business($vendor)} and funded {$first['title']}");
        // "Paid upfront: Mobilisation, 20% — when the family accepts and funds it".
        $paid = 0;
        if ($proposal->terms['upfront']) {
            $m = $project->milestones()->orderBy('sequence')->first();
            if ($m->status === 'funded') {
                $m->update(['status' => 'approved', 'proof' => 'Paid upfront when the family accepted', 'submitted_at' => now(), 'submitted_by' => $vendor->id]);
                $paid = $projects->releaseMilestone($m->refresh(), $family)['paid'];
            }
        }
        $this->notifications->push(
            $vendor,
            'project_proposal_accepted',
            "{$family->first_name} accepted {$proposal->title}",
            $paid ? "{$this->naira($paid)} for {$first['title']} is on its way to you. Start within {$proposal->terms['start_within_days']} days." : "{$first['title']} is funded. Start within {$proposal->terms['start_within_days']} days.",
            ['project_id' => $project->id, 'proposal_id' => $proposal->id],
        );

        return $project->refresh();
    }

    private function assertFamily(ProjectProposal $proposal, User $family): void
    {
        if ($proposal->family_user_id !== $family->id) {
            throw ValidationException::withMessages(['proposal' => 'This proposal is not for you.']);
        }
        if ($proposal->status !== 'sent') {
            throw ValidationException::withMessages(['proposal' => $proposal->status === 'accepted' ? 'You already accepted this proposal.' : 'This proposal is no longer open.']);
        }
    }
}
