import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { useDispute, useDisputeFile } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { DoneHero, LoadingBlock, PhotoGrid, Timeline, type TimelineState } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { dayMonth, dayTime, deadlineDay } from '../../lib/projects';
import { pickFile } from '../../lib/upload';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { DisputeDetail } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Nav = RootScreenProps<'DisputeDetail'>['navigation'];

/** What the builder's latest offer or reply said, for the timeline. */
function lastReply(d: DisputeDetail): { text: string; at: string | null } | null {
  const fromVendor = [...d.messages].reverse().find((m) => m.from === 'vendor' && (m.kind === 'offer' || m.kind === 'message'));
  if (!fromVendor) return null;
  if (fromVendor.kind === 'offer' && fromVendor.offer) {
    const o = fromVendor.offer;
    const what = o.type === 'fix' ? `Offered to fix it by ${dayMonth(o.fix_by)}` : o.type === 'partial_refund' ? `Offered a ${formatNaira(o.amount)} refund` : 'Disagrees';
    return { text: fromVendor.body ? `${what}: "${fromVendor.body}"` : what, at: fromVendor.created_at };
  }
  return { text: `"${fromVendor.body ?? ''}"`, at: fromVendor.created_at };
}

/** DSP-05 Dispute detail, or DSP-09 Outcome once it's closed. */
export function DisputeDetailScreen({ navigation, route }: RootScreenProps<'DisputeDetail'>) {
  const { disputeId } = route.params;
  const query = useDispute(disputeId);
  const d = query.data;

  if (!d) {
    return (
      <PtPageScreen title="Dispute" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  if (d.status === 'resolved' || d.status === 'rejected') return <Outcome d={d} navigation={navigation} />;
  return <Detail d={d} navigation={navigation} />;
}

function Detail({ d, navigation }: { d: DisputeDetail; navigation: Nav }) {
  const addFile = useDisputeFile(d.id);
  const vendor = d.viewer === 'vendor';
  const reply = lastReply(d);
  const photos = d.files.filter((f) => f.kind !== 'document').length;
  const milestoneDispute = d.kind === 'milestone';

  const items: { key: string; state: TimelineState; title: string; sub?: string; meta?: string }[] = [
    {
      key: 'opened',
      state: 'done',
      title: vendor ? `${d.raised_by?.first_name ?? 'The family'} opened the dispute` : 'You opened the dispute',
      sub: `${photos} photo${photos === 1 ? '' : 's'}${d.files.length - photos ? `, ${d.files.length - photos} document${d.files.length - photos === 1 ? '' : 's'}` : ''}`,
      meta: dayTime(d.created_at),
    },
  ];
  if (milestoneDispute) {
    items.push(
      reply
        ? { key: 'reply', state: 'done', title: vendor ? 'You replied' : `${d.against?.name ?? 'The builder'} replied`, sub: reply.text, meta: dayTime(reply.at) }
        : { key: 'reply', state: d.status === 'open' ? 'now' : 'todo', title: vendor ? 'Your reply' : `Waiting for ${d.against?.name ?? 'the builder'}`, sub: `Reply by ${deadlineDay(d.reply_by)}`, meta: d.status === 'open' ? 'Now' : undefined },
    );
    items.push(
      d.status === 'fixing'
        ? { key: 'agree', state: 'now', title: 'Being fixed', sub: vendor ? 'Submit new photos when the fix is done' : 'You approve the new photos, then the builder is paid', meta: 'Now' }
        : { key: 'agree', state: d.status === 'responded' ? 'now' : 'todo', title: 'Agree a fix', sub: vendor ? 'The family accepts your offer or replies' : 'Accept their offer or reply', meta: d.status === 'responded' ? 'Now' : undefined },
    );
  }
  items.push(
    d.status === 'escalated' || d.status === 'under_review' || !milestoneDispute
      ? { key: 'patriai', state: 'now', title: 'Patriai is deciding', sub: d.decision_due ? `Decision by ${deadlineDay(d.decision_due)}` : 'Within 5 working days', meta: d.evidence_until ? `Evidence until ${deadlineDay(d.evidence_until)}` : undefined }
      : { key: 'patriai', state: 'todo', title: "Patriai decides if you can't agree", sub: 'Within 5 working days' },
  );

  const add = async () => {
    const f = await pickFile('library', 'media');
    if (!f) return;
    addFile.mutate(f, { onError: (e) => showAlert('Could not add it', (e as Error).message) });
  };

  const footer = (
    <>
      {d.can.reply ? <PtButton title="Respond" onPress={() => navigation.navigate('DisputeRespond', { disputeId: d.id })} /> : null}
      {d.can.message ? <PtButton title={d.can.answer_offer ? 'See their offer' : 'Reply'} variant={d.can.reply ? 'secondary' : 'primary'} onPress={() => navigation.navigate('DisputeChat', { disputeId: d.id })} /> : null}
      {d.can.escalate ? (
        <Pressable onPress={() => { selection(); navigation.navigate('EscalateDispute', { disputeId: d.id }); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Ask Patriai to step in</Text>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <PtPageScreen
      title={d.subject}
      subtitle={d.number ? `Dispute #${d.number}` : 'Dispute'}
      onBack={() => navigation.goBack()}
      right={
        d.can.message ? (
          <Pressable onPress={() => { selection(); navigation.navigate('DisputeChat', { disputeId: d.id }); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Messages">
            <Feather name="message-square" size={22} color={pt.ink} />
          </Pressable>
        ) : null
      }
      footer={footer}
    >
      <PtPanel>
        {vendor ? (
          <PtReviewRow label="Raised by" value={d.raised_by?.name ?? 'The family'} sub={d.project?.title} />
        ) : d.against ? (
          <PtReviewRow label="Against" value={d.against.name} />
        ) : (
          <PtReviewRow label="About" value={d.kind === 'payment_received' ? 'A payment I received' : 'A payment I made'} sub={d.reference} />
        )}
        {d.amount_on_hold ? <PtReviewRow label="On hold" value={formatNaira(d.amount_on_hold)} sub={d.milestone?.title} /> : null}
        <PtReviewRow label={vendor ? 'They asked for' : 'You asked for'} value={d.remedy_label ?? d.reason_label ?? 'Patriai to look into it'} sub={d.reason_label && d.remedy_label ? d.reason_label : null} last />
      </PtPanel>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>"{d.description}"</Text>
      <Timeline items={items} />
      {d.files.length ? <PhotoGrid photos={d.files.map((f) => ({ key: f.id, url: f.url, caption: f.from === 'vendor' ? 'Builder' : undefined, video: f.kind === 'video', document: f.kind === 'document' }))} /> : null}
      {d.can.add_evidence ? <PtButton title="Add evidence" variant="ghost" size="sm" onPress={() => void add()} loading={addFile.isPending} /> : null}
      {milestoneDispute && d.status !== 'escalated' ? (
        <PtNote icon="lock">{vendor ? "Answer within 3 days. If you don't, Patriai may decide using the family's evidence." : 'The milestone payment is on hold in your project wallet until this is sorted.'}</PtNote>
      ) : null}
    </PtPageScreen>
  );
}

/** DSP-09 Outcome: how it ended, what was released and what stayed, and rate the builder. */
function Outcome({ d, navigation }: { d: DisputeDetail; navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const builder = d.against?.name ?? 'The builder';
  const vendor = d.viewer === 'vendor';
  const label =
    d.status === 'rejected'
      ? 'Not upheld'
      : { fixed: 'Fixed at no extra cost', partial_refund: 'Partial refund', full_refund: 'Refunded in full', released: 'Paid in full', resolved: 'Resolved' }[d.outcome ?? 'resolved'];
  const body =
    d.outcome === 'fixed'
      ? vendor ? 'The family approved your fix, and you were paid.' : `${builder} fixed it. You approved the new photos.`
      : d.outcome === 'partial_refund'
        ? vendor ? 'The payment was released less the refund.' : `${builder} was paid less the refund. The rest stays in your project wallet.`
        : d.outcome === 'full_refund'
          ? vendor ? 'Patriai decided the family is refunded in full.' : 'Nothing was paid for this milestone. The money stays in your project wallet.'
          : d.outcome === 'released'
            ? 'Patriai decided the payment should be released in full.'
            : d.resolution ?? 'Patriai has closed this dispute.';
  const held = d.milestone ? Math.max(0, Number(d.milestone.amount) - Number(d.refund_amount ?? 0) - Number(d.released_amount ?? 0)) : 0;
  const decision = [...d.messages].reverse().find((m) => m.kind === 'decision');

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16, alignItems: 'stretch' }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <DoneHero />
          <PtText variant="headline" style={{ textAlign: 'center' }}>{d.status === 'rejected' ? 'Dispute closed' : 'Dispute resolved'}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>{body}</PtText>
        </View>
        <PtPanel>
          <PtReviewRow label="Outcome" value={label} />
          {Number(d.released_amount ?? 0) > 0 ? (
            <PtReviewRow label={vendor ? 'Paid to you' : 'Released to builder'} value={formatNaira(d.released_amount)} sub={`${dayMonth(d.resolved_at)}${held > 0 ? ` · ${formatNaira(held)} held back as usual` : ''}`} />
          ) : null}
          {Number(d.refund_amount ?? 0) > 0 ? <PtReviewRow label={vendor ? 'Refunded to the family' : 'Stays in your project wallet'} value={formatNaira(d.refund_amount)} /> : null}
          <PtReviewRow label="Dispute" value={`${d.number ? `#${d.number}` : ''} · closed`} last />
        </PtPanel>
        {decision?.body ? <PtNote>{`Patriai's decision: ${decision.body}`}</PtNote> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        {d.can.rate && d.against?.profile_id ? (
          <PtButton
            title={`Rate ${builder}`}
            onPress={() =>
              navigation.navigate('RateVendor', {
                profileId: d.against!.profile_id!,
                name: builder,
                milestoneId: d.outcome === 'full_refund' ? undefined : d.milestone?.id,
                milestoneTitle: d.milestone?.title,
                projectId: d.project?.id,
              })
            }
          />
        ) : null}
        {d.project ? (
          <PtButton title="Back to project" variant={d.can.rate ? 'ghost' : 'primary'} onPress={() => navigation.navigate(vendor ? 'VendorProject' : 'ProjectDetail', { projectId: d.project!.id })} />
        ) : (
          <PtButton title="Back to disputes" onPress={() => navigation.navigate('Disputes')} />
        )}
      </View>
    </View>
  );
}
