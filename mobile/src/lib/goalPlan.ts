import { formatNaira, formatYmd, parseYmd } from './format';
import type { ApprovalMode } from '../api/types';

/** Roles you can give someone when creating a wallet (WCR-08). */
export type NewMemberRole = 'co_owner' | 'contributor' | 'viewer';

export const NEW_MEMBER_ROLES: { value: NewMemberRole; label: string; hint: string }[] = [
  { value: 'co_owner', label: 'Co-owner', hint: 'Can send, approve and change rules' },
  { value: 'contributor', label: 'Contributor', hint: "Adds money and sees activity, can't take money out" },
  { value: 'viewer', label: 'Viewer', hint: 'Sees the balance and activity only' },
];

export const roleName = (r: NewMemberRole) => NEW_MEMBER_ROLES.find((x) => x.value === r)?.label ?? r;

/** "Payments from this wallet over" choices (WCR-09); null = any amount. */
export const THRESHOLDS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 20000, label: '₦20k' },
  { value: 50000, label: '₦50k' },
  { value: 100000, label: '₦100k' },
];

export const EXPIRY_HOURS = [24, 48, 72] as const;

/** "You", "Ngozi and Emeka", "You, Emeka, Ada". */
export function joinNames(names: string[], comma = false): string {
  if (names.length <= 1) return names[0] ?? '';
  if (comma) return names.join(', ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** 1 → "1st", 22 → "22nd", 25 → "25th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Round up to the nearest ₦100, the way Steward quotes a monthly amount. */
const up100 = (n: number) => Math.ceil(n / 100) * 100;

/**
 * Steward's monthly plan (WCR-11): what to save a month to reach the target by
 * the date, and each saver's share. Null without a target or a future date.
 */
export function monthlyPlan(target: number, targetDate: string | null, savers: number, saved = 0) {
  const date = parseYmd(targetDate);
  const remaining = target - saved;
  if (!(remaining > 0) || !date || date.getTime() <= Date.now()) return null;
  const months = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 86_400_000 / 30.44));
  const monthly = up100(remaining / months);
  return { months, monthly, each: up100(monthly / Math.max(1, savers)) };
}

/** WCR-11 "Ngozi and Emeka approve over ₦50,000. Locked until reached." */
export function approvalSummary(opts: {
  mode: ApprovalMode;
  threshold: number | null;
  approvers: string[];
  lockUntilGoal: boolean;
}): string {
  const { mode, threshold, approvers, lockUntilGoal } = opts;
  const who =
    approvers.length <= 1
      ? `${approvers[0] ?? 'You'} approve${approvers[0] === 'You' ? '' : 's'}`
      : mode === 'any'
        ? 'Any one of ' + joinNames(approvers) + ' approves'
        : mode === 'majority'
          ? `Most of ${joinNames(approvers)} approve`
          : `${joinNames(approvers)} approve`;
  const over = threshold ? `over ${formatNaira(threshold)}` : 'every payment';
  return `${who} ${over}.${lockUntilGoal ? ' Locked until reached.' : ''}`;
}

/** "₦850,000 by 8 Jan 2027" / "₦850,000". */
export function targetLabel(target: number, targetDate: string | null): string {
  return targetDate ? `${formatNaira(target)} by ${formatYmd(targetDate)}` : formatNaira(target);
}
