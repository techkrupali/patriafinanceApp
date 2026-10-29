import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAnswerFamilyChange } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote } from '../../components/pt/PtForm';
import { ActionTiles, AttentionCard, LoadingBlock, MoneyTiles, Timeline, type TimelineState } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd } from '../../lib/format';
import { dayMonth, namesList, relativeDay, townOf } from '../../lib/projects';
import type { Milestone, ProjectDetailData } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

function line(m: Milestone, d: ProjectDetailData): { state: TimelineState; sub: string } {
  const reviewers = namesList((m.approval?.approvers.filter((a) => !a.said_yes) ?? d.project.approvers).map((a) => a.first_name));
  switch (m.status) {
    case 'released':
      return { state: 'done', sub: `${formatNaira(m.paid_now ?? m.release_now)} paid · ${dayMonth(m.released_at)}` };
    case 'submitted':
    case 'approved':
      return { state: 'now', sub: `Submitted ${relativeDay(m.submitted_at)} · ${reviewers} ${reviewers.includes(' and ') ? 'are' : 'is'} reviewing` };
    case 'proposed':
      return { state: 'todo', sub: m.proposal?.family_note ? `The family asked for changes: ${m.proposal.family_note}` : 'Waiting for the family to approve' };
    case 'cancelled':
      return { state: 'todo', sub: 'Refunded to the family after a dispute' };
    default:
      if (m.dispute) return { state: 'now', sub: m.dispute.status === 'fixing' ? 'Fix agreed · submit new photos when done' : `Dispute ${m.dispute.number ?? ''} · payment on hold` };
      if (m.rejection) return { state: 'now', sub: `Sent back: ${m.rejection}` };
      return { state: 'todo', sub: `${formatNaira(m.amount)}${m.due_date ? ` · due ${dayMonth(m.due_date)}` : ''}${m.status === 'planned' ? ' · money not in yet' : ''}` };
  }
}

/** VDM-04 the builder's project: paid and held back, the milestones, the family's changes — submit or add a milestone. */
export function VendorProjectScreen({ navigation, route }: RootScreenProps<'VendorProject'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const answer = useAnswerFamilyChange();
  const d = query.data;

  if (!d) {
    return (
      <PtPageScreen title="Project" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  const p = d.project;
  const list = d.milestones.filter((m) => m.status !== 'cancelled');
  const changes = list.filter((m) => m.change_request?.by === 'family');
  const next = list.find((m) => ['funded', 'planned', 'rejected'].includes(m.status) && (!m.dispute || m.dispute.status === 'fixing'));
  const months = p.setup?.release?.retention_months ?? 3;

  const reply = (m: Milestone, agree: boolean) =>
    answer.mutate({ milestoneId: m.id, agree }, { onError: (e) => showAlert('Could not save', (e as Error).message) });

  return (
    <PtPageScreen
      title={p.title}
      subtitle={`For the ${p.family ?? 'family'}${p.setup?.location ? ` · ${townOf(p.setup.location)}` : ''}`}
      onBack={() => navigation.goBack()}
      footer={
        d.can.submit || d.can.upload || d.can.propose ? (
          <>
            {next && (d.can.submit || d.can.upload) ? (
              <PtButton title={d.can.submit ? 'Submit proof and request funds' : 'Add photos'} onPress={() => navigation.navigate('SubmitWork', { projectId, milestoneId: next.id })} />
            ) : null}
            {d.can.propose ? <PtButton title="Add a milestone" variant="ghost" onPress={() => navigation.navigate('ProposeMilestone', { projectId })} /> : null}
          </>
        ) : null
      }
    >
      {d.can.see_money ? <MoneyTiles left={{ label: 'Paid to you', value: formatNaira(p.paid_so_far) }} right={{ label: 'Held back', value: formatNaira(p.held_back) }} /> : null}

      {changes.map((m) => (
        <View key={m.id} style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>The family changed {m.title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
            {[m.change_request?.amount ? `${formatNaira(m.amount)} → ${formatNaira(m.change_request.amount)}` : null, m.change_request?.due_date ? `due ${formatYmd(m.change_request.due_date)}` : null].filter(Boolean).join(' · ')}
          </Text>
          {d.can.submit ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PtButton title="Keep it" variant="secondary" size="sm" style={{ flex: 1, backgroundColor: pt.raised }} onPress={() => reply(m, false)} disabled={answer.isPending} />
              <PtButton title="Accept" size="sm" style={{ flex: 1 }} onPress={() => reply(m, true)} loading={answer.isPending} />
            </View>
          ) : null}
        </View>
      ))}

      {list
        .filter((m) => m.status === 'proposed' && m.proposal?.family_note)
        .map((m) => (
          <AttentionCard key={m.id} tone="info" title={`The family asked for changes on ${m.title}`} sub={m.proposal?.family_note ?? undefined} onPress={d.can.propose ? () => navigation.navigate('ProposeMilestone', { projectId, milestoneId: m.id }) : undefined} />
        ))}

      <Timeline
        items={list.map((m) => {
          const l = line(m, d);
          return {
            key: m.id,
            state: l.state,
            title: m.title,
            sub: l.sub,
            onPress:
              ['funded', 'planned'].includes(m.status) && (d.can.submit || d.can.upload)
                ? () => navigation.navigate('SubmitWork', { projectId, milestoneId: m.id })
                : m.dispute
                  ? () => navigation.navigate('DisputeDetail', { disputeId: m.dispute!.id })
                  : undefined,
          };
        })}
      />
      <PtNote>{`You're paid within minutes of the family approving.${Number(p.held_back) > 0 || p.setup?.release?.retention_percent ? ` Held-back money is released ${months} month${months === 1 ? '' : 's'} after handover.` : ''}`}</PtNote>
      <ActionTiles
        items={[
          ...(d.can.chat ? [{ label: 'Chat', icon: 'message-square' as const, onPress: () => navigation.navigate('ProjectChat', { projectId }) }] : []),
          { label: 'Documents', icon: 'file' as const, onPress: () => navigation.navigate('ProjectDocuments', { projectId }) },
        ]}
      />
    </PtPageScreen>
  );
}
