import React, { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useAnswerOffer, useDispute, useDisputeMessage } from '../../api/projectFlow';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { ChatBubble, ChatComposer } from '../projects/ProjectChatScreen';
import { formatNaira } from '../../lib/format';
import { clockTime, dayMonth } from '../../lib/projects';
import type { DisputeMessage } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "re-lay the kitchen by Wed 28 Oct" / "a ₦300,000 refund". */
function offerText(m: DisputeMessage): string {
  const o = m.offer!;
  if (o.type === 'fix') {
    const d = o.fix_by ? new Date(`${o.fix_by}T12:00:00`) : null;
    return `fix it by ${d ? `${WEEKDAYS[d.getDay()]} ${dayMonth(o.fix_by)}` : 'the date agreed'}`;
  }
  if (o.type === 'partial_refund') return `a ${formatNaira(o.amount)} refund, the rest paid`;
  return 'disagrees';
}

/** DSP-06 Conversation: recorded messages, the builder's offer with Accept / Not yet, and Patriai's notes. */
export function DisputeChatScreen({ navigation, route }: RootScreenProps<'DisputeChat'>) {
  const { disputeId } = route.params;
  const insets = useSafeAreaInsets();
  const query = useDispute(disputeId);
  const send = useDisputeMessage(disputeId);
  const answer = useAnswerOffer(disputeId);
  const scroll = useRef<ScrollView>(null);
  const d = query.data;

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [d?.messages.length]);

  const other = d ? (d.viewer === 'vendor' ? d.raised_by?.name ?? 'The family' : d.against?.name ?? 'Patriai') : 'Dispute';

  const respond = (offerId: number, accept: boolean) => {
    answer.mutate(
      { offerId, accept },
      {
        // Accepted: the detail shows "Being fixed", or the outcome once a refund is paid.
        onSuccess: () => {
          if (accept) navigation.replace('DisputeDetail', { disputeId });
        },
        onError: (e) => showAlert('Could not answer', (e as Error).message),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: pt.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: pt.ink }} numberOfLines={1}>{other}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{d?.number ? `Dispute #${d.number} · recorded` : 'Recorded'}</Text>
        </View>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {!d ? (
          <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
        ) : (
          d.messages.map((m) => {
            if (m.kind === 'system') {
              return (
                <Text key={m.id} style={{ alignSelf: 'center', fontFamily: ptFont.medium, fontSize: 12, color: pt.inkSubtle, textAlign: 'center' }}>
                  {m.mine && m.body?.startsWith(`${m.name} `) ? `You ${m.body.slice(m.name.length + 1)}` : m.body} · {clockTime(m.created_at)}
                </Text>
              );
            }
            if (m.kind === 'decision') {
              return (
                <View key={m.id} style={{ backgroundColor: pt.infoSoft, borderRadius: ptRadius.md, padding: 14, gap: 4 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.ink }}>Patriai's decision</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.ink }}>{m.body}</Text>
                </View>
              );
            }
            const time = clockTime(m.created_at);
            const name = m.from === 'patriai' ? 'Patriai' : m.name;
            return (
              <View key={m.id} style={{ gap: 10 }}>
                {m.body ? <ChatBubble mine={m.mine} name={name} time={time} body={m.body} /> : null}
                {m.kind === 'offer' && m.offer ? (
                  <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 14, gap: 10, opacity: m.offer.status === 'open' ? 1 : 0.7 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.ink }}>
                      {m.mine ? 'You offered' : `${m.name} offered`}: {offerText(m)}
                      {m.offer.status !== 'open' ? ` · ${m.offer.status === 'accepted' ? 'accepted' : m.offer.status === 'declined' ? 'not yet' : m.offer.status === 'replaced' ? 'replaced' : 'closed'}` : ''}
                    </Text>
                    {d.can.answer_offer && d.open_offer_id === m.id ? (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <PtButton title="Not yet" variant="secondary" size="sm" style={{ flex: 1, backgroundColor: pt.raised }} onPress={() => respond(m.id, false)} disabled={answer.isPending} />
                        <PtButton title="Accept offer" size="sm" style={{ flex: 1 }} onPress={() => respond(m.id, true)} loading={answer.isPending} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
      {d?.can.message ? (
        <ChatComposer sending={send.isPending} onSend={(t) => send.mutate(t, { onError: (e) => showAlert('Not sent', (e as Error).message) })} />
      ) : null}
    </KeyboardAvoidingView>
  );
}
