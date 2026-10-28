import { formatNaira } from './format';
import { ordinal } from './goalPlan';
import type { JointSplit, JointSummary } from '../api/types';

/** JNT-05 choices, in the prototype's words. */
export const JOINT_SPLITS: { value: JointSplit; title: string; subtitle: string; short: string }[] = [
  { value: 'contributed', title: 'Split by what each person put in', subtitle: 'If you put in 60%, you get 60%.', short: 'Split by what each put in' },
  { value: 'equal', title: 'Split equally', subtitle: 'Half each, whoever put in more.', short: 'Split equally' },
  { value: 'decide', title: 'Decide together at the time', subtitle: 'Money stays locked until you both agree.', short: 'Decide together at the time' },
];

export const splitShort = (split: JointSplit) => JOINT_SPLITS.find((s) => s.value === split)?.short ?? '';

/** "₦150,000 each, every 26th" or "₦200,000 and ₦100,000, every 26th". */
export function contributionLine(mine: string | number, partner: string | number, day: number): string {
  const a = Number(mine) || 0;
  const b = Number(partner) || 0;
  const amounts = a === b ? `${formatNaira(a)} each` : `${formatNaira(a)} and ${formatNaira(b)}`;
  return `${amounts}, every ${ordinal(day)}`;
}

/**
 * INV-O1 "Review rules": what the partner accepts, line by line. `mine` is the
 * viewer's own amount (the invitee pays the partner share).
 */
export function jointTerms(j: JointSummary, viewerIsPartner: boolean): { label: string; value: string; sub?: string }[] {
  const yours = viewerIsPartner ? j.contribution.partner : j.contribution.mine;
  const theirs = viewerIsPartner ? j.contribution.mine : j.contribution.partner;
  const both = [
    j.always.new_account ? 'new accounts' : null,
    j.always.personal ? 'moving money out' : null,
    j.always.rules ? 'rule changes' : null,
  ].filter(Boolean) as string[];
  return [
    {
      label: Number(yours) === Number(theirs) ? 'Each of you pays' : 'You pay',
      value: `${formatNaira(yours)} every ${ordinal(j.contribution.day)}`,
      sub: Number(yours) === Number(theirs) ? undefined : `Your partner pays ${formatNaira(theirs)}`,
    },
    { label: 'Spend alone', value: `Up to ${formatNaira(j.limits.per_payment)} a payment`, sub: `${formatNaira(j.limits.per_day)} a day each` },
    ...(both.length ? [{ label: 'Always both', value: both.join(', ').replace(/^./, (c) => c.toUpperCase()) }] : []),
    { label: 'Notifications', value: 'Every payment, both of you' },
    { label: 'If one leaves', value: `${splitShort(j.leave.split)} · ${j.leave.notice_days} days' notice` },
  ];
}
