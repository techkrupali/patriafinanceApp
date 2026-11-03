<?php

namespace App\Services;

use App\Models\Transaction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * AUT-11 "Contribution rules" for a shared savings or goal wallet: when to
 * remind people, a late fee (off by default — "families usually keep this
 * friendly"), and telling the owners after a week late. Interest and the
 * on-time bonus wait for a partner bank, so they're shown as not available.
 * Ajo circles keep their own stricter rules.
 */
class ContributionRulesService
{
    public const REMIND = ['day' => 'On the day', 'before_and_day' => '2 days before, and on the day', 'off' => 'Off'];

    public static function make(): self
    {
        return new self();
    }

    private function nice(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /** @return array<string, mixed> */
    public function settings(Wallet $wallet): array
    {
        $r = $wallet->meta['contribution_rules'] ?? [];

        return [
            'remind' => $r['remind'] ?? 'before_and_day',
            'late_fee_on' => (bool) ($r['late_fee_on'] ?? false),
            'late_fee' => (int) ($r['late_fee'] ?? 100_000),
            'tell_owners_after' => array_key_exists('tell_owners_after', $r) ? $r['tell_owners_after'] : 7,
            'share_by' => $r['share_by'] ?? 'contributions',
            'streak_bonus' => (bool) ($r['streak_bonus'] ?? false),
        ];
    }

    private function guard(Wallet $wallet, User $user): void
    {
        if ($wallet->type === 'ajo') {
            throw ValidationException::withMessages(['wallet' => 'Ajo circles use their own rules. Change them from the circle.']);
        }
        if (!in_array($wallet->roleOf($user), ['owner', 'co_owner'], true)) {
            throw ValidationException::withMessages(['wallet' => 'Only the owners can change contribution rules.']);
        }
    }

    /** What AUT-11 shows. */
    public function show(Wallet $wallet, User $viewer): array
    {
        $s = $this->settings($wallet);
        $in = WalletManageService::make()->contributions($wallet);
        $total = max(1, array_sum($in['by_user']));
        $shares = collect($in['by_user'])->sortDesc()->map(function (int $kobo, int $id) use ($total) {
            $u = User::find($id);

            return ($u?->first_name ?? 'Someone') . ' ' . round($kobo * 100 / $total) . '%';
        })->values()->join(' · ');

        return $s + [
            'wallet' => ['id' => $wallet->id, 'name' => $wallet->name, 'type' => $wallet->type],
            'remind_label' => self::REMIND[$s['remind']] ?? self::REMIND['before_and_day'],
            'reminder_day' => $wallet->reminderDay(),
            'late_fee_label' => $s['late_fee_on'] ? $this->nice($s['late_fee']) . ' after ' . ($s['tell_owners_after'] ?? 7) . ' days' : 'Off · families usually keep this friendly',
            'tell_label' => $s['tell_owners_after'] ? "After {$s['tell_owners_after']} days late" : 'Never',
            'shares' => array_sum($in['by_user']) > 0 ? $shares : null,
            // No partner bank yet: shown, honestly, as not available.
            'interest' => null,
            'can_edit' => in_array($wallet->roleOf($viewer), ['owner', 'co_owner'], true),
        ];
    }

    public function save(Wallet $wallet, User $user, array $d): array
    {
        $this->guard($wallet, $user);
        $s = $this->settings($wallet);
        if (isset($d['remind'])) {
            $s['remind'] = $d['remind'];
        }
        if (array_key_exists('late_fee_on', $d)) {
            $s['late_fee_on'] = (bool) $d['late_fee_on'];
        }
        if (isset($d['late_fee'])) {
            $fee = (int) $d['late_fee'];
            if ($fee < 10_000 || $fee > 10_000_000) {
                throw ValidationException::withMessages(['late_fee' => 'A late fee between ₦100 and ₦100,000.']);
            }
            $s['late_fee'] = $fee;
        }
        if (array_key_exists('tell_owners_after', $d)) {
            $s['tell_owners_after'] = $d['tell_owners_after'] ? (int) $d['tell_owners_after'] : null;
        }
        foreach (['share_by', 'streak_bonus'] as $k) {
            if (array_key_exists($k, $d)) {
                $s[$k] = $d[$k];
            }
        }
        $wallet->update(['meta' => array_merge($wallet->meta ?? [], ['contribution_rules' => $s])]);
        AuditService::make()->log($wallet, $user, 'rules_changed', 'Changed the contribution rules', ['contribution_rules' => $s]);

        return $this->show($wallet->fresh(), $user);
    }

    /**
     * Run daily: "2 days before" reminders, and on reminder day + N, the
     * savers who haven't added anything this month — they pay the late fee
     * (when on) and the owners hear.
     */
    public function runDaily(?Carbon $now = null): array
    {
        $now ??= now();
        $out = ['before' => 0, 'late' => 0, 'fees' => 0];
        Wallet::where('status', 'active')->whereNotNull('meta')->where('type', '!=', 'ajo')->get()->each(function (Wallet $w) use ($now, &$out) {
            $day = $w->reminderDay();
            if (!$day) {
                return;
            }
            $s = $this->settings($w);
            $period = $now->format('Y-m');
            $savers = $this->savers($w);

            if ($s['remind'] === 'before_and_day' && $now->day === max(1, $day - 2) && ($w->meta['reminded_before'] ?? null) !== $period) {
                foreach ($savers as $u) {
                    NotificationService::make()->push($u, 'savings_reminder', "{$w->name}: due in 2 days", "Your contribution to {$w->name} is due on the {$day}" . $this->suffix($day) . '.', ['wallet_id' => $w->id]);
                    $out['before']++;
                }
                $w->update(['meta' => array_merge($w->meta ?? [], ['reminded_before' => $period])]);
            }

            $after = $s['tell_owners_after'];
            if (!$after || $now->day !== min(28, $day + (int) $after) || ($w->meta['late_checked'] ?? null) === $period) {
                return;
            }
            $start = $now->copy()->startOfMonth();
            $late = $savers->reject(fn (User $u) => $u->id === $w->user_id)
                ->filter(fn (User $u) => !Transaction::where('wallet_id', $w->id)->where('user_id', $u->id)->where('direction', 'credit')
                    ->whereIn('type', WalletManageService::PUT_IN_TYPES)->where('status', 'successful')->where('created_at', '>=', $start)->exists());
            foreach ($late as $u) {
                $out['late']++;
                $fee = '';
                if ($s['late_fee_on'] && ($main = $u->mainWallet()) && $main->availableToSpend() >= $s['late_fee']) {
                    WalletService::make()->transferBetweenWallets($main, $w, $s['late_fee'], $u, "Late fee: {$w->name}");
                    $fee = " A {$this->nice($s['late_fee'])} late fee went in from {$u->first_name}'s Main.";
                    NotificationService::make()->push($u, 'contribution_late_fee', "Late fee for {$w->name}", "{$this->nice($s['late_fee'])} moved from your Main wallet. Your contribution is still due.", ['wallet_id' => $w->id]);
                    $out['fees']++;
                }
                foreach ($this->owners($w) as $owner) {
                    NotificationService::make()->push($owner, 'contribution_late', "{$u->first_name} hasn't added to {$w->name}", "Nothing from {$u->fullName()} this month, {$after} days after the {$day}" . $this->suffix($day) . ".{$fee}", ['wallet_id' => $w->id]);
                }
            }
            $w->update(['meta' => array_merge($w->meta ?? [], ['late_checked' => $period])]);
        });

        return $out;
    }

    private function suffix(int $n): string
    {
        return ($n % 100 >= 11 && $n % 100 <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][$n % 10] ?? 'th');
    }

    /** @return Collection<int, User> */
    private function savers(Wallet $w): Collection
    {
        return $w->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner', 'admin', 'contributor'])->with('user')->get()
            ->pluck('user')->push($w->owner)->filter()->unique('id')->values();
    }

    /** @return Collection<int, User> */
    private function owners(Wallet $w): Collection
    {
        return $w->members()->where('status', 'active')->whereIn('role', ['owner', 'co_owner'])->with('user')->get()
            ->pluck('user')->push($w->owner)->filter()->unique('id')->values();
    }
}
