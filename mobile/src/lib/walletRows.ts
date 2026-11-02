import type { Wallet } from '../api/types';
import { formatYmd } from './format';
import { walletVisual } from './walletVisual';

/** Treasury buckets (prototype TRS-01/02): only you, someone else is in it, a child's, other circles (ajo). */
export type WalletBucket = 'mine' | 'shared' | 'children' | 'circles';

export function walletBucket(w: Wallet): WalletBucket {
  if (w.type === 'ajo') return 'circles';
  if (w.type === 'child') return 'children';
  return w.is_shared || (w.my_role && w.my_role !== 'owner') ? 'shared' : 'mine';
}

/** "9012234471" → "901 223 4471" */
export function groupAccountNumber(n: string): string {
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

/**
 * One-line description under a wallet's name: the account number for Main,
 * progress for goals ("Goal · 80% · due 8 Jan"), otherwise the type and owner.
 */
export function walletSubtitle(w: Wallet, long = false): string {
  const label = walletVisual(w.type).label;
  const type = label.charAt(0) + label.slice(1).toLowerCase();
  if (w.type === 'main') return w.virtual_account ? `${groupAccountNumber(w.virtual_account)}${long ? ' · everyday' : ''}` : 'Your everyday wallet';
  if (w.type === 'emergency') return w.emergency_locked ? 'Emergency · locked' : 'Emergency · open';
  // TRS-02 "Unity ladies ajo · Your turn in March · ₦600,000".
  if (w.type === 'ajo') return w.ajo ? `${w.ajo.line} · ₦${Math.round(parseFloat(w.ajo.payout)).toLocaleString('en-NG')}` : 'Ajo circle';

  const target = parseFloat(w.target_amount ?? '');
  if (Number.isFinite(target) && target > 0) {
    const pct = Math.min(100, Math.floor(((parseFloat(w.balance) || 0) * 100) / target));
    const due = w.target_date ? ` · due ${formatYmd(w.target_date).replace(/ \d{4}$/, '')}` : '';
    return `${type} · ${pct}%${due}`;
  }

  const status = w.status && w.status !== 'active' ? ` · ${w.status}` : '';
  const owner = w.owner && w.my_role !== 'owner' ? ` · ${w.owner.name}` : '';
  return `${type}${owner}${status}`;
}
