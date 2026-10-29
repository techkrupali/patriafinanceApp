<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletAuditLog;
use App\Services\WalletManageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

/**
 * WAL-10 lock, WAL-11 ask to unlock, WAL-13 close or archive and WAL-15
 * statements. Rule changes go through PATCH /wallets/{wallet}
 * (WalletController::updateSettings), which asks the other owners when needed.
 */
class WalletManageController extends ApiController
{
    private function guardOwner(Request $request, Wallet $wallet): ?JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        if (!in_array($wallet->roleOf($request->user()), Wallet::SPENDING_ROLES, true)) {
            return $this->fail('Only the owner or a co-owner can do this', 403);
        }

        return null;
    }

    // POST /wallets/{wallet}/lock  { mode: date|target|agree, until?, pay_payee? }
    public function lock(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwner($request, $wallet)) {
            return $err;
        }
        $data = $request->validate([
            'mode' => ['required', 'in:' . implode(',', Wallet::LOCK_MODES)],
            'until' => ['nullable', 'date'],
            'pay_payee' => ['sometimes', 'boolean'],
        ]);
        WalletManageService::make()->setLock($wallet, $request->user(), $data['mode'], $data['until'] ?? null, $request->boolean('pay_payee', true));

        return $this->ok('Wallet locked', ['wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true)]);
    }

    // POST /wallets/{wallet}/unlock — "Until we both agree": the others say yes
    public function unlock(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwner($request, $wallet)) {
            return $err;
        }
        $pending = WalletManageService::make()->askToRemoveLock($wallet, $request->user());

        return $this->ok($pending ? 'Sent for approval' : 'Wallet unlocked', [
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
            'approval' => $pending ? $this->serializeApprovalRequest($pending->load(['wallet', 'initiator']), $request->user()) : null,
        ]);
    }

    // POST /wallets/{wallet}/unlock-requests  multipart { amount, purpose, proof?, pay_to: payee|main|saved, saved_account_id? }
    public function requestMoney(Request $request, Wallet $wallet): JsonResponse
    {
        if (!$wallet->isAccessibleBy($request->user())) {
            return $this->fail('Wallet not found', 404);
        }
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'purpose' => ['required', 'string', 'max:160'],
            'proof' => ['nullable', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,heic,pdf'],
            'pay_to' => ['required', 'in:payee,main,saved'],
            'saved_account_id' => ['required_if:pay_to,saved', 'nullable', 'integer'],
        ]);
        $proof = $request->file('proof')?->store('unlock-proofs', 'public');
        $approval = WalletManageService::make()->requestMoney($wallet, $request->user(), $this->toKobo((string) $data['amount']), trim($data['purpose']), $proof, [
            'kind' => $data['pay_to'],
            'saved_account_id' => $data['saved_account_id'] ?? null,
        ]);

        return $this->ok('Sent for approval', ['approval' => $this->serializeApprovalRequest($approval->load(['wallet', 'initiator']), $request->user())], 201);
    }

    // GET /wallets/{wallet}/close
    public function closePreview(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwner($request, $wallet)) {
            return $err;
        }

        return $this->ok('Close options', WalletManageService::make()->closePreview($wallet, $request->user()));
    }

    // POST /wallets/{wallet}/close  { mode: archive|close, move_to: each|wallet|main, wallet_id? }
    public function close(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardOwner($request, $wallet)) {
            return $err;
        }
        $data = $request->validate([
            'mode' => ['required', 'in:archive,close'],
            'move_to' => ['nullable', 'in:each,wallet,main'],
            'wallet_id' => ['required_if:move_to,wallet', 'nullable', 'integer'],
        ]);
        $result = WalletManageService::make()->requestClose($wallet, $request->user(), [
            'mode' => $data['mode'],
            'move_to' => $data['move_to'] ?? null,
            'wallet_id' => isset($data['wallet_id']) ? (int) $data['wallet_id'] : null,
        ]);

        return $this->ok($result['done'] ? ($data['mode'] === 'close' ? 'Wallet closed' : 'Wallet archived') : 'Sent for approval', [
            'done' => $result['done'],
            'wallet' => $this->serializeWallet($wallet->refresh(), withOwner: true),
            'approval' => $result['request'] ? $this->serializeApprovalRequest($result['request']->load(['wallet', 'initiator']), $request->user()) : null,
        ]);
    }

    /** Statements are for the people who can see the wallet's money. */
    private function guardStatement(User $user, Wallet $wallet): ?JsonResponse
    {
        if (!$wallet->isAccessibleBy($user) || !$wallet->canView($user)) {
            return $this->fail('Wallet not found', 404);
        }

        return null;
    }

    private function statementInput(Request $request): array
    {
        return $request->validate([
            'period' => ['sometimes', 'in:this_month,last_3_months,since_start,custom'],
            'from' => ['required_if:period,custom', 'nullable', 'date'],
            'to' => ['required_if:period,custom', 'nullable', 'date'],
            'format' => ['sometimes', 'in:pdf,csv'],
            'contributions' => ['sometimes', 'boolean'],
            'audit' => ['sometimes', 'boolean'],
        ]);
    }

    // GET /wallets/{wallet}/statement?period=&from=&to=
    public function statement(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardStatement($request->user(), $wallet)) {
            return $err;
        }
        $data = $this->statementInput($request);
        $service = WalletManageService::make();
        [$from, $to] = $service->range($wallet, $data['period'] ?? 'since_start', $data['from'] ?? null, $data['to'] ?? null);
        $s = $service->statement($wallet, $from, $to);

        return $this->ok('Statement', [
            'from' => $from->copy()->setTimezone('Africa/Lagos')->toDateString(),
            'to' => $to->copy()->setTimezone('Africa/Lagos')->toDateString(),
            'count' => $s['count'],
            'in' => number_format($s['in'] / 100, 2, '.', ''),
            'out' => number_format($s['out'] / 100, 2, '.', ''),
            'opening' => number_format($s['opening'] / 100, 2, '.', ''),
            'closing' => number_format($s['closing'] / 100, 2, '.', ''),
            'email' => $request->user()->email,
            // The audit log is for owners and co-owners (as on the audit log itself).
            'can_include_audit' => in_array($wallet->roleOf($request->user()), Wallet::SPENDING_ROLES, true),
        ]);
    }

    // POST /wallets/{wallet}/statement/link → a 10-minute download link (works in any browser)
    public function statementLink(Request $request, Wallet $wallet): JsonResponse
    {
        if ($err = $this->guardStatement($request->user(), $wallet)) {
            return $err;
        }
        $data = $this->statementInput($request);
        $url = URL::temporarySignedRoute('wallet.statement', now()->addMinutes(10), [
            'wallet' => $wallet->id,
            'user' => $request->user()->id,
            'period' => $data['period'] ?? 'since_start',
            'from' => $data['from'] ?? null,
            'to' => $data['to'] ?? null,
            'format' => $data['format'] ?? 'pdf',
            'contributions' => $request->boolean('contributions') ? 1 : 0,
            'audit' => $request->boolean('audit') ? 1 : 0,
        ]);

        return $this->ok('Statement ready', ['url' => $url]);
    }

    // GET /statements/{wallet}?signature=… (web, signed)
    public function download(Request $request, Wallet $wallet): Response
    {
        $user = User::find((int) $request->query('user'));
        if (!$user || $this->guardStatement($user, $wallet)) {
            abort(404);
        }
        $file = $this->file($request, $wallet, $user);

        return response($file['bytes'], 200, [
            'Content-Type' => $file['mime'],
            'Content-Disposition' => 'attachment; filename="' . $file['name'] . '"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    // POST /wallets/{wallet}/statement/email
    public function email(Request $request, Wallet $wallet): JsonResponse
    {
        $user = $request->user();
        if ($err = $this->guardStatement($user, $wallet)) {
            return $err;
        }
        $this->statementInput($request);
        if (!$user->email) {
            return $this->fail('Add an email address in your profile first', 422);
        }
        $file = $this->file($request, $wallet, $user);
        Mail::raw("Hello {$user->first_name},\n\nYour statement for {$wallet->name} is attached.\n\nPatriai", function ($m) use ($user, $wallet, $file) {
            $m->to($user->email)->subject("{$wallet->name} statement")->attachData($file['bytes'], $file['name'], ['mime' => $file['mime']]);
        });

        return $this->ok("Sent to {$user->email}", ['sent_to' => $user->email]);
    }

    private function file(Request $request, Wallet $wallet, User $user): array
    {
        $service = WalletManageService::make();
        [$from, $to] = $service->range($wallet, (string) $request->input('period', 'since_start'), $request->input('from'), $request->input('to'));
        $audit = filter_var($request->input('audit'), FILTER_VALIDATE_BOOLEAN) && in_array($wallet->roleOf($user), Wallet::SPENDING_ROLES, true);
        $contributions = filter_var($request->input('contributions'), FILTER_VALIDATE_BOOLEAN) && $service->canSeeContributions($wallet, $user);

        return $service->statementFile($wallet, $request->input('format') === 'csv' ? 'csv' : 'pdf', $from, $to, $contributions, $audit);
    }

    /** Proof attached to an unlock request, for its approvers. */
    public static function proofUrl(?string $path): ?string
    {
        return $path ? Storage::disk('public')->url($path) : null;
    }

    /** For the audit log: avatar initials of whoever acted. */
    public static function initials(?User $user): string
    {
        if (!$user) {
            return 'P';
        }
        $parts = preg_split('/\s+/', trim($user->fullName())) ?: [];

        return strtoupper(mb_substr($parts[0] ?? '', 0, 1) . mb_substr(count($parts) > 1 ? end($parts) : '', 0, 1)) ?: '?';
    }

    /** Kept here so the audit log and admin share one wording. */
    public static function auditTitle(WalletAuditLog $log): array
    {
        $meta = $log->meta ?? [];
        $who = $log->actor ? ($log->actor->first_name ?: $log->actor->fullName()) : 'Patriai';
        $summary = $meta['summary'] ?? match ($log->event) {
            'wallet_created' => 'created the wallet',
            'wallet_frozen' => 'paused the wallet',
            'wallet_unfrozen' => 'resumed the wallet',
            'member_added' => 'joined',
            'member_removed' => 'removed a member',
            'member_role_changed' => 'changed a role',
            'permissions_changed' => 'changed permissions',
            'access_schedule_set' => 'changed when money can go out',
            'rule_added' => 'added a rule',
            'settings_changed' => 'changed the settings',
            'approval_approved' => 'said yes',
            'approval_rejected' => 'said no',
            'wallet_suspended' => 'suspended the wallet',
            'wallet_restored' => 'restored the wallet',
            default => null,
        };
        $detail = $meta['detail'] ?? match ($log->event) {
            'member_added' => isset($meta['role']) ? 'As ' . (['co_owner' => 'a co-owner', 'contributor' => 'a contributor', 'viewer' => 'a viewer', 'admin' => 'an admin'][$meta['role']] ?? str_replace('_', ' ', $meta['role'])) . (isset($meta['invited_by']) && ($by = User::find($meta['invited_by'])) ? ' · invited by ' . ($by->first_name ?: $by->fullName()) : '') : null,
            'approval_approved', 'approval_rejected' => preg_replace('/^Said (yes|no) to /', '', $log->description),
            'member_removed', 'member_role_changed', 'permissions_changed' => $log->description,
            default => null,
        };

        return [
            'title' => $summary ? "{$who} {$summary}" : $log->description,
            'detail' => $detail ?: null,
        ];
    }
}
