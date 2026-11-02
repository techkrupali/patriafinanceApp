import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtChip } from '../pt/PtChip';
import { useEmergencyActions } from '../../api/hooks';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { EmergencyDetail, EmergencyRequest } from '../../api/types';

const first = (name: string | null | undefined) => (name ?? '').split(' ')[0];

/** "5:45 pm", with "Today," / "Tomorrow," in front when asked. */
export function clock(at: string | Date | null | undefined, withDay = false): string | null {
  if (!at) return null;
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?$/i, ' $1m');
  if (!withDay) return time;
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

/** "2 of 3 to release" — or who opens it when there are no other keyholders. */
export function releaseLine(e: EmergencyDetail): string {
  const n = (e.rules.keyholders?.length ?? 0) + 1;
  const need = e.rules.required_keyholders ?? 0;
  return need > 0 && n > 1 ? `${need} of ${n} to release` : 'Only you release it';
}

/** WAL-16 "Ngozi, Emeka, Aunty Ada": the owner first, then the other keyholders. */
export function keyholderNames(e: EmergencyDetail, ownerName: string | null | undefined): string {
  return [first(ownerName), ...(e.rules.keyholders ?? []).map((k) => first(k.name))].filter(Boolean).join(', ');
}

/** "Ngozi asks for ₦85,000" — a release (or new release rules) waiting for the keyholders, with Yes / No. */
export function ReleaseRequestCard({ walletId, r, myId }: { walletId: number; r: EmergencyRequest; myId?: number }) {
  const { decide } = useEmergencyActions(walletId);
  const who = r.trusted_contact ? `${r.trusted_contact.name}${r.trusted_contact.relation ? ` (${r.trusted_contact.relation})` : ''}` : r.requested_by?.id === myId ? 'You' : first(r.requested_by?.name) || 'Someone';
  const rules = r.method === 'rule_change';
  const ask = rules
    ? `${who} ${who === 'You' ? 'want' : 'wants'} new release rules`
    : r.amount
      ? `${who} ${who === 'You' ? 'ask' : 'asks'} for ${formatNaira(r.amount)}`
      : `${who} ${who === 'You' ? 'asked' : 'asks'} to release the fund`;
  const to = r.payee?.account_name ? `Pay to ${r.payee.account_name}` : r.amount ? `To ${r.requested_by?.id === myId ? 'your' : `${first(r.requested_by?.name)}'s`} Main wallet` : null;
  const expires = clock(r.expires_at, true);
  const run = (action: 'approve' | 'reject' | 'cancel') =>
    decide.mutate(
      { requestId: r.id, action },
      {
        onSuccess: (d) => {
          notifySuccess();
          const done = d.emergency.requests.find((x) => x.id === r.id);
          if (action === 'approve') {
            showAlert(
              done?.status === 'released' ? 'Released' : done?.status === 'pending' ? 'Your yes is counted' : done?.status === 'rejected' ? (rules ? 'Not changed' : 'Not paid') : rules ? 'New rules applied' : 'Approved',
              rules && done?.status === 'approved'
                ? 'The fund now follows the new release rules.'
                : done?.status === 'released'
                ? `${formatNaira(r.amount)} is on its way${r.payee?.account_name ? ` to ${r.payee.account_name}` : ''}.`
                : done?.status === 'pending'
                  ? `${(done.required_approvals ?? 2) - (done.approvals ?? 0)} more yes needed.`
                  : done?.review_note ?? 'The fund is open.',
            );
          }
        },
        onError: (e) => showAlert('Not done', e.message),
      },
    );

  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{rules ? 'Rule change' : 'Release request'}</Text>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 23, color: pt.ink }}>{ask}</Text>
        </View>
        <PtChip label={`${r.approvals ?? 0} of ${r.required_approvals ?? 2} yes`} tone="warning" icon="clock" />
      </View>
      {r.note ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: pt.ink }}>{r.note}</Text> : null}
      {rules && r.changes?.length ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{r.changes.map((c) => `• ${c}`).join('\n')}</Text> : null}
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
        {[to, r.has_document ? 'Proof attached' : null, expires ? `Expires ${expires.replace(/^Today, /, '')}` : null].filter(Boolean).join(' · ')}
      </Text>
      {r.can_approve ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PtButton title="Say no" variant="secondary" size="sm" style={{ flex: 1 }} loading={decide.isPending && decide.variables?.action === 'reject'} onPress={() => run('reject')} />
          <PtButton title="Say yes" size="sm" style={{ flex: 1 }} loading={decide.isPending && decide.variables?.action === 'approve'} onPress={() => run('approve')} />
        </View>
      ) : r.can_cancel ? (
        <PtButton title={rules ? 'Withdraw the change' : 'Cancel request'} variant="ghost" size="sm" loading={decide.isPending} onPress={() => run('cancel')} />
      ) : null}
    </View>
  );
}
