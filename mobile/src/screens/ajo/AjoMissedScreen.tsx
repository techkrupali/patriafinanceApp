import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAjoPay } from '../../components/ajo/AjoUi';
import { useAjo } from '../../api/ajo';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/**
 * AJO-04 "Missed contribution": "December's ₦50,000 is 3 days late · Main
 * didn't have enough on 1 Dec. Funke is waiting on her payout." The late fee
 * goes to this round's pot; "Miss 3 rounds and you lose your turn."
 */
export function AjoMissedScreen({ navigation, route }: RootScreenProps<'AjoMissed'>) {
  const { walletId } = route.params;
  const q = useAjo(walletId);
  const a = q.data;
  const pay = useAjoPay(a, () => navigation.goBack());
  const due = a?.me?.due;

  if (!a) {
    return (
      <PtPageScreen title="Missed contribution" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  if (!due) {
    return (
      <PtPageScreen title="Missed contribution" subtitle={a.name} onBack={() => navigation.goBack()} footer={<PtButton title="Back to the circle" onPress={() => navigation.replace('Ajo', { walletId })} />}>
        <PtNote tone="success">You're all paid up.</PtNote>
      </PtPageScreen>
    );
  }

  const fee = parseFloat(due.fee) > 0;
  const days = due.days_late;
  const title = days > 0 ? `${due.month}'s ${formatNaira(due.amount)} is ${days} day${days === 1 ? '' : 's'} late` : `${due.month}'s ${formatNaira(due.amount)} is due today`;
  const waiting = due.waiting ? ` ${due.waiting} is waiting on their payout.` : '';
  const why = a.me?.auto_pay ? `${a.me.pay_from.replace(/\s+wallet$/i, '')} didn't have enough on ${due.due_label}.${waiting}` : `It was due on ${due.due_label}, and you pay this circle yourself.${waiting}`;
  const missed = a.me?.missed ?? 0;

  return (
    <PtPageScreen
      title="Missed contribution"
      subtitle={a.name}
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title={`Pay ${formatNaira(due.total)} now`} onPress={pay.open} />
          <PtButton title="Message the circle" variant="ghost" onPress={() => (a.conversation_id ? navigation.navigate('Conversation', { conversationId: a.conversation_id }) : undefined)} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FDEBC8', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="clock" size={32} color="#8F5400" />
        </View>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, lineHeight: 32, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">{title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted, textAlign: 'center' }}>{why}</Text>
      </View>
      <PtPanel>
        <PtReviewRow label="Contribution" value={formatNaira(due.amount)} />
        <PtReviewRow
          label="Late fee"
          value={fee ? formatNaira(due.fee) : parseFloat(due.late_fee) > 0 ? `${formatNaira(due.late_fee)} from ${due.fee_from}` : 'None'}
          sub="Goes to this round's pot"
        />
        <PtReviewRow label="Pay now" value={formatNaira(due.total)} last />
      </PtPanel>
      <PtNote tone="attention">{`Miss 3 rounds and you lose your turn. You have missed ${missed}.`}</PtNote>
      {pay.sheet}
    </PtPageScreen>
  );
}
