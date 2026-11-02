import type { Wallet } from '../api/types';
import type { SendRecipient } from '../store/sendDraft';

/** The wallet's own state as the app knows it (the server decides; this explains). */
export function lockedReason(w: Wallet): string | null {
  if (w.closed) return w.closed.mode === 'archive' ? 'Archived' : 'Closed';
  if (w.status && w.status !== 'active') return w.status === 'suspended' ? 'Suspended by Patriai' : 'Paused';
  if (w.emergency_locked) return 'Release only when agreed';
  if (w.lock?.locked) return w.lock.until ? `Locked until ${new Date(w.lock.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Locked';
  if (w.goal_locked) return 'Locked until the goal is reached';
  return null;
}

/** Wallets money can be sent from by this person. */
export function canSendFrom(w: Wallet): boolean {
  return ['owner', 'co_owner'].includes(w.my_role ?? 'owner') || w.my_role === undefined;
}

/** Over the wallet's approval threshold (WAL-08), when it has someone else to ask. */
export function needsApproval(w: Wallet, amount: number): boolean {
  if (!w.is_shared) return false;
  // Locked savings that need everyone's yes to come out early (SAV-05).
  if ((w.goal_locked || w.lock?.locked) && w.lock?.approval) return true;
  if (!w.approval_enabled) return false;
  const threshold = w.approval_threshold === null || w.approval_threshold === undefined ? 0 : parseFloat(w.approval_threshold);
  return amount > threshold;
}

/** SND-04 "Any Nigerian bank · ₦20 fee"; Patriai users and own wallets are free. */
export function feeFor(r: SendRecipient | null, bankFee: number): number {
  if (r?.kind === 'group') return r.banks * bankFee;
  return r?.kind === 'bank' ? bankFee : 0;
}

/** What can leave now: the "available" figure when the wallet keeps money aside, else the balance. */
export function spendable(w: Wallet): number {
  return parseFloat(w.available ?? w.balance);
}
