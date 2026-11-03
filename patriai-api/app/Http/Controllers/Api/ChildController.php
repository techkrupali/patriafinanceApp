<?php

namespace App\Http\Controllers\Api;

use App\Models\ChildTask;
use App\Models\Wallet;
use App\Services\ChildAppService;
use App\Services\ChildService;
use App\Services\ChildTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * Child wallets: codes to link the child's own phone (CHW-06), the child's app
 * (CHD-03…07), what parents, co-parents and relatives see (CHD-09, WPV-04/05),
 * and tasks with rewards (CHD-07/12).
 */
class ChildController extends ApiController
{
    // POST /children/link-code  {first_name} — shown during setup, held for 10 minutes.
    public function reserve(Request $request): JsonResponse
    {
        $data = $request->validate(['first_name' => ['required', 'string', 'max:60']]);

        return $this->ok('Code ready', ChildService::make()->reserveCode($request->user(), $data['first_name']));
    }

    // POST /wallets/{wallet}/child/link-code — a new code to link later (WCR-07 "Edit").
    public function renew(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->parentOf($request, $wallet)) {
            return $this->fail('Child wallet not found', 404);
        }

        return $this->ok('New code ready', ChildService::make()->newCode($wallet, $request->user()));
    }

    // POST /children/link  {code, pin, device_name?} — the child's phone, "I have a code".
    public function link(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:12'],
            'pin' => ['required', 'digits:4'],
            'device_name' => ['nullable', 'string', 'max:80'],
            // INV-CH3: the pairing a parent said yes to.
            'request_id' => ['required', 'integer'],
            'secret' => ['required', 'string', 'max:64'],
        ]);
        if (preg_match('/^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)$/', $data['pin'])) {
            return response()->json(['status' => false, 'message' => 'Pick a harder PIN.', 'errors' => ['pin' => ['Pick a harder PIN, not 1111 or 1234.']]], 422);
        }
        [$child, $wallet, $token] = ChildAppService::make()->link($data['code'], $data['pin'], $data['device_name'] ?? 'Child phone', (int) $data['request_id'], $data['secret']);

        return $this->ok('Linked', ['token' => $token, 'user' => $this->serializeUser($child), 'wallet_id' => $wallet->id, 'welcome' => ChildAppService::make()->welcome($wallet->refresh(), $child)], 201);
    }

    // POST /children/link/start — INV-CH2 "Link my phone": the parents are asked first.
    public function startLink(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:12'], 'device_name' => ['nullable', 'string', 'max:80']]);

        return $this->ok('Asked your parent', ChildAppService::make()->startLink($data['code'], $data['device_name'] ?? 'Child phone'), 201);
    }

    // GET /children/link/{id}?secret= — the child's phone waits for the parent's yes.
    public function linkStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['secret' => ['required', 'string', 'max:64']]);

        return $this->ok('Status', ['status' => ChildAppService::make()->linkStatus($id, $data['secret'])]);
    }

    // GET /child-link-requests/{id} — INV-CH3 "Link this phone to Kamsi?"
    public function linkRequest(Request $request, int $id): JsonResponse
    {
        return $this->ok('Request', ['request' => ChildAppService::make()->linkRequest($id, $request->user())]);
    }

    // POST /child-link-requests/{id}/{decision} — "Yes, link Kamsi's phone" / "This isn't Kamsi".
    public function decideLink(Request $request, int $id, string $decision): JsonResponse
    {
        $status = ChildAppService::make()->decideLink($id, $request->user(), $decision === 'approve');

        return $this->ok($status === 'approved' ? 'Linked when they set their PIN' : 'Stopped', ['status' => $status]);
    }

    // GET /child/home — CHD-03, on the child's own phone.
    public function home(Request $request): JsonResponse
    {
        return $this->ok('Home', ChildAppService::make()->home($this->child($request)));
    }

    // GET /child/requests — CHD-05
    public function requests(Request $request): JsonResponse
    {
        return $this->ok('Requests', ['requests' => ChildAppService::make()->requests($this->child($request))]);
    }

    // POST /child/goal  {amount, pin} — CHD-06 "Add to my goal"
    public function addToGoal(Request $request): JsonResponse
    {
        $data = $request->validate(['amount' => ['required', 'numeric', 'min:1'], 'pin' => ['required', self::TXN_PIN]]);

        return $this->ok('Saved', ChildAppService::make()->addToGoal($this->child($request), $this->toKobo($data['amount']), $data['pin']));
    }

    // GET /child/tasks — CHD-07
    public function myTasks(Request $request): JsonResponse
    {
        $wallet = ChildAppService::make()->walletOf($this->child($request)) ?? abort(404);

        return $this->ok('Tasks', ChildTaskService::make()->list($wallet));
    }

    // GET /wallets/{wallet}/child — CHD-09 for a parent, WPV-04 a co-parent, WPV-05 a relative.
    public function view(Request $request, Wallet $wallet): JsonResponse
    {
        if ($wallet->type !== 'child' || !$wallet->isAccessibleBy($request->user()) || $request->user()->isChild()) {
            return $this->fail('Child wallet not found', 404);
        }

        return $this->ok('Child wallet', ChildAppService::make()->view($wallet, $request->user()));
    }

    // PATCH /wallets/{wallet}/child — WPV-04 "Change limits".
    public function update(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->parentOf($request, $wallet)) {
            return $this->fail('Child wallet not found', 404);
        }
        $data = $request->validate([
            'allowance' => ['sometimes', 'numeric', 'min:0', 'max:1000000'],
            'daily_limit' => ['sometimes', 'numeric', 'min:0', 'max:1000000'],
            'auto_limit' => ['sometimes', 'numeric', 'min:0', 'max:100000'],
            'auto_per_week' => ['sometimes', 'integer', 'between:0,14'],
            'reason_required' => ['sometimes', 'boolean'],
            'shops' => ['sometimes', 'boolean'],
            'friends' => ['sometimes', 'boolean'],
            'online' => ['sometimes', 'boolean'],
            'cash' => ['sometimes', 'boolean'],
        ]);
        foreach (['allowance', 'daily_limit', 'auto_limit'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = $this->toKobo($data[$k]);
            }
        }
        ChildAppService::make()->update($wallet, $request->user(), $data);

        return $this->ok('Saved', ChildAppService::make()->view($wallet->fresh(), $request->user()));
    }

    // POST /wallets/{wallet}/child/note  {message} — WPV-05 "Send a note".
    public function note(Request $request, Wallet $wallet): JsonResponse
    {
        $data = $request->validate(['message' => ['required', 'string', 'max:200']]);
        if ($wallet->type !== 'child' || !$wallet->isAccessibleBy($request->user()) || $request->user()->isChild()) {
            return $this->fail('Child wallet not found', 404);
        }
        ChildAppService::make()->note($wallet, $request->user(), $data['message']);

        return $this->ok('Sent');
    }

    // GET /wallets/{wallet}/tasks — CHD-09 "Tasks and rewards", for a parent.
    public function tasks(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->parentOf($request, $wallet)) {
            return $this->fail('Child wallet not found', 404);
        }
        $list = ChildTaskService::make()->list($wallet);
        // The child's photo, from a short signed link.
        $list['tasks'] = collect($list['tasks'])->map(fn ($t) => $t + ['photo_url' => $t['has_photo'] ? URL::temporarySignedRoute('child-task.photo', now()->addMinutes(30), ['task' => $t['id']]) : null])->values();

        return $this->ok('Tasks', $list);
    }

    // POST /wallets/{wallet}/tasks — CHD-12 {title, reward, due_on?, repeat_weekly?, needs_photo?, coparent_can_approve?}
    public function addTask(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$this->parentOf($request, $wallet)) {
            return $this->fail('Child wallet not found', 404);
        }
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'reward' => ['required', 'numeric', 'min:1', 'max:100000'],
            'due_on' => ['nullable', 'date', 'after_or_equal:today'],
            'repeat_weekly' => ['sometimes', 'boolean'],
            'needs_photo' => ['sometimes', 'boolean'],
            'coparent_can_approve' => ['sometimes', 'boolean'],
        ]);
        $data['reward'] = $this->toKobo($data['reward']);
        $task = ChildTaskService::make()->create($wallet, $request->user(), $data);

        return $this->ok('Task sent', ['id' => $task->id], 201);
    }

    // POST /tasks/{task}/done  {photo?} — the child, CHD-07.
    public function taskDone(Request $request, ChildTask $task): JsonResponse
    {
        $request->validate(['photo' => ['nullable', 'image', 'max:8192']]);
        ChildTaskService::make()->done($task, $request->user(), $request->file('photo'));

        return $this->ok('Sent for checking', ChildTaskService::make()->list($task->wallet));
    }

    // POST /tasks/{task}/approve  {from_wallet_id?} — a parent pays the reward.
    public function approveTask(Request $request, ChildTask $task): JsonResponse
    {
        $data = $request->validate(['from_wallet_id' => ['nullable', 'integer']]);
        $paid = ChildTaskService::make()->approve($task, $request->user(), (int) ($data['from_wallet_id'] ?? 0));

        return $this->ok('Paid', ['reference' => $paid->paid_reference]);
    }

    // POST /tasks/{task}/send-back  {note?}
    public function sendBackTask(Request $request, ChildTask $task): JsonResponse
    {
        $data = $request->validate(['note' => ['nullable', 'string', 'max:200']]);
        ChildTaskService::make()->sendBack($task, $request->user(), $data['note'] ?? null);

        return $this->ok('Sent back');
    }

    // DELETE /tasks/{task}
    public function cancelTask(Request $request, ChildTask $task): JsonResponse
    {
        ChildTaskService::make()->cancel($task, $request->user());

        return $this->ok('Removed');
    }

    // GET /child-task-photos/{task}?signature=… (web, signed)
    public function taskPhoto(ChildTask $task): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        abort_unless($task->photo_path && Storage::disk('local')->exists($task->photo_path), 404);

        return Storage::disk('local')->response($task->photo_path, null, ['Cache-Control' => 'private, no-store']);
    }

    private function parentOf(Request $request, Wallet $wallet): bool
    {
        return $wallet->type === 'child' && in_array($wallet->roleOf($request->user()), ['owner', 'co_owner'], true);
    }

    private function child(Request $request): \App\Models\User
    {
        $user = $request->user();
        abort_unless($user->isChild(), 404);

        return $user;
    }
}
