import React from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { pt, ptFont } from '../../theme';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { useCardPayment } from '../../api/funding';
import { formatMoney, formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-08 Money added (amount, fee, new balance, reference) or ADD-09 "Card
 * payment didn't go through" (the bank's reason, nothing charged). Back from
 * the partner's page it waits for the bank, asking every few seconds.
 */
export function CardResultScreen({ navigation, route }: RootScreenProps<'CardResult'>) {
  const { reference, walletId } = route.params;
  const insets = useSafeAreaInsets();
  const q = useCardPayment(reference, true);
  const p = q.data;
  // ADD-08 "Done" goes home, as the prototype does.
  const done = () => navigation.popToTop();

  const icon = (name: 'check' | 'x' | 'clock', bg: string, fg: string) => (
    <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name={name} size={40} color={fg} />
    </View>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!p) {
    body = q.error ? <PtText color={pt.danger}>{(q.error as Error).message}</PtText> : <ActivityIndicator color={pt.brand} />;
  } else if (p.status === 'success') {
    body = (
      <>
        <View style={{ alignItems: 'center', gap: 12 }}>
          {icon('check', pt.brandSoft, pt.brand)}
          <PtText variant="headline" style={{ textAlign: 'center' }}>Money added</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>{`${formatNaira(p.amount)} is in your ${p.wallet.name}.`}</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Amount" value={formatMoney(p.amount)} />
          <PtReviewRow label="Fee" value={`${formatNaira(p.fee)} · card`} sub={p.card} />
          <PtReviewRow label="New balance" value={formatMoney(p.wallet.balance)} />
          <PtReviewRow label="Reference" value={p.reference} last />
        </PtPanel>
      </>
    );
    footer = <PtButton title="Done" onPress={done} />;
  } else if (p.status === 'failed') {
    body = (
      <>
        <View style={{ alignItems: 'center', gap: 12 }}>
          {icon('x', pt.dangerSoft, pt.danger)}
          <PtText variant="headline" style={{ textAlign: 'center' }}>{"Card payment didn't go through"}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>Your bank declined it. You have not been charged.</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Reason" value={p.message ?? 'Declined'} sub="From your bank" />
          <PtReviewRow label="Amount" value={formatNaira(p.total)} last />
        </PtPanel>
      </>
    );
    footer = (
      <>
        <PtButton title="Use bank transfer instead" onPress={() => navigation.replace('BankTransfer', { walletId: p.wallet.id })} />
        <PtButton title="Try another card" variant="ghost" onPress={() => navigation.replace('CardPay', { walletId: p.wallet.id, amount: String(parseFloat(p.amount)) })} />
      </>
    );
  } else if (p.status === 'otp') {
    body = <ActivityIndicator color={pt.brand} />;
    footer = <PtButton title="Enter the bank's code" onPress={() => navigation.replace('CardOtp', { reference })} />;
  } else {
    // Still at the partner's page, or the bank hasn't answered yet.
    body = (
      <>
        <View style={{ alignItems: 'center', gap: 12 }}>
          {icon('clock', pt.gold100, '#8F5400')}
          <PtText variant="headline" style={{ textAlign: 'center' }}>Waiting for your bank</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
            {`Finish paying ${formatNaira(p.total)} on the card page. This screen updates by itself.`}
          </PtText>
          <ActivityIndicator color={pt.brand} />
        </View>
        <PtNote tone="info">Nothing is taken until your bank says yes. If you closed the card page, open it again.</PtNote>
      </>
    );
    footer = (
      <>
        {p.checkout_url ? (
          <PtButton
            title="Open the card page"
            onPress={() => {
              if (Platform.OS === 'web') window.open(p.checkout_url!, '_blank');
              else void WebBrowser.openAuthSessionAsync(p.checkout_url!, 'patriai://fund/card').then(() => q.refetch());
            }}
          />
        ) : null}
        <PtButton title="Check again" variant="ghost" onPress={() => void q.refetch()} loading={q.isFetching} />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 48, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}>{body}</ScrollView>
      {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>{footer}</View> : null}
    </View>
  );
}
