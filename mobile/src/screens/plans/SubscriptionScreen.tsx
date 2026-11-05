import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard, PtIconTile, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useCancelSubscription, usePlans, useUpdateSubscription } from '../../api/plans';
import { formatNaira } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string | null, year = true) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
};

/**
 * PLN-03 Subscription: "Patriai Pro · Trial — Free until 24 Nov 2026, then
 * ₦… a year", the wallet it's paid from, who it covers, where receipts go;
 * switch monthly or yearly, cancel (keeping it until the end) or keep it.
 */
export function SubscriptionScreen({ navigation }: RootScreenProps<'Subscription'>) {
  const q = usePlans();
  const update = useUpdateSubscription();
  const cancel = useCancelSubscription();
  const resume = useCancelSubscription(true);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const d = q.data;
  const s = d?.subscription;

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!d) return <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />;
  if (!s) {
    return (
      <PtPageScreen title="Subscription" onBack={() => navigation.goBack()} footer={<PtButton title="See plans" onPress={() => navigation.replace('Plans')} />}>
        <PtNote tone="info">{"Your family is on Free. Everything you use today stays free."}</PtNote>
      </PtPageScreen>
    );
  }

  const name = `Patriai ${s.plan.name}`;
  const per = (i: string) => (i === 'yearly' ? 'a year' : 'a month');
  const end = s.status === 'trialing' ? s.trial_ends_at : s.current_period_end;
  const other = (s.next_interval ?? s.interval) === 'yearly' ? 'monthly' : 'yearly';
  const chip =
    s.status === 'past_due' ? <PtChip label="Payment failed" tone="danger" icon="alert-triangle" />
    : s.cancel_at_period_end ? <PtChip label="Ending" tone="warning" icon="clock" />
    : s.status === 'trialing' ? <PtChip label="Trial" tone="success" icon="check" />
    : <PtChip label="Active" tone="success" icon="check" />;
  const line =
    s.cancel_at_period_end ? `Yours until ${day(end)}, then back to Free`
    : s.status === 'trialing' ? `Free until ${day(end)}, then ${formatNaira(s.next_price)} ${per(s.next_interval ?? s.interval)}`
    : s.status === 'past_due' ? (s.failure ?? 'The last payment didn’t go through.')
    : `${formatNaira(s.price)} ${per(s.interval)} · next payment ${day(end)}`;

  const run = (p: Promise<unknown>, done: string) =>
    p.then(() => showAlert(done, '')).catch((e: Error) => showAlert('Could not change it', e.message));

  return (
    <PtPageScreen title="Subscription" subtitle={`${s.plan.name} · ${s.interval}`} onBack={() => navigation.goBack()}>
      <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 18, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: '#FFFFFF' }}>{name}</Text>
          {chip}
        </View>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: pt.onDarkMuted }}>{line}</Text>
      </View>

      {!s.mine ? (
        <PtNote tone="info">{`${s.payer} pays for ${s.family.name ? `the ${s.family.name}` : 'your family'}. Only they can change it.`}</PtNote>
      ) : (
        <>
          <PtPanel>
            <PtReviewRow label="Paid from" value={s.pay_wallet?.name ?? 'Main wallet'} sub={s.pay_wallet ? `${formatNaira(s.pay_wallet.balance)} there now` : null} onEdit={() => setPicking(true)} />
            <PtReviewRow label="Members covered" value={`${s.family.count} in ${s.family.name ?? 'your family'}`} />
            <PtReviewRow label="Receipts" value={s.receipts_to ? `Sent to ${s.receipts_to}` : 'In your notifications'} last />
          </PtPanel>
          {s.status === 'past_due' ? <PtNote tone="attention">Add money to the wallet, or choose another one. We’ll try again tomorrow; after 3 days your family goes back to Free.</PtNote> : null}

          <PtCard>
            {s.next_interval ? (
              <PtRow
                title={`Stay on ${s.interval}`}
                subtitle={`Switching to ${s.next_interval} at the next payment`}
                left={<PtIconTile><Feather name="rotate-ccw" size={18} color={pt.brand} /></PtIconTile>}
                chevron
                onPress={() => void run(update.mutateAsync({ interval: s.interval }), `Staying on ${s.interval}`)}
              />
            ) : (
              <PtRow
                title={`Switch to ${other}`}
                subtitle={`${formatNaira(other === 'yearly' ? s.plan.yearly_price : s.plan.monthly_price)} ${per(other)}${s.status === 'trialing' ? '' : ', from the next payment'}`}
                left={<PtIconTile><Feather name="calendar" size={18} color={pt.brand} /></PtIconTile>}
                chevron
                onPress={() => void run(update.mutateAsync({ interval: other }), `Switched to ${other}`)}
              />
            )}
            {s.cancel_at_period_end ? (
              <PtRow
                title={`Keep ${s.plan.name}`}
                subtitle={`Carry on after ${day(end, false)}`}
                left={<PtIconTile><Feather name="check" size={18} color={pt.brand} /></PtIconTile>}
                chevron
                last
                onPress={() => void run(resume.mutateAsync(), `You're keeping ${s.plan.name}`)}
              />
            ) : (
              <PtRow
                title={`Cancel ${s.plan.name}`}
                subtitle={`Keep ${s.plan.name} until ${day(end, false)}, then go back to Free`}
                subtitleColor={pt.inkMuted}
                left={
                  <View style={{ width: 40, height: 40, borderRadius: ptRadius.sm, backgroundColor: pt.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="x" size={18} color={pt.danger} />
                  </View>
                }
                chevron
                last
                onPress={() => setConfirm(true)}
              />
            )}
          </PtCard>

          {s.payments.length ? (
            <View style={{ gap: 8 }}>
              <PtSectionTitle title="Payments" />
              <PtCard>
                {s.payments.map((p, i) => (
                  <PtRow
                    key={p.reference}
                    title={`${formatNaira(p.amount)} · ${p.interval}`}
                    subtitle={p.status === 'paid' ? `${day(p.at)} · ${p.reference}` : `${day(p.at)} · ${p.failure ?? 'Didn’t go through'}`}
                    subtitleColor={p.status === 'paid' ? pt.inkMuted : pt.danger}
                    right={<PtChip label={p.status === 'paid' ? 'Paid' : 'Failed'} tone={p.status === 'paid' ? 'success' : 'danger'} />}
                    last={i === s.payments.length - 1}
                  />
                ))}
              </PtCard>
            </View>
          ) : null}
        </>
      )}

      <PtOptionSheet
        visible={picking}
        title="Pay from which wallet?"
        options={d.wallets.map((w) => ({ value: w.id, label: w.name, hint: `${formatNaira(w.balance)} available` }))}
        value={s.pay_wallet?.id ?? null}
        onPick={(id) => {
          setPicking(false);
          void run(update.mutateAsync({ wallet_id: id }), 'Wallet changed');
        }}
        onClose={() => setPicking(false)}
      />
      <PtSheet
        visible={confirm}
        title={`Cancel ${s.plan.name}?`}
        subtitle={`Your family keeps ${s.plan.name} until ${day(end)}. Then you're back on Free, with nothing more to pay. Everything you made stays.`}
        onClose={() => setConfirm(false)}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton
              title={`Cancel ${s.plan.name}`}
              variant="danger"
              loading={cancel.isPending}
              onPress={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => setConfirm(false),
                  onError: (e) => showAlert('Could not cancel', e.message),
                })
              }
            />
            <PtButton title={`Keep ${s.plan.name}`} variant="ghost" onPress={() => setConfirm(false)} />
          </View>
        }
      >
        <View />
      </PtSheet>
    </PtPageScreen>
  );
}
