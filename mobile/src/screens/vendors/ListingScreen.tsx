import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useAnswerListing, useListing } from '../../api/proposals';
import { useStartDirect } from '../../api/chats';
import { api } from '../../api/client';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { shortNaira } from '../../components/project/ProjectRoleViews';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * VLS-02 Public project listing: a finished project by the builder — paid via
 * Patriai, milestones, months, cost range, where, what the family said — "Ask
 * for a quote" or "Message them". The family who owns it agrees here first.
 */
export function ListingScreen({ navigation, route }: RootScreenProps<'Listing'>) {
  const { listingId } = route.params;
  const q = useListing(listingId);
  const answer = useAnswerListing(listingId);
  const direct = useStartDirect();
  const l = q.data;

  if (!l) {
    return (
      <PtPageScreen title="Project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const business = l.business ?? 'the builder';
  const chat = (hello?: string) =>
    direct.mutate(l.vendor_user_id ?? 0, {
      onSuccess: async (r) => {
        if (hello) await api(`/chats/${r.chat.id}/messages`, { method: 'POST', body: { body: hello } }).catch(() => undefined);
        navigation.navigate('Conversation', { conversationId: r.chat.id });
      },
      onError: (e) => showAlert('Chat not opened', (e as Error).message),
    });

  return (
    <PtPageScreen
      title={l.title}
      subtitle={`By ${business}`}
      onBack={() => navigation.goBack()}
      footer={
        l.can_answer ? (
          <>
            <PtButton title="Agree and publish" loading={answer.isPending} onPress={() => answer.mutate(true, { onSuccess: () => { notifySuccess(); showAlert('Published', `It's on ${business}'s profile now.`); } })} />
            <PtButton title="Keep it private" variant="ghost" onPress={() => answer.mutate(false, { onSuccess: () => navigation.goBack() })} />
          </>
        ) : !l.mine ? (
          <>
            <PtButton title={`Ask ${business} for a quote`} loading={direct.isPending} onPress={() => chat(`Hello, I'd like a quote for a project like "${l.title}". Can you send a proposal with phases?`)} />
            <PtButton title="Message them" variant="ghost" onPress={() => chat()} />
          </>
        ) : null
      }
    >
      {l.can_answer ? <PtNote tone="info">{`${business} would like to show your project on their profile — the photos and a cost range, no exact prices.`}</PtNote> : null}
      {l.mine && l.status !== 'published' ? <PtNote tone="attention">{l.status === 'asking' ? 'Waiting for the family to agree before it goes on your profile.' : 'The family kept this one private.'}</PtNote> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {l.photos.map((p) => (
          <View key={p.url} style={{ width: 240, height: 180, borderRadius: ptRadius.md, overflow: 'hidden', backgroundColor: pt.sunken }}>
            <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={p.caption ?? 'Photo'} />
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <PtChip label="Paid via Patriai" tone="success" icon="check" />
        {l.milestones ? <PtChip label={`${l.milestones} milestones`} tone="neutral" icon="circle" /> : null}
        {l.months ? <PtChip label={`${l.months} month${l.months === 1 ? '' : 's'}`} tone="neutral" icon="clock" /> : null}
      </View>
      <PtPanel>
        <PtReviewRow label="Cost range" value={l.cost_min && l.cost_max ? `${shortNaira(l.cost_min)} to ${shortNaira(l.cost_max)}` : l.cost_min ? `From ${shortNaira(l.cost_min)}` : 'Ask the builder'} />
        <PtReviewRow label="Where" value={l.location ?? '—'} last={!l.review} />
        {l.review ? <PtReviewRow label="Family said" value={`"${l.review.body}"`} sub={`${l.review.by} · ${'★'.repeat(l.review.rating)}`} last /> : null}
      </PtPanel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="shield" size={14} color={pt.inkMuted} />
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Every phase was paid through Patriai after the family approved its proof.</Text>
      </View>
    </PtPageScreen>
  );
}
