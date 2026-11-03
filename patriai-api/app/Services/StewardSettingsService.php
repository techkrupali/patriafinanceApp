<?php

namespace App\Services;

use App\Models\AutomationRule;
use App\Models\StewardAction;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Validation\ValidationException;

/**
 * AIS-05 "What Steward can do": suggest only, prepare for my OK (the PIN),
 * or act within limits (moves between your own wallets up to a limit, no
 * asking). RUL-09 "Steward auto-action": when salary lands set aside the
 * tithe, when a goal falls behind suggest a catch-up, when a vendor asks in
 * a project chat answer from the project's records.
 */
class StewardSettingsService
{
    public const MODES = ['suggest', 'prepare', 'act'];

    public static function make(): self
    {
        return new self();
    }

    private function nice(int $kobo): string
    {
        return '₦' . number_format($kobo / 100);
    }

    /** @return array{mode: string, limit: int, answer_vendors: bool, tell_after: bool} */
    public function settings(User $user): array
    {
        $s = ($user->settings ?? [])['steward'] ?? [];

        return [
            'mode' => in_array($s['mode'] ?? null, self::MODES, true) ? $s['mode'] : 'prepare',
            'limit' => (int) ($s['limit'] ?? 2_000_000),
            'answer_vendors' => (bool) ($s['answer_vendors'] ?? false),
            'tell_after' => (bool) ($s['tell_after'] ?? true),
        ];
    }

    public function save(User $user, array $d): array
    {
        $s = $this->settings($user);
        if (isset($d['mode'])) {
            $s['mode'] = $d['mode'];
        }
        if (isset($d['limit'])) {
            if ($d['limit'] < 100_000 || $d['limit'] > 50_000_000) {
                throw ValidationException::withMessages(['limit' => 'Pick a limit between ₦1,000 and ₦500,000.']);
            }
            $s['limit'] = (int) $d['limit'];
        }
        foreach (['answer_vendors', 'tell_after'] as $k) {
            if (array_key_exists($k, $d)) {
                $s[$k] = (bool) $d[$k];
            }
        }
        $user->forceFill(['settings' => array_merge($user->settings ?? [], ['steward' => $s])])->save();

        return $this->describe($user->fresh());
    }

    public function describe(User $user): array
    {
        $s = $this->settings($user);

        return $s + [
            'limit_label' => $this->nice($s['limit']),
            'auto_actions' => AutomationRule::where('user_id', $user->id)->where('name', 'like', 'Steward:%')->get()
                ->map(fn (AutomationRule $r) => ['id' => $r->id, 'name' => $r->name, 'enabled' => (bool) $r->enabled])->values()->all(),
        ];
    }

    /** "Act within limits": may Steward do this move on its own? */
    public function mayAct(User $user, Wallet $from, Wallet $to, int $amount): bool
    {
        $s = $this->settings($user);

        return $s['mode'] === 'act' && $from->user_id === $user->id && $to->user_id === $user->id && $amount <= $s['limit'];
    }

    public function log(User $user, string $kind, string $summary, ?int $amount = null, ?string $reference = null, array $meta = []): StewardAction
    {
        return StewardAction::create(['user_id' => $user->id, 'kind' => $kind, 'summary' => $summary, 'amount' => $amount, 'reference' => $reference, 'meta' => $meta ?: null]);
    }

    /**
     * RUL-09 "Turn on".
     *
     * @param  array{when: string, will: string, limit?: int, tell?: bool, wallet_id?: int, percent?: int}  $d
     */
    public function autoAction(User $user, array $d): array
    {
        $tell = (bool) ($d['tell'] ?? true);
        $limit = (int) ($d['limit'] ?? 6_000_000);
        switch ($d['when'] . ':' . $d['will']) {
            case 'salary:tithe':
                $main = $user->mainWallet();
                $to = isset($d['wallet_id']) ? Wallet::where('id', $d['wallet_id'])->where('user_id', $user->id)->first()
                    : Wallet::where('user_id', $user->id)->where('type', 'giving')->where('status', 'active')->first();
                if (!$main || !$to) {
                    throw ValidationException::withMessages(['wallet_id' => 'Make a giving wallet for your tithe first.']);
                }
                $percent = max(1, min(30, (int) ($d['percent'] ?? 10)));
                $rule = AutomationRule::updateOrCreate(
                    ['user_id' => $user->id, 'name' => 'Steward: set aside my tithe'],
                    ['from_wallet_id' => $main->id, 'to_wallet_id' => $to->id, 'trigger' => 'salary', 'percent' => $percent, 'amount' => $limit, 'frequency' => 'monthly', 'enabled' => true, 'action' => 'move', 'notify_user_ids' => null],
                );

                return ['rule_id' => $rule->id, 'line' => "When salary lands, Steward moves {$percent}% (up to {$this->nice($limit)}) to {$to->name}" . ($tell ? ' and tells you.' : '.')];
            case 'goal_behind:catchup':
                $rule = AutomationRule::updateOrCreate(
                    ['user_id' => $user->id, 'name' => 'Steward: suggest a catch-up plan'],
                    ['from_wallet_id' => $user->mainWallet()?->id, 'to_wallet_id' => $user->mainWallet()?->id, 'trigger' => 'event', 'event' => 'goal_behind', 'amount' => 0, 'frequency' => 'weekly', 'enabled' => true, 'action' => 'notify'],
                );

                return ['rule_id' => $rule->id, 'line' => 'When a goal falls behind, Steward suggests a catch-up plan. You decide.'];
            case 'vendor_chat:answer_vendor':
                $this->save($user, ['answer_vendors' => true]);

                return ['rule_id' => null, 'line' => "When a vendor asks in a project's chat, Steward answers from that project's records."];
            default:
                throw ValidationException::withMessages(['will' => 'Pick what Steward should do.']);
        }
    }
}
