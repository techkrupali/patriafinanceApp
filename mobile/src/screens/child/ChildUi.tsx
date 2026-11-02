import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtChip } from '../../components/pt/PtChip';
import type { ChildGoal, ChildRequest } from '../../api/child';

/** CHD-04 "What is it for?" */
export const ASK_FOR = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'school', label: 'School' },
  { value: 'gift', label: 'A gift' },
  { value: 'fun', label: 'Fun' },
  { value: 'other', label: 'Other' },
];

/** "Mum or Dad" — or the parents' names when there are no titles to go by. */
export function parentsLine(parents: string[]): string {
  return parents.length ? parents.join(' or ') : 'A parent';
}

/** CHD-05 Waiting · Yes · No */
export function RequestChip({ r }: { r: ChildRequest }) {
  if (r.status === 'pending') return <PtChip label="Waiting" tone="warning" icon="clock" />;
  if (r.status === 'yes') return <PtChip label="Yes" tone="success" icon="check" />;
  if (r.status === 'no') return <PtChip label="No" tone="danger" icon="x" />;
  return <PtChip label="Closed" tone="neutral" />;
}

/** "Mum adds ₦1 for every ₦2" from a 50% match. */
export function matchLine(goal: ChildGoal, parents: string[]): string | null {
  if (!goal.match_percent) return null;
  const who = parents[0] ?? 'A parent';
  if (goal.match_percent === 100) return `${who} adds ₦1 for every ₦1`;
  if (goal.match_percent === 50) return `${who} adds ₦1 for every ₦2`;
  if (goal.match_percent === 25) return `${who} adds ₦1 for every ₦4`;
  return `${who} adds ${goal.match_percent}% of what you save`;
}

export function Card({ children, tone = 'white' }: { children: React.ReactNode; tone?: 'white' | 'gold' | 'mint' }) {
  const bg = tone === 'gold' ? pt.gold100 : tone === 'mint' ? pt.brandSoft : pt.raised;
  return <View style={{ backgroundColor: bg, borderRadius: ptRadius.md, padding: 16 }}>{children}</View>;
}

export function Big({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1, color: '#FFFFFF' }}>{children}</Text>;
}
