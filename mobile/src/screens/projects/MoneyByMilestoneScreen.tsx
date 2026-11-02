import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtChip, type PtChipTone } from '../../components/pt/PtChip';
import { PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Milestone } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const COLORS = { released: '#137A56', held: '#F2A93B', funded: '#DDF1E8', unfunded: '#718A80' };

/**
 * MLS-04 Money by milestone: released, held back, funded and locked, or not
 * funded yet — the bar for the whole project, then each milestone.
 */
export function MoneyByMilestoneScreen({ navigation, route }: RootScreenProps<'MoneyByMilestone'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);

  if (!query.data) {
    return (
      <PtPageScreen title="Money by milestone" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const ms = query.data.milestones.filter((m) => !['cancelled', 'proposed'].includes(m.status));
  const n = (s: string | null | undefined) => Number(s ?? 0) || 0;
  const held = (m: Milestone) => (m.status === 'released' && !m.retention_released_at ? n(m.retention) : 0);
  const sums = {
    released: ms.reduce((t, m) => t + (m.status === 'released' ? n(m.amount) - n(m.refunded) - held(m) : n(m.advance_paid)), 0),
    held: ms.reduce((t, m) => t + held(m), 0),
    funded: ms.reduce((t, m) => t + (['funded', 'submitted', 'approved'].includes(m.status) ? n(m.amount) - n(m.advance_paid) : 0), 0),
    unfunded: ms.reduce((t, m) => t + (m.status === 'planned' || m.status === 'rejected' ? n(m.amount) : 0), 0),
  };
  const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
  const firstUnfunded = ms.find((m) => m.status === 'planned');

  const line = (m: Milestone, i: number): { sub: string; chip: { label: string; tone: PtChipTone; icon: 'check' | 'clock' | 'x' | 'lock' } } => {
    if (m.status === 'released') {
      return { sub: `Paid ${formatNaira(n(m.amount) - n(m.refunded) - n(m.retention))}${n(m.retention) ? ` · ${formatNaira(m.retention)} ${m.retention_released_at ? 'paid after handover' : 'held'}` : ''}`, chip: { label: 'Released', tone: 'success', icon: 'check' } };
    }
    if (m.status === 'submitted' || m.status === 'approved') {
      const a = m.approval;
      return { sub: `Funded · unlocks when ${a && a.required > 1 ? `${a.required} of ${a.approvers.length}` : 'an approver'} approve${a && a.required > 1 ? '' : 's'}`, chip: { label: 'Waiting', tone: 'warning', icon: 'clock' } };
    }
    if (m.status === 'funded') {
      return { sub: `Funded, locked · ${n(m.advance_paid) ? `${formatNaira(m.advance_paid)} paid ahead for materials` : 'waiting for the work'}`, chip: { label: 'Funded', tone: 'brand', icon: 'lock' } };
    }
    const prev = ms[i - 1];
    return {
      sub: m === firstUnfunded && prev && prev.status !== 'released' ? `Starts after ${prev.title.toLowerCase()}` : 'Still to raise',
      chip: { label: 'Not funded', tone: 'danger', icon: 'x' },
    };
  };

  return (
    <PtPageScreen title="Money by milestone" subtitle="Held safely until each phase is approved" onBack={() => navigation.goBack()}>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
        {(Object.keys(sums) as (keyof typeof sums)[]).filter((k) => sums[k] > 0).map((k) => (
          <View key={k} style={{ flex: sums[k] / total, backgroundColor: COLORS[k] }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 }}>
        {([['released', 'Released'], ['held', 'Held back'], ['funded', 'Funded, locked'], ['unfunded', 'Not funded']] as const).map(([k, label]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: COLORS[k] }} />
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`${label} ${formatNaira(sums[k])}`}</Text>
          </View>
        ))}
      </View>
      <PtPanel>
        {ms.map((m, i) => {
          const l = line(m, i);
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                selection();
                navigation.navigate(m.status === 'submitted' || m.status === 'approved' ? 'MilestoneApprovals' : 'Milestones', { projectId, milestoneId: m.id } as never);
              }}
              accessibilityRole="button"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === ms.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{`${m.title} · ${formatNaira(m.amount)}`}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{l.sub}</Text>
                </View>
                <PtChip label={l.chip.label} tone={l.chip.tone} icon={l.chip.icon} />
              </View>
            </Pressable>
          );
        })}
      </PtPanel>
    </PtPageScreen>
  );
}
