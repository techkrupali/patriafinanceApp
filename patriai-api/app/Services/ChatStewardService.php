<?php

namespace App\Services;

use App\Models\Milestone;
use App\Models\Project;
use App\Models\User;
use App\Models\VendorProfile;

/**
 * CHT-03 "Steward · Tiling is ₦1,900,000. Ngozi approved this morning; it needs
 * one more approver…": an answer in a project chat from that project's own
 * records only (AIC-02 "Uses only this project's records").
 */
class ChatStewardService
{
    public static function make(): self
    {
        return new self();
    }

    private function naira(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    private function names(array $names): string
    {
        return count($names) <= 1 ? (string) ($names[0] ?? '') : implode(', ', array_slice($names, 0, -1)) . ' and ' . end($names);
    }

    public function answer(Project $project, string $question): string
    {
        $q = mb_strtolower($question);
        $project->loadMissing('milestones', 'wallet');
        $milestones = $project->milestones->whereNotIn('status', ['cancelled', 'proposed'])->sortBy('sequence');
        $vendor = $project->vendor_id ? (VendorProfile::where('user_id', $project->vendor_id)->value('business_name') ?? $project->vendor?->fullName()) : 'the builder';
        $lines = [];

        // Money questions: the wallet, what's paid, what's held back.
        if (preg_match('/wallet|balance|how much|money|left|paid|held|retention/', $q)) {
            $paid = (int) $milestones->where('status', 'released')->sum(fn (Milestone $m) => $m->amount - (int) ($m->meta['refunded'] ?? 0) - $m->retention);
            $lines[] = "The project wallet has {$this->naira((int) $project->wallet?->balance)}. {$this->naira($paid)} has been paid to {$vendor} across {$milestones->where('status', 'released')->count()} " . ($milestones->where('status', 'released')->count() === 1 ? 'milestone' : 'milestones') . ($project->heldBack() ? ", and {$this->naira($project->heldBack())} is held back until after handover." : '.');
        }

        // What's waiting for a yes, and who has said it.
        $waiting = $milestones->first(fn (Milestone $m) => in_array($m->status, ['submitted', 'approved'], true));
        if ($waiting) {
            $rules = ProjectApprovalService::make()->rulesFor($project, $waiting);
            $request = !empty($waiting->meta['approval_request_id']) ? \App\Models\ApprovalRequest::with('responses')->find($waiting->meta['approval_request_id']) : null;
            $yesIds = $request ? collect([$request->initiator_id])->merge($request->responses->where('decision', 'approve')->pluck('approver_id'))->all() : [];
            $yes = User::whereIn('id', $yesIds)->pluck('first_name')->all();
            $left = max(0, $rules['needed'] - count($yes));
            $retention = intdiv($waiting->amount * (int) ($project->meta['release']['retention_percent'] ?? 0), 100);
            $lines[] = "{$waiting->title} is {$this->naira($waiting->amount)}. "
                . ($yes ? "{$this->names($yes)} approved; " : 'Nobody has approved it yet; ')
                . ($left ? "it needs {$left} more " . ($left === 1 ? 'approver' : 'approvers') . '. ' : 'it has enough yeses. ')
                . "{$this->naira($waiting->amount - $retention - $waiting->advance_paid)} goes to {$vendor} when " . ($left ? 'they approve.' : 'it is paid.');
        } else {
            $next = $milestones->first(fn (Milestone $m) => in_array($m->status, ['planned', 'funded', 'rejected'], true));
            $lines[] = $next
                ? "Nothing is waiting for approval. Next is {$next->title}, {$this->naira($next->amount)}" . ($next->status === 'funded' ? ' — funded and locked until it is approved.' : ' — not funded yet.')
                : 'Every milestone on this project is paid.';
        }

        return implode(' ', $lines);
    }
}
