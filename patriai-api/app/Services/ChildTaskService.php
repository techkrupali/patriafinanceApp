<?php

namespace App\Services;

use App\Models\ChildTask;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * CHD-12 "New task for Tolu — Reward ₦… paid from Main into Tolu's wallet when
 * you approve"; CHD-07 the child's tasks, "4 weeks in a row of tasks done".
 * Amounts are kobo.
 */
class ChildTaskService
{
    public function __construct(private readonly NotificationService $notifications, private readonly WalletService $wallets, private readonly ChildAppService $children) {}

    public static function make(): self
    {
        return app(self::class);
    }

    public function create(Wallet $wallet, User $parent, array $d): ChildTask
    {
        if (!in_array($wallet->roleOf($parent), ['owner', 'co_owner'], true)) {
            throw ValidationException::withMessages(['wallet' => 'Only a parent can set tasks.']);
        }
        $task = ChildTask::create([
            'wallet_id' => $wallet->id,
            'created_by' => $parent->id,
            'title' => $d['title'],
            'reward' => $d['reward'],
            'due_on' => $d['due_on'] ?? null,
            'repeat_weekly' => (bool) ($d['repeat_weekly'] ?? false),
            'needs_photo' => (bool) ($d['needs_photo'] ?? false),
            'coparent_can_approve' => (bool) ($d['coparent_can_approve'] ?? true),
        ]);
        foreach ($wallet->members()->with('user')->where('role', 'child')->where('status', 'active')->get() as $m) {
            $this->notifications->push($m->user, 'child_task', "New task: {$task->title}", '+₦' . number_format($task->reward / 100) . ($task->due_on ? ' · by ' . $task->due_on->format('l') : ''), ['wallet_id' => $wallet->id, 'task_id' => $task->id]);
        }

        return $task;
    }

    /** CHD-07 "Check — photo sent, Dad will check". */
    public function done(ChildTask $task, User $child, ?UploadedFile $photo): ChildTask
    {
        if ($task->wallet->roleOf($child) !== 'child' || $task->status !== 'todo') {
            throw ValidationException::withMessages(['task' => 'This task isn\'t open.']);
        }
        if ($task->needs_photo && !$photo) {
            throw ValidationException::withMessages(['photo' => 'Add a photo of it done.']);
        }
        $task->update(['status' => 'submitted', 'submitted_at' => now(), 'note' => null, 'photo_path' => $photo ? $photo->store("child-tasks/{$task->wallet_id}", 'local') : null]);
        foreach ($this->approvers($task) as $parent) {
            $this->notifications->push($parent, 'child_task_done', "{$child->first_name} did: {$task->title}", 'Check it and pay ₦' . number_format($task->reward / 100) . '.', ['wallet_id' => $task->wallet_id, 'task_id' => $task->id]);
        }

        return $task;
    }

    /** The reward moves from the parent's wallet into the child's; a weekly task comes back for next week. */
    public function approve(ChildTask $task, User $parent, int $fromWalletId): ChildTask
    {
        if (!$this->approvers($task)->contains('id', $parent->id)) {
            throw ValidationException::withMessages(['task' => 'Only a parent can check this.']);
        }
        if ($task->status !== 'submitted') {
            throw ValidationException::withMessages(['task' => $task->status === 'paid' ? 'This was paid already.' : 'Wait until it\'s done.']);
        }
        $from = Wallet::where('id', $fromWalletId)->where('user_id', $parent->id)->where('status', 'active')->first() ?? $parent->mainWallet();
        if (!$from || $from->availableToSpend() < $task->reward) {
            throw ValidationException::withMessages(['from_wallet_id' => 'Not enough in that wallet for the reward.']);
        }

        return DB::transaction(function () use ($task, $parent, $from) {
            $locked = ChildTask::whereKey($task->id)->lockForUpdate()->first();
            if ($locked->status !== 'submitted') {
                throw ValidationException::withMessages(['task' => 'This was paid already.']);
            }
            $result = $this->wallets->transferBetweenWallets($from, $locked->wallet, $locked->reward, $parent, "Task: {$locked->title}");
            $locked->update(['status' => 'paid', 'paid_by' => $parent->id, 'paid_at' => now(), 'paid_reference' => $result['reference']]);
            if ($locked->repeat_weekly) {
                ChildTask::create($locked->only(['wallet_id', 'created_by', 'title', 'reward', 'repeat_weekly', 'needs_photo', 'coparent_can_approve']) + [
                    'due_on' => ($locked->due_on ?? now())->copy()->addWeek()->toDateString(),
                ]);
            }
            foreach ($locked->wallet->members()->with('user')->where('role', 'child')->where('status', 'active')->get() as $m) {
                $this->notifications->push($m->user, 'child_task_paid', "+₦" . number_format($locked->reward / 100) . " for {$locked->title}", "{$parent->first_name} checked it. Well done!", ['wallet_id' => $locked->wallet_id, 'task_id' => $locked->id]);
            }

            return $locked;
        });
    }

    /** Not done properly: back to do, with a note. */
    public function sendBack(ChildTask $task, User $parent, ?string $note): ChildTask
    {
        if (!$this->approvers($task)->contains('id', $parent->id) || $task->status !== 'submitted') {
            throw ValidationException::withMessages(['task' => 'There\'s nothing to check.']);
        }
        $task->update(['status' => 'todo', 'note' => $note, 'submitted_at' => null]);
        foreach ($task->wallet->members()->with('user')->where('role', 'child')->where('status', 'active')->get() as $m) {
            $this->notifications->push($m->user, 'child_task_back', "Not quite: {$task->title}", $note ?: 'Have another go.', ['wallet_id' => $task->wallet_id, 'task_id' => $task->id]);
        }

        return $task;
    }

    public function cancel(ChildTask $task, User $parent): void
    {
        if (!in_array($task->wallet->roleOf($parent), ['owner', 'co_owner'], true) || $task->status === 'paid') {
            throw ValidationException::withMessages(['task' => 'This can\'t be removed.']);
        }
        $task->update(['status' => 'cancelled']);
    }

    /** CHD-07 the list and "4 weeks in a row of tasks done". */
    public function list(Wallet $wallet): array
    {
        $tasks = ChildTask::where('wallet_id', $wallet->id)->where('status', '!=', 'cancelled')
            ->orderByRaw("case status when 'submitted' then 0 when 'todo' then 1 else 2 end")->orderBy('due_on')->latest('id')->limit(60)->get();
        $weeks = ChildTask::where('wallet_id', $wallet->id)->where('status', 'paid')->pluck('paid_at')
            ->map(fn (Carbon $at) => $at->copy()->setTimezone(ChildService::TIMEZONE)->startOfWeek()->toDateString())->unique()->flip();
        $streak = 0;
        $week = now()->setTimezone(ChildService::TIMEZONE)->startOfWeek();
        // This week counts once something's paid; a gap before it ends the streak.
        if (!$weeks->has($week->toDateString())) {
            $week->subWeek();
        }
        while ($weeks->has($week->toDateString())) {
            $streak++;
            $week->subWeek();
        }

        return [
            'streak' => $streak,
            'tasks' => $tasks->filter(fn ($t) => $t->status !== 'paid' || $t->paid_at?->gt(now()->subDays(14)))->map(fn (ChildTask $t) => [
                'id' => $t->id,
                'title' => $t->title,
                'reward' => number_format($t->reward / 100, 2, '.', ''),
                'due_on' => $t->due_on?->toDateString(),
                'repeat_weekly' => $t->repeat_weekly,
                'needs_photo' => $t->needs_photo,
                'status' => $t->status,
                'note' => $t->note,
                'has_photo' => $t->photo_path !== null,
                'paid_at' => $t->paid_at?->toIso8601String(),
                'by' => $t->creator?->first_name,
            ])->values(),
        ];
    }

    /** Who checks it: the parent who set it, the owner, and co-parents when allowed. */
    private function approvers(ChildTask $task): \Illuminate\Support\Collection
    {
        $wallet = $task->wallet;
        $parents = $this->children->parents($wallet);

        return $task->coparent_can_approve ? $parents : $parents->filter(fn (User $u) => $u->id === $wallet->user_id || $u->id === $task->created_by)->values();
    }
}
