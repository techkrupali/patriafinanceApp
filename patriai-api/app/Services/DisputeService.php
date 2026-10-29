<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\Dispute;
use App\Models\DisputeFile;
use App\Models\DisputeMessage;
use App\Models\Milestone;
use App\Models\User;
use App\Models\VendorProfile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Disputes (DSP-01…09, VDM-08). About a project milestone, a dispute puts its
 * payment on hold; the builder has 3 days to offer a fix by a date, a partial
 * refund, or to disagree; the family accepts an offer or keeps talking; either
 * side can ask Patriai to step in (a decision within 5 working days, evidence
 * for 2 more days) and Patriai's decision is final. A fix that's done and paid
 * closes it. About a payment made or received, Patriai looks at it directly.
 * Amounts are kobo.
 */
class DisputeService
{
    public const LABELS = [
        'not_as_agreed' => 'Not as agreed',
        'not_finished' => 'Not finished',
        'poor_quality' => 'Poor quality',
        'overcharged' => 'Overcharged',
        'not_delivered' => 'Not delivered',
        'other' => 'Other',
        'fix' => 'Fix it',
        'partial_refund' => 'Partial refund',
        'full_refund' => 'Full refund',
    ];

    /** How long both sides can add evidence once Patriai is asked (DSP-08 "until 30 Oct"). */
    public const EVIDENCE_DAYS = 2;

    public function __construct(
        private readonly NotificationService $notifications,
    ) {}

    public static function make(): self
    {
        return new self(NotificationService::make());
    }

    // ----------------------------------------------------------------- opening

    /** DSP-02…04 "Open dispute". */
    public function open(User $user, array $data): Dispute
    {
        // No kind: the older Dispute Center form (and the assistant's "flag this transaction").
        $kind = $data['kind'] ?? null;
        if ($kind === 'milestone') {
            return $this->openOnMilestone($user, $data);
        }

        $dispute = Dispute::create([
            'user_id' => $user->id,
            'subject' => trim((string) ($data['subject'] ?? '')) ?: (($kind === 'payment_received' ? 'A payment I received' : 'A payment I made') . (isset($data['reason']) ? ' · ' . (self::LABELS[$data['reason']] ?? '') : '')),
            'category' => $data['category'] ?? 'transaction',
            'kind' => $kind,
            'reference' => $data['reference'] ?? null,
            'description' => $data['description'],
            'reason' => $data['reason'] ?? null,
            'remedy' => $data['remedy'] ?? null,
            'status' => 'open',
        ]);
        $this->numbered($dispute);
        $this->record($dispute, $user, 'system', "{$user->first_name} opened the dispute");
        $this->notifications->push($user, 'dispute_opened', "Dispute {$dispute->number} opened", 'Patriai looks into payment disputes. We will reply within 5 working days.', ['dispute_id' => $dispute->id]);

        return $dispute->refresh();
    }

    private function openOnMilestone(User $user, array $data): Dispute
    {
        $milestone = Milestone::with('project')->find((int) ($data['milestone_id'] ?? 0));
        $project = $milestone?->project;
        if (!$milestone || !$project || !$project->isFamilyApprover($user)) {
            throw ValidationException::withMessages(['milestone_id' => 'Choose a milestone on one of your projects.']);
        }
        if (!$project->vendor_id || !in_array($milestone->status, ['funded', 'planned', 'submitted', 'approved', 'rejected'], true)) {
            throw ValidationException::withMessages(['milestone_id' => 'This milestone can\'t be disputed now.']);
        }
        if ($milestone->activeDispute()) {
            throw ValidationException::withMessages(['milestone_id' => 'There is already an open dispute on this milestone.']);
        }

        $dispute = DB::transaction(function () use ($user, $data, $milestone, $project) {
            // "Opening a dispute puts the milestone payment on hold": any approval in progress stops.
            $requestId = $milestone->meta['approval_request_id'] ?? null;
            if ($milestone->status === 'approved' && $requestId) {
                ApprovalRequest::whereKey($requestId)->where('status', 'pending')->update(['status' => 'cancelled']);
                $milestone->update(['status' => 'submitted']);
            }
            $dispute = Dispute::create([
                'user_id' => $user->id,
                'subject' => trim((string) ($data['subject'] ?? '')) ?: (self::LABELS[$data['reason']] ?? 'Problem') . " · {$milestone->title}",
                'category' => 'project',
                'kind' => 'milestone',
                'project_id' => $project->id,
                'milestone_id' => $milestone->id,
                'against_user_id' => $project->vendor_id,
                'reference' => (string) $project->id,
                'description' => $data['description'],
                'reason' => $data['reason'],
                'remedy' => $data['remedy'],
                'amount_on_hold' => $milestone->amount,
                'status' => 'open',
                'reply_by' => Dispute::deadline(now(Dispute::TZ)->addDays(Dispute::REPLY_DAYS)),
            ]);
            $this->numbered($dispute);
            $this->record($dispute, $user, 'system', "{$user->first_name} opened the dispute");

            return $dispute;
        });

        $business = $this->business($project->vendor_id);
        $this->notifications->push($project->vendor, 'dispute_against_you', "{$dispute->subject}: reply by {Dispute::day($dispute->reply_by)}", "{$user->first_name} opened a dispute on {$milestone->title}. ₦" . number_format($dispute->amount_on_hold / 100) . " is on hold. If you don't answer, Patriai may decide using the family's evidence.", ['dispute_id' => $dispute->id, 'project_id' => $project->id]);
        $this->notifications->push($user, 'dispute_opened', "Dispute {$dispute->number} opened", "{$business} has until {Dispute::day($dispute->reply_by)} to reply. The payment is on hold.", ['dispute_id' => $dispute->id]);

        return $dispute->refresh();
    }

    /** DSP-04 photos, a video or a document, from either side. */
    public function addFile(Dispute $dispute, User $user, UploadedFile $file): DisputeFile
    {
        $this->assertParty($dispute, $user);
        if (!$dispute->isActive() || ($dispute->evidence_until && now()->gt($dispute->evidence_until))) {
            throw ValidationException::withMessages(['file' => 'Evidence can no longer be added to this dispute.']);
        }
        $mime = (string) $file->getMimeType();
        $kind = str_starts_with($mime, 'image') ? 'image' : (str_starts_with($mime, 'video') ? 'video' : 'document');
        $path = $file->store('dispute-files', 'public');

        return $dispute->files()->create([
            'user_id' => $user->id,
            'kind' => $kind,
            'url' => '/storage/' . $path,
            'name' => Str::limit($file->getClientOriginalName() ?: $kind, 120, ''),
        ]);
    }

    // ----------------------------------------------------------------- the builder's answer

    /** DSP-07 "Offer to fix it" (by a date) / "Offer a partial refund" / "I disagree". */
    public function respond(Dispute $dispute, User $actor, array $data): DisputeMessage
    {
        $this->assertVendorSide($dispute, $actor);
        if (!in_array($dispute->status, ['open', 'responded'], true)) {
            throw ValidationException::withMessages(['dispute' => 'This dispute is no longer waiting for your answer.']);
        }
        $type = $data['type'];
        $offer = ['type' => $type, 'status' => $type === 'disagree' ? 'closed' : 'open'];
        if ($type === 'fix') {
            if (empty($data['fix_by'])) {
                throw ValidationException::withMessages(['fix_by' => 'Pick the date the fix will be done by.']);
            }
            $offer['fix_by'] = $data['fix_by'];
        }
        if ($type === 'partial_refund') {
            $amount = (int) ($data['amount'] ?? 0);
            if ($amount <= 0 || $amount >= $dispute->amount_on_hold) {
                throw ValidationException::withMessages(['amount' => 'Suggest an amount less than ₦' . number_format($dispute->amount_on_hold / 100) . '.']);
            }
            $offer['amount'] = $amount;
        }
        if ($type === 'disagree' && trim((string) ($data['body'] ?? '')) === '') {
            throw ValidationException::withMessages(['body' => 'Explain why you disagree.']);
        }
        // A newer offer replaces the one still open.
        $dispute->messages()->where('kind', 'offer')->get()->each(function (DisputeMessage $m) {
            if (($m->offer['status'] ?? null) === 'open') {
                $m->update(['offer' => array_merge($m->offer, ['status' => 'replaced'])]);
            }
        });
        $message = $this->record($dispute, $actor, 'offer', $data['body'] ?? null, $offer);
        $dispute->update(['status' => 'responded']);
        $business = $this->business($dispute->against_user_id);
        $what = match ($type) {
            'fix' => 'offered to fix it by ' . \Illuminate\Support\Carbon::parse($offer['fix_by'])->format('D j M'),
            'partial_refund' => 'offered a ₦' . number_format($offer['amount'] / 100) . ' refund',
            default => 'disagrees',
        };
        $this->tellFamily($dispute, 'dispute_reply', "{$business} replied on {$dispute->subject}", ucfirst($what) . '. Open the dispute to answer.');

        return $message;
    }

    /** DSP-06 the conversation, recorded. */
    public function message(Dispute $dispute, User $user, string $body): DisputeMessage
    {
        $this->assertParty($dispute, $user);
        if (!$dispute->isActive()) {
            throw ValidationException::withMessages(['body' => 'This dispute is closed.']);
        }
        $message = $this->record($dispute, $user, 'message', $body);
        if ($this->isVendorSide($dispute, $user)) {
            $this->tellFamily($dispute, 'dispute_message', "{$user->first_name} wrote on {$dispute->subject}", Str::limit($body, 140));
        } elseif ($dispute->against) {
            $this->notifications->push($dispute->against, 'dispute_message', "{$user->first_name} wrote on {$dispute->subject}", Str::limit($body, 140), ['dispute_id' => $dispute->id]);
        }

        return $message;
    }

    /** Admin: a note from Patriai's case officer, seen by both sides. */
    public function adminMessage(Dispute $dispute, string $body): DisputeMessage
    {
        if (!$dispute->isActive()) {
            throw ValidationException::withMessages(['body' => 'This dispute is closed.']);
        }
        $message = $this->record($dispute, null, 'message', $body);
        $this->tellFamily($dispute, 'dispute_message', "Patriai wrote on {$dispute->subject}", Str::limit($body, 140));
        if ($dispute->against) {
            $this->notifications->push($dispute->against, 'dispute_message', "Patriai wrote on {$dispute->subject}", Str::limit($body, 140), ['dispute_id' => $dispute->id]);
        }

        return $message;
    }

    // ----------------------------------------------------------------- the family's answer

    /** DSP-06 "Accept offer" / "Not yet". */
    public function answerOffer(Dispute $dispute, User $user, DisputeMessage $offer, bool $accept): Dispute
    {
        if ($dispute->user_id !== $user->id && !$dispute->project?->isFamilyApprover($user)) {
            throw ValidationException::withMessages(['dispute' => 'Only the family can answer an offer.']);
        }
        if ($offer->dispute_id !== $dispute->id || $offer->kind !== 'offer' || ($offer->offer['status'] ?? null) !== 'open') {
            throw ValidationException::withMessages(['offer' => 'This offer is no longer open.']);
        }
        if (!in_array($dispute->status, ['open', 'responded'], true)) {
            throw ValidationException::withMessages(['dispute' => 'This dispute is not waiting for an answer.']);
        }
        $vendor = $dispute->against;
        if (!$accept) {
            $offer->update(['offer' => array_merge($offer->offer, ['status' => 'declined'])]);
            $this->record($dispute, $user, 'system', "{$user->first_name} said not yet to the offer");
            if ($vendor) {
                $this->notifications->push($vendor, 'dispute_offer_declined', "Not yet on {$dispute->subject}", 'The family didn\'t accept your offer. Keep talking, or ask Patriai to step in.', ['dispute_id' => $dispute->id]);
            }

            return $dispute->refresh();
        }

        $type = $offer->offer['type'];
        $milestone = $dispute->milestone;
        if ($type === 'fix') {
            DB::transaction(function () use ($dispute, $offer, $milestone, $user) {
                $offer->update(['offer' => array_merge($offer->offer, ['status' => 'accepted'])]);
                // The builder redoes the work and submits it again; its money stays reserved.
                if ($milestone && in_array($milestone->status, ['submitted', 'rejected'], true)) {
                    $milestone->update(['status' => 'funded']);
                }
                $dispute->update(['status' => 'fixing']);
                $this->record($dispute, $user, 'system', "{$user->first_name} accepted the offer to fix it by " . \Illuminate\Support\Carbon::parse($offer->offer['fix_by'])->format('D j M'));
            });
            if ($vendor) {
                $this->notifications->push($vendor, 'dispute_offer_accepted', "The family accepted your fix on {$dispute->subject}", 'Submit new photos when it\'s done. You\'re paid when the family approves them.', ['dispute_id' => $dispute->id, 'project_id' => $dispute->project_id]);
            }

            return $dispute->refresh();
        }
        if ($type === 'partial_refund') {
            if (!$milestone || !in_array($milestone->status, ['submitted', 'approved'], true)) {
                throw ValidationException::withMessages(['offer' => 'The builder needs to submit the work before a partial refund can be paid.']);
            }
            $this->assertPayable($dispute);
            $offer->update(['offer' => array_merge($offer->offer, ['status' => 'accepted'])]);
            $result = ProjectService::make()->releaseMilestone($milestone, $user, (int) $offer->offer['amount']);
            $this->close($dispute, 'partial_refund', (int) $result['paid'], (int) $offer->offer['amount'], $user, "{$user->first_name} accepted a partial refund");

            return $dispute->refresh();
        }

        throw ValidationException::withMessages(['offer' => 'This offer can\'t be accepted.']);
    }

    /** DSP-08 "Send to Patriai": a case officer decides within 5 working days. */
    public function escalate(Dispute $dispute, User $user, ?string $note): Dispute
    {
        $this->assertParty($dispute, $user);
        // A payment dispute is with Patriai from the start.
        if ($dispute->kind !== 'milestone' || !in_array($dispute->status, ['open', 'responded', 'fixing'], true)) {
            throw ValidationException::withMessages(['dispute' => 'This dispute can\'t be sent to Patriai now.']);
        }
        $dispute->update([
            'status' => 'escalated',
            'escalated_at' => now(),
            'escalation_note' => $note,
            'decision_due' => Dispute::deadline(now(Dispute::TZ)->addWeekdays(Dispute::DECISION_WORKING_DAYS)),
            'evidence_until' => Dispute::deadline(now(Dispute::TZ)->addDays(self::EVIDENCE_DAYS)),
        ]);
        $this->record($dispute, $user, 'system', "{$user->first_name} asked Patriai to step in");
        $body = 'A Patriai case officer will decide by ' . Dispute::day($dispute->decision_due) . '. Both sides can add evidence until ' . Dispute::day($dispute->evidence_until) . '.';
        $this->tellFamily($dispute, 'dispute_escalated', "Patriai is looking at {$dispute->subject}", $body);
        if ($dispute->against) {
            $this->notifications->push($dispute->against, 'dispute_escalated', "Patriai is looking at {$dispute->subject}", $body, ['dispute_id' => $dispute->id]);
        }

        return $dispute->refresh();
    }

    /** The builder didn't answer by the reply date: Patriai steps in, with the family's evidence. */
    public function escalateOverdue(): int
    {
        $sent = 0;
        Dispute::where('kind', 'milestone')->where('status', 'open')->whereNotNull('reply_by')->where('reply_by', '<', now())->get()
            ->each(function (Dispute $dispute) use (&$sent) {
                $dispute->update([
                    'status' => 'escalated',
                    'escalated_at' => now(),
                    'decision_due' => Dispute::deadline(now(Dispute::TZ)->addWeekdays(Dispute::DECISION_WORKING_DAYS)),
                    'evidence_until' => Dispute::deadline(now(Dispute::TZ)->addDays(self::EVIDENCE_DAYS)),
                ]);
                $business = $this->business($dispute->against_user_id);
                $this->record($dispute, null, 'system', "{$business} didn't reply in time, so Patriai is stepping in");
                $body = 'A Patriai case officer will decide by ' . Dispute::day($dispute->decision_due) . '. Both sides can add evidence until ' . Dispute::day($dispute->evidence_until) . '.';
                $this->tellFamily($dispute, 'dispute_escalated', "Patriai is looking at {$dispute->subject}", $body);
                if ($dispute->against) {
                    $this->notifications->push($dispute->against, 'dispute_escalated', "Patriai is looking at {$dispute->subject}", "You didn't reply by the deadline. {$body}", ['dispute_id' => $dispute->id]);
                }
                $sent++;
            });

        return $sent;
    }

    // ----------------------------------------------------------------- outcomes

    /**
     * Admin: Patriai's decision, final for this dispute. On a milestone: release
     * the payment in full, release it less a refund, or refund it in full (the
     * money stays in the project wallet). On a payment: resolved or rejected.
     */
    public function decide(Dispute $dispute, User $admin, string $outcome, ?int $refund, string $note): Dispute
    {
        if (!$dispute->isActive()) {
            throw ValidationException::withMessages(['dispute' => 'This dispute is already closed.']);
        }
        if ($dispute->kind !== 'milestone') {
            $dispute->update(['status' => $outcome === 'rejected' ? 'rejected' : 'resolved', 'outcome' => $outcome === 'rejected' ? null : 'resolved', 'resolution' => $note, 'resolved_at' => now(), 'decided_by' => $admin->id]);
            $this->record($dispute, null, 'decision', $note);
            $this->notifications->push($dispute->user, 'dispute_resolved', "Dispute {$dispute->number}: " . ($outcome === 'rejected' ? 'not upheld' : 'resolved'), $note, ['dispute_id' => $dispute->id]);

            return $dispute->refresh();
        }

        $milestone = $dispute->milestone;
        if (!$milestone) {
            throw ValidationException::withMessages(['dispute' => 'The milestone no longer exists.']);
        }
        $this->record($dispute, null, 'decision', $note);
        $dispute->update(['resolution' => $note, 'decided_by' => $admin->id]);
        if ($outcome === 'full_refund') {
            $milestone->update(['status' => 'cancelled']);
            $this->close($dispute, 'full_refund', 0, $milestone->amount, $admin, null);

            return $dispute->refresh();
        }
        $refund = $outcome === 'partial_refund' ? (int) $refund : 0;
        if ($outcome === 'partial_refund' && ($refund <= 0 || $refund >= $milestone->amount)) {
            throw ValidationException::withMessages(['refund' => 'Enter a refund less than the milestone.']);
        }
        $this->assertPayable($dispute);
        if (in_array($milestone->status, ['funded', 'planned', 'rejected'], true)) {
            $milestone->update(['status' => 'submitted']);
        }
        $result = ProjectService::make()->releaseMilestone($milestone->refresh(), $admin, $refund);
        $this->close($dispute, $outcome === 'partial_refund' ? 'partial_refund' : 'released', (int) $result['paid'], $refund ?: null, $admin, null);

        return $dispute->refresh();
    }

    /** DSP-09: the fix the family accepted was done, approved and paid. */
    public function resolveFixed(Dispute $dispute, int $paid, int $retention): void
    {
        $dispute->update(['status' => 'resolved', 'outcome' => 'fixed', 'released_amount' => $paid, 'resolved_at' => now()]);
        $this->record($dispute, null, 'system', 'Fixed at no extra cost, and paid');
        $business = $this->business($dispute->against_user_id);
        $this->tellFamily($dispute, 'dispute_resolved', 'Dispute resolved', "{$business} fixed it and was paid ₦" . number_format($paid / 100) . ($retention ? ', with ₦' . number_format($retention / 100) . ' held back as usual.' : '.'));
        if ($dispute->against) {
            $this->notifications->push($dispute->against, 'dispute_resolved', "{$dispute->subject}: resolved", 'The family approved the fix. ₦' . number_format($paid / 100) . ' is in your wallet.', ['dispute_id' => $dispute->id]);
        }
    }

    private function close(Dispute $dispute, string $outcome, int $released, ?int $refund, User $by, ?string $line): void
    {
        $dispute->update(['status' => 'resolved', 'outcome' => $outcome, 'released_amount' => $released, 'refund_amount' => $refund, 'resolved_at' => now()]);
        if ($line) {
            $this->record($dispute, $by, 'system', $line);
        }
        $text = match ($outcome) {
            'partial_refund' => '₦' . number_format($released / 100) . ' was released to the builder and ₦' . number_format(($refund ?? 0) / 100) . ' stays in your project wallet.',
            'full_refund' => 'Nothing was paid. ₦' . number_format(($refund ?? 0) / 100) . ' stays in your project wallet.',
            default => '₦' . number_format($released / 100) . ' was released to the builder.',
        };
        $this->tellFamily($dispute, 'dispute_resolved', "Dispute {$dispute->number} resolved", $text);
        if ($dispute->against) {
            $this->notifications->push($dispute->against, 'dispute_resolved', "{$dispute->subject}: resolved", $outcome === 'full_refund' ? 'The milestone was refunded to the family.' : '₦' . number_format($released / 100) . ' is in your wallet.', ['dispute_id' => $dispute->id]);
        }
    }

    // ----------------------------------------------------------------- reads

    /** Everything a dispute screen shows (DSP-05/06/07/09), shaped for the viewer. */
    public function present(Dispute $dispute, ?User $viewer, bool $admin = false): array
    {
        $dispute->loadMissing(['user', 'against', 'project.owner', 'milestone', 'messages.user', 'files']);
        $naira = fn (?int $k) => $k === null ? null : number_format($k / 100, 2, '.', '');
        $isVendor = $viewer && $this->isVendorSide($dispute, $viewer);
        $isFamily = $viewer && !$isVendor && ($dispute->user_id === $viewer->id || (bool) $dispute->project?->isFamilyApprover($viewer));
        $openOffer = $dispute->messages->first(fn (DisputeMessage $m) => $m->kind === 'offer' && ($m->offer['status'] ?? null) === 'open');
        $vendorReplied = $dispute->messages->contains(fn (DisputeMessage $m) => $m->kind === 'offer' || ($m->kind === 'message' && $m->user_id === $dispute->against_user_id));

        return [
            'id' => $dispute->id,
            'number' => $dispute->number,
            'subject' => $dispute->subject,
            'kind' => $dispute->kind ?? 'other',
            'category' => $dispute->category,
            'status' => $dispute->status,
            'reason' => $dispute->reason,
            'reason_label' => self::LABELS[$dispute->reason] ?? null,
            'remedy' => $dispute->remedy,
            'remedy_label' => self::LABELS[$dispute->remedy] ?? null,
            'description' => $dispute->description,
            'reference' => $dispute->reference,
            'amount_on_hold' => $naira($dispute->amount_on_hold),
            'raised_by' => $dispute->user ? ['id' => $dispute->user->id, 'name' => $dispute->user->fullName(), 'first_name' => $dispute->user->first_name] : null,
            'against' => $dispute->against ? ['id' => $dispute->against->id, 'name' => $this->business($dispute->against->id), 'profile_id' => VendorProfile::where('user_id', $dispute->against->id)->value('id')] : null,
            'project' => $dispute->project ? ['id' => $dispute->project->id, 'title' => $dispute->project->title] : null,
            'milestone' => $dispute->milestone ? ['id' => $dispute->milestone->id, 'title' => $dispute->milestone->title, 'amount' => $naira($dispute->milestone->amount), 'status' => $dispute->milestone->status] : null,
            'reply_by' => $dispute->reply_by?->timezone(Dispute::TZ)->toIso8601String(),
            'vendor_replied' => $vendorReplied,
            'escalated_at' => $dispute->escalated_at?->toIso8601String(),
            'escalation_note' => $dispute->escalation_note,
            'decision_due' => $dispute->decision_due?->timezone(Dispute::TZ)->toIso8601String(),
            'evidence_until' => $dispute->evidence_until?->timezone(Dispute::TZ)->toIso8601String(),
            'outcome' => $dispute->outcome,
            'resolution' => $dispute->resolution,
            'released_amount' => $naira($dispute->released_amount),
            'refund_amount' => $naira($dispute->refund_amount),
            'resolved_at' => $dispute->resolved_at?->toIso8601String(),
            'created_at' => $dispute->created_at?->toIso8601String(),
            'messages' => $dispute->messages->map(fn (DisputeMessage $m) => [
                'id' => $m->id,
                'kind' => $m->kind,
                'body' => $m->body,
                'offer' => $m->offer ? array_merge($m->offer, isset($m->offer['amount']) ? ['amount' => $naira((int) $m->offer['amount'])] : []) : null,
                'from' => $m->user_id === null ? 'patriai' : ($m->user_id === $dispute->against_user_id || ($m->user && $dispute->project?->teamMemberFor($m->user)) ? 'vendor' : 'family'),
                'name' => $m->user_id === null ? 'Patriai' : ($m->user?->first_name ?? 'Someone'),
                'mine' => $viewer && $m->user_id === $viewer->id,
                'created_at' => $m->created_at?->toIso8601String(),
            ])->values(),
            'files' => $dispute->files->map(fn (DisputeFile $f) => ['id' => $f->id, 'kind' => $f->kind, 'url' => url($f->url), 'name' => $f->name, 'from' => $f->user_id === $dispute->user_id ? 'family' : 'vendor'])->values(),
            'open_offer_id' => $openOffer?->id,
            'can' => [
                'reply' => $isVendor && in_array($dispute->status, ['open', 'responded'], true),
                'message' => ($isVendor || $isFamily || $admin) && $dispute->isActive(),
                'answer_offer' => $isFamily && $openOffer !== null && in_array($dispute->status, ['open', 'responded'], true),
                'escalate' => ($isVendor || $isFamily) && $dispute->kind === 'milestone' && in_array($dispute->status, ['open', 'responded', 'fixing'], true),
                'add_evidence' => ($isVendor || $isFamily) && $dispute->isActive() && (!$dispute->evidence_until || now()->lte($dispute->evidence_until)),
                'rate' => $isFamily && $dispute->status === 'resolved' && $dispute->against_user_id !== null,
            ],
            'viewer' => $isVendor ? 'vendor' : ($isFamily ? 'family' : ($admin ? 'admin' : null)),
        ];
    }

    /** A DSP-01 / VDM-08 list row: "Kitchen tiles uneven · Waiting for builder · Adeyemi Builders · ₦1,900,000 on hold". */
    public function summary(Dispute $dispute, User $viewer): array
    {
        $vendor = $this->isVendorSide($dispute, $viewer);
        $naira = fn (?int $k) => $k === null ? null : number_format($k / 100, 2, '.', '');

        return [
            'id' => $dispute->id,
            'number' => $dispute->number,
            'subject' => $dispute->subject,
            'kind' => $dispute->kind ?? 'other',
            'category' => $dispute->category,
            'status' => $dispute->status,
            'status_label' => $this->statusLabel($dispute, $vendor),
            'active' => $dispute->isActive(),
            'against' => $dispute->against_user_id ? $this->business($dispute->against_user_id) : null,
            'raised_by' => $dispute->user?->first_name,
            'project' => $dispute->project ? ['id' => $dispute->project->id, 'title' => $dispute->project->title] : null,
            'milestone' => $dispute->milestone ? ['id' => $dispute->milestone->id, 'title' => $dispute->milestone->title] : null,
            'amount_on_hold' => $naira($dispute->amount_on_hold),
            'reply_by' => $dispute->reply_by?->timezone(Dispute::TZ)->toIso8601String(),
            'decision_due' => $dispute->decision_due?->timezone(Dispute::TZ)->toIso8601String(),
            'outcome' => $dispute->outcome,
            'released_amount' => $naira($dispute->released_amount),
            'refund_amount' => $naira($dispute->refund_amount),
            'resolved_at' => $dispute->resolved_at?->toIso8601String(),
            'created_at' => $dispute->created_at?->toIso8601String(),
            'viewer' => $vendor ? 'vendor' : 'family',
        ];
    }

    /** DSP-01 "Waiting for builder" / "Refunded in full"; VDM-08 "Reply by 27 Oct" / "Resolved · fixed at no cost". */
    public function statusLabel(Dispute $dispute, bool $vendorSide): string
    {
        $naira = fn (?int $k) => '₦' . number_format(($k ?? 0) / 100);

        return match ($dispute->status) {
            'open' => $dispute->kind === 'milestone'
                ? ($vendorSide ? 'Reply by ' . ($dispute->reply_by ? Dispute::day($dispute->reply_by) : 'soon') : 'Waiting for builder')
                : 'Patriai is looking into it',
            'responded' => $vendorSide ? 'Waiting for the family' : 'They replied',
            'fixing' => 'Being fixed',
            'escalated' => 'With Patriai · decision by ' . ($dispute->decision_due ? Dispute::day($dispute->decision_due) : 'soon'),
            'under_review' => 'Under review',
            'rejected' => 'Closed · not upheld',
            'resolved' => match ($dispute->outcome) {
                'fixed' => 'Resolved · fixed at no cost',
                'partial_refund' => 'Refunded ' . $naira($dispute->refund_amount),
                'full_refund' => 'Refunded in full',
                'released' => 'Resolved · paid in full',
                default => 'Resolved',
            },
            default => ucfirst(str_replace('_', ' ', (string) $dispute->status)),
        };
    }

    /** Disputes this person can see: theirs, their projects', and those against their business. */
    public function visibleTo(User $user)
    {
        $familyProjects = \App\Models\Project::where('owner_id', $user->id)
            ->orWhereHas('wallet.members', fn ($m) => $m->where('user_id', $user->id)->where('status', 'active')->where('role', 'co_owner'))
            ->pluck('id');
        $teamProjects = \App\Models\VendorTeamMember::with('vendorProfile')->where('user_id', $user->id)->where('status', 'active')->where('role', 'site_manager')->get()
            ->flatMap(fn ($m) => \App\Models\Project::whereIn('id', array_map('intval', $m->project_ids ?? []))->where('vendor_id', $m->vendorProfile?->user_id)->pluck('id'));

        return Dispute::query()->where(fn ($q) => $q->where('user_id', $user->id)
            ->orWhere('against_user_id', $user->id)
            ->orWhereIn('project_id', $familyProjects->merge($teamProjects)->unique()->values()));
    }

    // ----------------------------------------------------------------- helpers

    private function numbered(Dispute $dispute): void
    {
        $dispute->update(['number' => 'PT-' . (20000 + $dispute->id)]);
    }

    private function record(Dispute $dispute, ?User $user, string $kind, ?string $body, ?array $offer = null): DisputeMessage
    {
        return $dispute->messages()->create(['user_id' => $user?->id, 'kind' => $kind, 'body' => $body, 'offer' => $offer]);
    }

    public function isVendorSide(Dispute $dispute, User $user): bool
    {
        if (!$dispute->against_user_id) {
            return false;
        }
        if ($dispute->against_user_id === $user->id) {
            return true;
        }

        return $dispute->project && $dispute->project->vendor_id === $dispute->against_user_id && $dispute->project->actsForVendor($user, 'submit');
    }

    private function assertVendorSide(Dispute $dispute, User $user): void
    {
        if (!$this->isVendorSide($dispute, $user)) {
            throw ValidationException::withMessages(['dispute' => 'Only the business this dispute is about can answer it.']);
        }
    }

    public function canView(Dispute $dispute, User $user): bool
    {
        return $dispute->user_id === $user->id || $this->isVendorSide($dispute, $user) || (bool) $dispute->project?->isFamilyApprover($user);
    }

    private function assertParty(Dispute $dispute, User $user): void
    {
        if (!$this->canView($dispute, $user)) {
            throw ValidationException::withMessages(['dispute' => 'Dispute not found.']);
        }
    }

    private function assertPayable(Dispute $dispute): void
    {
        $profile = VendorProfile::where('user_id', $dispute->against_user_id)->first();
        if (!$profile?->canBePaid()) {
            throw ValidationException::withMessages(['dispute' => 'The builder isn\'t verified yet, so nothing can be paid to them.']);
        }
    }

    private function business(?int $userId): string
    {
        if (!$userId) {
            return 'The builder';
        }

        return VendorProfile::where('user_id', $userId)->value('business_name') ?? (User::find($userId)?->fullName() ?? 'The builder');
    }

    private function tellFamily(Dispute $dispute, string $type, string $title, string $body): void
    {
        if ($dispute->project) {
            VendorProjectService::make()->tellFamily($dispute->project, $type, $title, $body, ['dispute_id' => $dispute->id]);

            return;
        }
        $this->notifications->push($dispute->user, $type, $title, $body, ['dispute_id' => $dispute->id]);
    }
}
