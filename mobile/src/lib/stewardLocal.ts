import { formatMoney } from './format';
import type { ApprovalRequest, AutomationRule, DashboardData, FamilyData } from '../api/types';

/**
 * Steward's offline answers: grounded in the family's live numbers, used when
 * the AI assistant isn't configured on the server (or can't be reached).
 */
export interface Ctx {
  dashboard?: DashboardData;
  family?: FamilyData;
  automations?: AutomationRule[];
  pending?: ApprovalRequest[];
}

const GOAL_TYPES = ['savings', 'goal', 'emergency', 'giving'];

/** Steward's grounded, data-backed answers — no guessing, only live numbers. */
export function localAnswer(q: string, ctx: Ctx): string {
  const t = q.toLowerCase();
  const d = ctx.dashboard;

  if (/balance|total|kitna|how much.*(have|money)/.test(t)) {
    if (!d) return "I'm still loading your balances — try again in a second.";
    return `Your family treasury holds ${formatMoney(d.total_balance)} across ${d.wallets.length} wallets. The largest is ${[...d.wallets].sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))[0]?.name ?? '—'}.`;
  }
  if (/spend|outflow|spent|expense|money go|went/.test(t)) {
    if (!d) return 'One moment — your spending data is still loading.';
    return `In the last 30 days ${formatMoney(d.outflow_30d)} went out and ${formatMoney(d.inflow_30d)} came in. ${parseFloat(d.inflow_30d) >= parseFloat(d.outflow_30d) ? 'You saved more than you spent — strong month.' : 'Spending outpaced income this month — worth a look at Recent Activity.'}`;
  }
  if (/goal/.test(t)) {
    const goals = (d?.wallets ?? []).filter((w) => GOAL_TYPES.includes(w.type) && w.target_amount);
    if (goals.length === 0) return 'No savings goals with targets yet. Create one from Home → Goals and I’ll track it for you.';
    return goals
      .map((g) => {
        const pct = Math.min(100, Math.round((parseFloat(g.balance) / parseFloat(g.target_amount!)) * 100));
        return `${g.name}: ${formatMoney(g.balance)} of ${formatMoney(g.target_amount!)} (${pct}%)`;
      })
      .join('\n');
  }
  if (/family|member|\bwho\b/.test(t)) {
    const m = ctx.family?.members ?? [];
    if (m.length === 0) return 'No family members yet — invite someone from the Family tab.';
    return `Your family has ${m.length} member${m.length === 1 ? '' : 's'}: ${m.map((x) => `${x.name} (${x.role.replace('_', '-')})`).join(', ')}.`;
  }
  if (/pending|request|approv|waiting/.test(t)) {
    const p = ctx.pending ?? [];
    if (p.length === 0) return 'Nothing is waiting on your approval right now. All clear ✅';
    return `You have ${p.length} pending request${p.length === 1 ? '' : 's'}:\n${p.map((r) => `• ${r.initiator.name}: ${formatMoney(r.amount)} — ${r.description || r.action}`).join('\n')}\nApprove them from Home or the Approvals screen.`;
  }
  if (/rule|automat/.test(t)) {
    const a = ctx.automations ?? [];
    if (a.length === 0) return 'No rules yet. Open the Rules tab to automate allowances and savings — I can move money for you on a schedule.';
    return `You have ${a.length} active rule${a.length === 1 ? '' : 's'}:\n${a.map((r) => `• ${r.name}: ${formatMoney(r.amount)} ${r.from_wallet.name} → ${r.to_wallet.name}, ${r.next_run_hint.toLowerCase()}`).join('\n')}`;
  }
  if (/\b(hello|hi|hey|help)\b|what can/.test(t)) {
    return "I'm Steward — your family's financial guide. Ask me about your balance, spending, goals, family members, pending requests or rules. To automate money moves, set them up in the Rules tab and I'll run them on schedule.";
  }
  return "I track your family's live numbers — try asking “What's our balance?”, “How are our goals?”, “Any pending requests?” or “What rules are running?”";
}
