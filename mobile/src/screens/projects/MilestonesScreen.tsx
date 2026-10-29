import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable } from 'react-native-gesture-handler';
import { pt } from '../../theme';
import { useProject } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtNote } from '../../components/pt/PtForm';
import { LoadingBlock, Timeline, type TimelineState } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { milestoneDates, milestoneLine } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { Milestone } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function stateOf(m: Milestone): TimelineState {
  if (m.status === 'released') return 'done';
  if (m.status === 'submitted' || m.status === 'approved' || m.dispute || m.change_request || m.rejection) return 'now';
  return 'todo';
}

/** PRJ-04 Milestones: paid ones ticked with what was held back, the current one, and what comes next. */
export function MilestonesScreen({ navigation, route }: RootScreenProps<'Milestones'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const data = query.data;
  const list = (data?.milestones ?? []).filter((m) => m.status !== 'cancelled');

  return (
    <PtPageScreen
      title="Milestones"
      subtitle={data?.project.title}
      onBack={() => navigation.goBack()}
      right={
        data?.can.edit ? (
          <Pressable onPress={() => { selection(); navigation.navigate('EditMilestone', { projectId }); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add milestone">
            <Feather name="plus" size={24} color={pt.ink} />
          </Pressable>
        ) : null
      }
    >
      {!data ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Timeline
            items={list.map((m, i) => {
              const prev = i > 0 ? list[i - 1] : undefined;
              const last = i === list.length - 1;
              const line = milestoneLine(m, data.project, prev);
              return {
                key: m.id,
                state: stateOf(m),
                title: `${m.title} · ${formatNaira(m.amount)}`,
                sub: last && m.status !== 'released' && !m.change_request && !m.rejection && m.status !== 'submitted' && m.status !== 'proposed' ? 'Last milestone, then handover' : line,
                meta: milestoneDates(m) || undefined,
                onPress: () => {
                  if (m.status === 'submitted' || m.status === 'approved') navigation.navigate('ReviewMilestone', { projectId, milestoneId: m.id });
                  else if (m.status === 'proposed') navigation.navigate('ApproveProposal', { projectId, milestoneId: m.id });
                  else if (data.can.edit && m.status !== 'released') navigation.navigate('EditMilestone', { projectId, milestoneId: m.id });
                },
              };
            })}
          />
          {data.can.edit ? <PtNote>Tap a milestone that hasn't started to change it. The builder must accept new amounts or dates.</PtNote> : null}
        </>
      )}
    </PtPageScreen>
  );
}
