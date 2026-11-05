<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Services\InsightsService;
use App\Services\StatementBundleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * Insights (INS-01…06) and statements for several wallets (INS-07, STM-01/02).
 * Everything is limited to the wallets the person can see the money of.
 */
class InsightsController extends ApiController
{
    // GET /insights?range=month|6m|year — INS-01
    public function overview(Request $request): JsonResponse
    {
        $data = $request->validate(['range' => ['sometimes', 'in:month,6m,year']]);

        return $this->ok('Insights', InsightsService::make()->overview($request->user(), $data['range'] ?? '6m'));
    }

    // GET /insights/categories?month=2026-10 — INS-02
    public function categories(Request $request): JsonResponse
    {
        $data = $request->validate(['month' => ['sometimes', 'nullable', 'date_format:Y-m']]);

        return $this->ok('Spending by category', InsightsService::make()->categories($request->user(), $data['month'] ?? null));
    }

    // GET /insights/wallets/{wallet} — INS-03
    public function wallet(Request $request, Wallet $wallet): JsonResponse
    {
        $user = $request->user();
        if (!$this->visible($user, $wallet)) {
            return $this->fail('Wallet not found', 404);
        }

        return $this->ok('Wallet report', InsightsService::make()->walletReport($wallet, $user));
    }

    // GET /insights/budget — INS-04
    public function budget(Request $request): JsonResponse
    {
        return $this->ok('Budget vs actual', ['budgets' => InsightsService::make()->budgets($request->user())]);
    }

    // GET /insights/forecast — INS-05
    public function forecast(Request $request): JsonResponse
    {
        return $this->ok('Savings forecast', InsightsService::make()->forecast($request->user()));
    }

    // GET /insights/contributions?year=2026 — INS-06
    public function contributions(Request $request): JsonResponse
    {
        $data = $request->validate(['year' => ['sometimes', 'integer', 'min:2020', 'max:2100']]);

        return $this->ok('Who put in what', InsightsService::make()->contributions($request->user(), isset($data['year']) ? (int) $data['year'] : null));
    }

    // ------------------------------------------------------------ statements

    private function visible(User $user, Wallet $wallet): bool
    {
        return $wallet->isAccessibleBy($user) && $wallet->canView($user) && !$wallet->hidesSpendingFrom($user);
    }

    // GET /statements — STM-01 wallets with balances, INS-07 chips
    public function statementWallets(Request $request): JsonResponse
    {
        $wallets = InsightsService::make()->wallets($request->user());

        return $this->ok('Wallets', [
            'wallets' => $wallets->map(fn (Wallet $w) => [
                'id' => $w->id,
                'name' => $w->name,
                'type' => $w->type,
                'balance' => number_format($w->balance / 100, 2, '.', ''),
                'status' => $w->status,
                'mine' => $w->user_id === $request->user()->id,
            ])->values(),
            'email' => $request->user()->email,
        ]);
    }

    // GET /statements/months?wallet=12|all — INS-07
    public function statementMonths(Request $request): JsonResponse
    {
        $data = $request->validate(['wallet' => ['sometimes', 'string', 'max:20']]);
        $all = InsightsService::make()->wallets($request->user());
        $key = $data['wallet'] ?? 'all';
        $wallets = $key === 'all' ? $all : $all->where('id', (int) $key)->values();
        if ($wallets->isEmpty()) {
            return $this->fail('Wallet not found', 404);
        }

        return $this->ok('Statements', StatementBundleService::make()->months($wallets));
    }

    /** STM-01 choices: the wallets (only ones this person can see), the period, combined or not. */
    private function batchInput(Request $request): array
    {
        $data = $request->validate([
            'wallet_ids' => ['required', 'array', 'min:1', 'max:50'],
            'wallet_ids.*' => ['integer'],
            'period' => ['required', 'in:' . implode(',', StatementBundleService::PERIODS)],
            'from' => ['required_if:period,custom', 'nullable', 'date'],
            'to' => ['required_if:period,custom', 'nullable', 'date'],
            'combined' => ['sometimes', 'boolean'],
            'format' => ['sometimes', 'in:' . implode(',', StatementBundleService::FORMATS)],
            'wallet_id' => ['sometimes', 'nullable', 'integer'],
        ]);
        $visible = InsightsService::make()->wallets($request->user());
        $wallets = $visible->whereIn('id', array_map('intval', $data['wallet_ids']))->values();
        if ($wallets->count() !== count(array_unique($data['wallet_ids']))) {
            abort(response()->json(['status' => false, 'message' => 'Choose wallets you can see'], 422));
        }
        [$from, $to] = StatementBundleService::make()->range($data['period'], $data['from'] ?? null, $data['to'] ?? null);

        return [$data, $wallets, $from, $to];
    }

    // POST /statements/batch — STM-02 the files that will be made
    public function batch(Request $request): JsonResponse
    {
        [$data, $wallets, $from, $to] = $this->batchInput($request);
        $service = StatementBundleService::make();
        $parts = $service->parts($wallets, $from, $to);
        $combined = $request->boolean('combined') && count($parts) > 1;
        $files = $combined
            ? [[
                'key' => 'all',
                'name' => 'All ' . count($parts) . ' wallets',
                'wallet_ids' => $wallets->pluck('id')->values(),
                'label' => $service->label($from, $to),
                'count' => array_sum(array_column($parts, 'count')),
            ]]
            : array_map(fn ($p) => [
                'key' => (string) $p['wallet']->id,
                'name' => $p['wallet']->name,
                'wallet_ids' => [$p['wallet']->id],
                'label' => $service->label($p['from'], $p['to']),
                'count' => $p['count'],
            ], $parts);

        return $this->ok('Statements ready', [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'combined' => $combined,
            'files' => $files,
            'email' => $request->user()->email,
        ]);
    }

    // POST /statements/batch/link {…, format, wallet_id?} — one file, or all of them (combined or a zip)
    public function batchLink(Request $request): JsonResponse
    {
        [$data, $wallets, $from, $to] = $this->batchInput($request);
        [$ids, $mode] = $this->mode($request, $data, $wallets);
        $url = URL::temporarySignedRoute('statements.files', now()->addMinutes(10), [
            'user' => $request->user()->id,
            'wallets' => implode(',', $ids),
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'format' => $data['format'] ?? 'pdf',
            'mode' => $mode,
        ]);

        return $this->ok('Statement ready', ['url' => $url]);
    }

    // POST /statements/batch/email — everything asked for, attached
    public function batchEmail(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->email) {
            return $this->fail('Add an email address in your profile first', 422);
        }
        [$data, $wallets, $from, $to] = $this->batchInput($request);
        [$ids, $mode] = $this->mode($request, $data, $wallets);
        $file = StatementBundleService::make()->build($user, $wallets->whereIn('id', $ids)->values(), $from, $to, $data['format'] ?? 'pdf', $mode);
        Mail::raw("Hello {$user->first_name},\n\nYour Patriai statements are attached.\n\nPatriai", function ($m) use ($user, $file) {
            $m->to($user->email)->subject('Your Patriai statements')->attachData($file['bytes'], $file['name'], ['mime' => $file['mime']]);
        });

        return $this->ok("Sent to {$user->email}", ['sent_to' => $user->email]);
    }

    /** One wallet's file (wallet_id), one combined file, or a zip of one file per wallet. */
    private function mode(Request $request, array $data, Collection $wallets): array
    {
        if (!empty($data['wallet_id'])) {
            if (!$wallets->contains('id', (int) $data['wallet_id'])) {
                abort(response()->json(['status' => false, 'message' => 'Wallet not found'], 404));
            }

            return [[(int) $data['wallet_id']], 'one'];
        }
        $ids = $wallets->pluck('id')->all();
        if (count($ids) === 1) {
            return [$ids, 'one'];
        }

        return [$ids, $request->boolean('combined') ? 'combined' : 'zip'];
    }

    // GET /statement-files?signature=… (web, signed, 10 minutes)
    public function download(Request $request): Response
    {
        $user = User::find((int) $request->query('user'));
        $ids = array_filter(array_map('intval', explode(',', (string) $request->query('wallets'))));
        if (!$user || !$ids) {
            abort(404);
        }
        $wallets = InsightsService::make()->wallets($user)->whereIn('id', $ids)->values();
        if ($wallets->count() !== count(array_unique($ids))) {
            abort(404);
        }
        $service = StatementBundleService::make();
        [$from, $to] = $service->range('custom', (string) $request->query('from'), (string) $request->query('to'));
        $mode = in_array($request->query('mode'), ['one', 'combined', 'zip'], true) ? $request->query('mode') : 'one';
        $file = $service->build($user, $wallets, $from, $to, (string) $request->query('format', 'pdf'), $mode);

        return response($file['bytes'], 200, [
            'Content-Type' => $file['mime'],
            'Content-Disposition' => 'attachment; filename="' . $file['name'] . '"',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
