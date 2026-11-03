import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useCancelNextScheduled, useSendScheduledNow, useShortfall } from '../../api/scheduled';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * RUL-07 "Not enough for Sunday's payment": what goes out and when, what the
 * wallet will have, and four ways out — add money, move from another wallet,
 * pay what's there now, or cancel this one (the rule stays on).
 */
export function PaymentShortScreen({ navigation, route }: RootScreenProps<'PaymentShort'>) {
  const { paymentId } = route.params;
  const q = useShortfall(paymentId);
  const sendNow = useSendScheduledNow(paymentId);
  const cancel = useCancelNextScheduled(paymentId);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const d = q.data;

  if (!d) {
    return (
      <PtPageScreen title="Payment" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const other = d.others[0];
  const shortN = `₦${Math.round(d.short / 100).toLocaleString('en-NG')}`;

  return (
    <PtPageScreen title="" onBack={() => navigation.goBack()}>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, lineHeight: 32, color: pt.ink }} accessibilityRole="header">{d.title}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted }}>{d.body}</Text>
      <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{d.by_then}</Text>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: '#8F5400' }}>{d.short_label}</Text>
      </View>
      <PtCard>
        <PtRow left={<PtIconTile><Feather name="arrow-down" size={18} color={pt.brand} /></PtIconTile>} title={`Add ${shortN} now`} subtitle="Bank transfer" chevron onPress={() => navigation.navigate('AddMoney', { walletId: d.from_wallet_id })} />
        {other ? <PtRow left={<PtIconTile><Feather name="repeat" size={18} color={pt.brand} /></PtIconTile>} title="Move from another wallet" subtitle={`${other.name} has ${other.available}`} chevron onPress={() => navigation.navigate('MoveMoney', { fromWalletId: other.id, toWalletId: d.from_wallet_id })} /> : null}
        {d.available > 0 ? <PtRow left={<PtIconTile><Feather name="git-branch" size={18} color={pt.brand} /></PtIconTile>} title={`Pay ${d.available_label} now, rest later`} chevron onPress={() => { setPinError(null); setPinOpen(true); }} /> : null}
        <PtRow
          left={<View style={{ width: 40, height: 40, borderRadius: ptRadius.sm, backgroundColor: '#FBE3DE', alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={18} color={pt.danger} /></View>}
          title="Cancel this payment"
          subtitle="The rule stays on for next time"
          chevron
          last
          onPress={() => cancel.mutate(undefined, { onSuccess: () => { notifySuccess(); navigation.replace('PaymentOutcome', { paymentId }); }, onError: (e) => showAlert('Not cancelled', e.message) })}
        />
      </PtCard>
      {d.policy_line ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{d.policy_line}</Text> : null}
      <PinSheet
        visible={pinOpen}
        title="Enter your PIN"
        subtitle={`Pay ${d.available_label} now`}
        loading={sendNow.isPending}
        error={pinError}
        onSubmit={(pin) => sendNow.mutate({ pin, amount: String(d.available / 100) }, { onSuccess: () => { notifySuccess(); setPinOpen(false); showAlert('Sent', `${d.available_label} went out now.`); navigation.goBack(); }, onError: (e) => setPinError(e.message) })}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
