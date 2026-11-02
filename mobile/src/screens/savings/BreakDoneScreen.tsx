import React from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useDonationReceiptLink, useEarlyBreak } from '../../api/savingsBreak';
import { formatAmount, formatNaira } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "3:14 pm" */
const time = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
};

/** BRK-05 Done: what landed in Main, what's left, and the charity's half with its receipt. */
export function BreakDoneScreen({ navigation, route }: RootScreenProps<'BreakDone'>) {
  const q = useEarlyBreak(route.params.reference);
  const receipt = useDonationReceiptLink();
  const b = q.data;

  return (
    <PtStepScreen
      footer={
        <View style={{ gap: 4 }}>
          <PtButton title="Done" onPress={() => navigation.popToTop()} />
          {b?.charity ? (
            <PtButton
              title="Download donation receipt"
              variant="ghost"
              loading={receipt.isPending}
              onPress={() => b.charity && receipt.mutate(b.charity.donation_id, { onSuccess: (d) => void Linking.openURL(d.url), onError: (e) => showAlert('Not ready', e.message) })}
            />
          ) : null}
        </View>
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />
      ) : !b ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check" size={28} color={pt.brand} />
            </View>
            <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">{`${formatNaira(b.received)} is in ${(b.to ?? 'Main').replace(/ wallet$/, '')}`}</PtText>
            <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
              {`${b.approved_by ? `${b.approved_by.name} approved at ${time(b.approved_by.at)}. ` : ''}${b.wallet.name} has ${formatNaira(b.wallet.balance)} left.`}
            </PtText>
          </View>
          {b.charity ? (
            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 14 }}>
              <Feather name="heart" size={20} color={pt.brand} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{`${formatNaira(b.charity.amount)} went to ${b.charity.name}`}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`Receipt ${b.charity.receipt_no} · counts in your giving statement`}</Text>
              </View>
            </View>
          ) : null}
          <PtPanel>
            <PtReviewRow label="Taken out" value={formatNaira(b.taken_out)} />
            <PtReviewRow label="Fee" value={formatAmount(b.fee)} sub={b.charity ? 'Half to charity, half Patriai fee' : 'Patriai fee'} />
            <PtReviewRow label="Reference" value={b.reference} last />
          </PtPanel>
        </>
      )}
    </PtStepScreen>
  );
}
