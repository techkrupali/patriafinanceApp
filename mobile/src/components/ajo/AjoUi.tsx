import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtChip } from '../pt/PtChip';
import { PtRing } from '../pt/PtRing';
import { PinSheet } from '../PinSheet';
import { ApiError } from '../../api/client';
import { useAjoActions, type AjoDetail, type AjoTone } from '../../api/ajo';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';

const ICON: Record<AjoTone, 'check' | 'clock' | 'x' | 'circle'> = { success: 'check', warning: 'clock', danger: 'x', neutral: 'circle' };

/** "Paid" · "Due today" · "Late 2 days". */
export function AjoStatusChip({ label, tone }: { label: string; tone: AjoTone }) {
  // PtChip hugs the top of its row; centre it like the prototype's "Paid".
  return (
    <View style={{ justifyContent: 'center' }}>
      <PtChip label={label} tone={tone} icon={ICON[tone]} />
    </View>
  );
}

const pct = (a: AjoDetail) => {
  const r = a.round;
  if (!r) return 0;
  const t = parseFloat(r.target) || 0;
  return t > 0 ? Math.min(100, Math.round(((parseFloat(r.collected) || 0) * 100) / t)) : 0;
};

/** "9 of 12 paid · goes to Mama Chioma on 5 Nov" */
function roundLine(a: AjoDetail, verb: 'goes to' | 'pays') {
  const r = a.round;
  if (!r) return '';
  const who = r.recipient?.you ? 'you' : r.recipient?.name ?? 'the next turn';
  return r.paid_out
    ? `${r.paid} of ${r.total} paid · ${formatNaira(r.paid_out_amount ?? r.collected)} paid to ${who} on ${r.pay_on_label}`
    : `${r.paid} of ${r.total} paid · ${verb} ${who} on ${r.pay_on_label}`;
}

/** AJO-03 "Round 1 of 12 · November · ₦450,000 of ₦600,000". */
export function AjoRoundCard({ ajo }: { ajo: AjoDetail }) {
  const r = ajo.round;
  if (!r) return null;
  return (
    <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 20, gap: 10 }}>
      <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.emerald300 }}>{`Round ${r.number} of ${r.of} · ${r.label}`}</Text>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 30, color: '#FFFFFF' }}>
        {formatNaira(r.collected)}
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>{`  of ${formatNaira(r.target)}`}</Text>
      </Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
        <View style={{ width: `${pct(ajo)}%`, height: 8, backgroundColor: pt.gold500 }} />
      </View>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)' }}>{roundLine(ajo, 'goes to')}</Text>
    </View>
  );
}

/** WPV-06 "This round ₦450,000 · 9 of 12 paid · pays Mama Chioma on 5 Nov", with a ring. */
export function AjoOrganiserCard({ ajo }: { ajo: AjoDetail }) {
  const r = ajo.round;
  if (!r) return null;
  return (
    <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <PtRing percent={pct(ajo)} size={84} stroke={8} track="rgba(255,255,255,0.85)" labelColor="#FFFFFF" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.emerald300 }}>This round</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 28, color: '#FFFFFF' }}>{formatNaira(r.collected)}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.85)' }}>{roundLine(ajo, 'pays')}</Text>
      </View>
    </View>
  );
}

/** AJO-03 "5th · Your turn is March 2027. You'll receive ₦600,000." */
export function AjoTurnCard({ ajo }: { ajo: AjoDetail }) {
  const me = ajo.me;
  if (!me?.position) return null;
  const text = me.received
    ? ['You had your turn in ', me.turn_label ?? '', `. You received ${formatNaira(me.received_amount)}.`]
    : me.status === 'lost_turn'
      ? ['You missed 3 rounds, so your turn moved to ', me.turn_label ?? '', '.']
      : ['Your turn is ', me.turn_label ?? '', `. You'll receive ${formatNaira(me.receives)}.`];
  return (
    <View style={{ backgroundColor: me.status === 'lost_turn' ? '#FDEBC8' : pt.brandSoft, borderRadius: ptRadius.md, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, color: pt.brand }}>{me.ordinal}</Text>
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.ink }}>
        {text[0]}
        <Text style={{ fontFamily: ptFont.bold }}>{text[1]}</Text>
        {text[2]}
      </Text>
    </View>
  );
}

/**
 * "Pay this round" / "Pay ₦52,000 now": the PIN, then the payment from Main.
 * Returns an opener; render `sheet` once.
 */
export function useAjoPay(ajo: AjoDetail | undefined, onPaid?: () => void) {
  const actions = useAjoActions(ajo?.wallet_id ?? 0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = ajo?.me?.due;
  const sheet = (
    <PinSheet
      visible={open && Boolean(due)}
      title="Enter your PIN"
      subtitle={due ? `${due.month} for ${ajo?.name}${parseFloat(due.fee) > 0 ? ', with the late fee' : ''} · from ${ajo?.me?.pay_from ?? 'Main'}` : undefined}
      amount={due ? formatMoney(due.total) : undefined}
      recipient={ajo?.name}
      loading={actions.pay.isPending}
      error={error}
      onSubmit={(pin) => {
        if (!due) return;
        setError(null);
        actions.pay.mutate(
          { pin, contribution_id: due.contribution_id },
          {
            onSuccess: (res) => {
              notifySuccess();
              setOpen(false);
              showAlert('Paid', `${formatNaira(res.paid.amount)} is in the pot for round ${res.paid.round}.`);
              onPaid?.();
            },
            onError: (e) => {
              const err = e as ApiError;
              if (err.errors?.pin) setError(err.errors.pin[0]);
              else {
                setOpen(false);
                showAlert('Not paid', err.message);
              }
            },
          },
        );
      }}
      onClose={() => setOpen(false)}
    />
  );
  return { open: () => { setError(null); setOpen(true); }, sheet, due };
}
