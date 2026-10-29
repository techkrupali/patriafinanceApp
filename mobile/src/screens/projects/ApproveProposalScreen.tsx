import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useAnswerProposal } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadingBlock, PersonRow, TextArea } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** PRJ-11 "New milestone from the builder": what it adds to the total and the funding gap, then approve or ask for changes. */
export function ApproveProposalScreen({ navigation, route }: RootScreenProps<'ApproveProposal'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const me = useAuth((s) => s.user);
  const answer = useAnswerProposal();
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState('');
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const p = query.data?.project;

  if (!query.data || !m || !p || !m.proposal) {
    return (
      <PtPageScreen title="New milestone" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : query.data ? 'This milestone has already been answered.' : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }
  const pr = m.proposal;
  const gap = Number(pr.funding_gap);

  const send = (approve: boolean) => {
    answer.mutate(
      { milestoneId, approve, note: approve ? undefined : note.trim() },
      {
        onSuccess: () => {
          setChangesOpen(false);
          if (approve) navigation.navigate('Milestones', { projectId });
          else navigation.goBack();
        },
        onError: (e) => showAlert('Could not save', (e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen
      title="New milestone from the builder"
      subtitle={p.title}
      onBack={() => navigation.goBack()}
      footer={
        query.data.can.approve ? (
          <>
            <PtButton title="Approve milestone" onPress={() => send(true)} loading={answer.isPending && !changesOpen} />
            <Pressable onPress={() => { selection(); setChangesOpen(true); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Ask for changes</Text>
            </Pressable>
          </>
        ) : null
      }
    >
      <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 4 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{m.title}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
          Proposed by {pr.by ?? p.vendor?.person ?? 'the builder'}{pr.why ? ` · "${pr.why}"` : ''}
        </Text>
      </View>
      <PtPanel>
        <PtReviewRow label="Amount" value={formatNaira(m.amount)} />
        {m.due_date ? <PtReviewRow label="Due" value={formatYmd(m.due_date)} /> : null}
        {m.deliverables.length ? <PtReviewRow label="Deliverables" value={m.deliverables.map((d) => d.text).join(', ')} /> : null}
        <PtReviewRow label="New project total" value={formatNaira(pr.new_total)} sub={`Was ${formatNaira(pr.was_total)}`} />
        <PtReviewRow label="Funding gap" value={formatNaira(gap)} sub={gap > 0 ? 'Not yet covered by contributions' : 'Covered by what you planned to save'} last />
      </PtPanel>
      <PtPanel>
        {p.approvers.map((a, i) => (
          <PersonRow
            key={a.id}
            initials={initials(a.name)}
            tone={i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
            name={a.id === me?.id ? `${a.first_name} (you)` : a.first_name}
            sub={a.id === me?.id ? 'Approver' : 'Approver · also asked'}
            last={i === p.approvers.length - 1}
          />
        ))}
      </PtPanel>

      <PtSheet
        visible={changesOpen}
        title="Ask for changes"
        subtitle="The builder updates the milestone and sends it back."
        onClose={() => setChangesOpen(false)}
        footer={<PtButton title="Send to the builder" onPress={() => send(false)} disabled={!note.trim()} loading={answer.isPending} />}
      >
        <TextArea label="What should change?" value={note} onChange={setNote} placeholder="Use the cheaper worktop we talked about." maxLength={500} />
      </PtSheet>
    </PtPageScreen>
  );
}
