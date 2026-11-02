<?php

namespace App\Services;

use App\Models\ApprovalRequest;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * APR-09 Away mode: while you're away, someone you trust answers approvals for
 * you on shared wallets, up to an amount per payment. Emergency fund releases
 * are never handed over. Settings live in users.settings.away.
 */
class AwayService
{
    public const TIMEZONE = 'Africa/Lagos';

    public static function make(): self
    {
        return new self();
    }

    /** The away settings while they're on (today is between from and to). */
    public function active(User $user): ?array
    {
        $away = $user->settings['away'] ?? null;
        if (!is_array($away) || empty($away['on']) || empty($away['delegate_id'])) {
            return null;
        }
        $today = now()->setTimezone(self::TIMEZONE)->toDateString();

        return $today >= ($away['from'] ?? $today) && $today <= ($away['to'] ?? $today) ? $away : null;
    }

    /** APR-09 "Turn on away mode". */
    public function set(User $user, array $data): array
    {
        $delegate = User::find((int) $data['delegate_id']);
        if (!$delegate || $delegate->id === $user->id) {
            throw ValidationException::withMessages(['delegate_id' => 'Choose someone else to approve for you.']);
        }
        if ((int) $delegate->kyc_tier < 2) {
            throw ValidationException::withMessages(['delegate_id' => "{$delegate->first_name} needs to verify to Tier 2 first — their yes moves money."]);
        }
        $from = Carbon::parse($data['from'])->toDateString();
        $to = Carbon::parse($data['to'])->toDateString();
        if ($to < $from) {
            throw ValidationException::withMessages(['to' => 'The end has to be after the start.']);
        }
        $settings = $user->settings ?? [];
        $settings['away'] = [
            'on' => true,
            'delegate_id' => $delegate->id,
            'from' => $from,
            'to' => $to,
            'max_amount' => isset($data['max_amount']) ? (int) $data['max_amount'] : null,
        ];
        $user->forceFill(['settings' => $settings])->save();
        NotificationService::make()->push(
            $delegate,
            'away_delegate',
            "{$user->first_name} asked you to approve for them",
            "From " . Carbon::parse($from)->format('j M') . ' to ' . Carbon::parse($to)->format('j M') . ($settings['away']['max_amount'] ? ', up to ₦' . number_format($settings['away']['max_amount'] / 100) . ' a payment' : '') . '. Each request shows "Approving for ' . $user->first_name . '".',
            ['user_id' => $user->id],
        );

        return $settings['away'];
    }

    public function off(User $user): void
    {
        $settings = $user->settings ?? [];
        unset($settings['away']);
        $user->forceFill(['settings' => $settings])->save();
    }

    /** People who handed their approvals to $delegate right now. @return Collection<int, User> */
    public function principalsFor(User $delegate): Collection
    {
        return User::where('settings->away->delegate_id', $delegate->id)->get()->filter(fn (User $u) => $this->active($u) !== null)->values();
    }

    /**
     * Who $delegate may answer this request for: someone away who would be asked
     * themselves, within their limit, not on an emergency fund, not their own
     * request and not answered yet. Null when nobody.
     */
    public function actingFor(ApprovalRequest $request, User $delegate): ?User
    {
        $request->loadMissing('wallet');
        if (!$request->wallet || $request->wallet->type === 'emergency') {
            return null;
        }
        $named = $request->payload['approver_ids'] ?? null;
        foreach ($this->principalsFor($delegate) as $principal) {
            $away = $this->active($principal);
            if ($principal->id === $request->initiator_id || $principal->id === $delegate->id) {
                continue;
            }
            $asked = is_array($named) ? in_array($principal->id, array_map('intval', $named), true) : $request->wallet->canApprove($principal);
            if (!$asked || ($away['max_amount'] !== null && $request->amount > (int) $away['max_amount'])) {
                continue;
            }
            if ($request->responses()->where('approver_id', $principal->id)->exists()) {
                continue;
            }

            return $principal;
        }

        return null;
    }

    /** What the More page shows. */
    public function summary(User $user): ?array
    {
        $away = $user->settings['away'] ?? null;
        if (!is_array($away) || empty($away['on'])) {
            return null;
        }
        $delegate = User::find((int) $away['delegate_id']);

        return [
            'on' => true,
            'active' => $this->active($user) !== null,
            'delegate' => $delegate ? ['id' => $delegate->id, 'name' => $delegate->fullName(), 'first_name' => $delegate->first_name] : null,
            'from' => $away['from'],
            'to' => $away['to'],
            'max_amount' => $away['max_amount'] !== null ? number_format($away['max_amount'] / 100, 2, '.', '') : null,
        ];
    }
}
