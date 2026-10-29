import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock, MoneyTiles, ProgressLine } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/** PRJ-10 Budget vs actual: each milestone against its plan, the builder's extras, and the buffer left. */
export function ProjectBudgetScreen({ navigation, route }: RootScreenProps<'ProjectBudget'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const b = query.data?.budget;

  return (
    <PtPageScreen title="Budget vs actual" subtitle={query.data?.project.title} onBack={() => navigation.goBack()}>
      {!b ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <MoneyTiles left={{ label: 'Budget', value: formatNaira(b.budget) }} right={{ label: 'Committed', value: formatNaira(b.committed) }} />
          <PtPanel>
            {b.lines.map((l, i) => (
              <View key={l.milestone_id} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === b.lines.length - 1 && b.extras.length === 0 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{l.title}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
                    {formatNaira(l.spent)} of {formatNaira(l.planned)}
                  </Text>
                </View>
                <ProgressLine value={Number(l.spent)} max={Number(l.planned)} height={4} />
              </View>
            ))}
            {b.extras.map((x, i) => (
              <View key={x.milestone_id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: i === b.extras.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>Extras: {x.title.toLowerCase()}</Text>
                <PtChip label={`${formatNaira(x.amount)} over`} tone="warning" icon="clock" />
              </View>
            ))}
          </PtPanel>
          {Number(b.extras_total) > 0 ? (
            <PtNote tone="attention">
              {Number(b.over_buffer) > 0
                ? `You're ${formatNaira(b.extras_total)} over on extras. The buffer covers ${formatNaira(b.buffer)}, so ${formatNaira(b.over_buffer)} needs more money in the wallet.`
                : `You're ${formatNaira(b.extras_total)} over on extras. It comes out of the buffer, which has ${formatNaira(b.buffer_left)} left.`}
            </PtNote>
          ) : Number(b.buffer) > 0 ? (
            <PtNote>{`No extras so far. Your buffer of ${formatNaira(b.buffer)} is untouched.`}</PtNote>
          ) : null}
        </>
      )}
    </PtPageScreen>
  );
}
