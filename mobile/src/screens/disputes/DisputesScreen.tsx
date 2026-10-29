import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useDisputeList } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtPills } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { relativeDay, deadlineDay } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { DisputeSummary } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mama's house renovation · Aug", "Card · Aug". */
function closedLine(d: DisputeSummary): string {
  const when = d.resolved_at ?? d.created_at;
  const month = when ? MONTHS[new Date(when).getMonth()] : '';
  const what = d.project?.title ?? (d.kind === 'payment_received' ? 'Money in' : 'Payment');
  return [what, month].filter(Boolean).join(' · ');
}

/** An open dispute: subject and where it stands, who it's against and what's on hold, when they reply by. */
export function OpenDisputeCard({ d, onPress }: { d: DisputeSummary; onPress: () => void }) {
  const urgent = d.viewer === 'vendor' && d.status === 'open';
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button" accessibilityLabel={d.subject}>
      <View style={{ backgroundColor: urgent ? pt.dangerSoft : pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
            {d.subject}
          </Text>
          <PtChip label={d.status_label} tone={urgent ? 'danger' : d.status === 'escalated' ? 'info' : 'warning'} icon={urgent ? 'x' : 'clock'} />
        </View>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
          {d.viewer === 'vendor'
            ? [d.project?.title, d.milestone?.title, d.amount_on_hold ? `${formatNaira(d.amount_on_hold)} on hold` : null].filter(Boolean).join(' · ')
            : [d.against, d.amount_on_hold ? `${formatNaira(d.amount_on_hold)} on hold` : null].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkSubtle }}>
          {`Opened ${relativeDay(d.created_at)}`}
          {d.status === 'open' && d.reply_by && d.viewer === 'family' ? ` · they reply by ${deadlineDay(d.reply_by)}` : ''}
          {d.status === 'escalated' && d.decision_due ? ` · decision by ${deadlineDay(d.decision_due)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** Closed disputes, a few to a card: what it was, how it ended, where and when. */
export function ClosedDisputes({ list, onOpen }: { list: DisputeSummary[]; onOpen: (d: DisputeSummary) => void }) {
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
      {list.map((d, i) => (
        <Pressable key={d.id} onPress={() => { selection(); onOpen(d); }} accessibilityRole="button" accessibilityLabel={d.subject}>
          <View style={{ paddingVertical: 10, gap: 1, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>{d.subject}</Text>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{d.status_label}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{closedLine(d)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** DSP-01 Disputes: what's open and where each stands, and what was closed. */
export function DisputesScreen({ navigation }: RootScreenProps<'Disputes'>) {
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const open = useDisputeList('open');
  const closed = useDisputeList('closed');
  const loading = open.isLoading || closed.isLoading;
  const error = open.error ?? closed.error;
  const openList = open.data ?? [];
  const closedList = closed.data ?? [];

  return (
    <PtPageScreen
      title="Disputes"
      subtitle="Help sorting out a problem"
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Start a dispute" onPress={() => navigation.navigate('StartDispute', {})} />}
      gap={14}
    >
      <PtPills options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} value={tab} onChange={setTab} />
      {loading || error ? (
        <LoadingBlock error={error ? (error as Error).message : null} onRetry={() => { void open.refetch(); void closed.refetch(); }} />
      ) : (
        <>
          {tab === 'open'
            ? openList.length
              ? openList.map((d) => <OpenDisputeCard key={d.id} d={d} onPress={() => navigation.navigate('DisputeDetail', { disputeId: d.id })} />)
              : <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 12 }}>Nothing open. If something goes wrong with a payment or a builder, start a dispute and we'll help sort it out.</Text>
            : null}
          {closedList.length ? (
            <>
              <PtSectionTitle title="Closed" />
              <ClosedDisputes list={closedList} onOpen={(d) => navigation.navigate('DisputeDetail', { disputeId: d.id })} />
            </>
          ) : tab === 'closed' ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 12 }}>No closed disputes.</Text>
          ) : null}
        </>
      )}
    </PtPageScreen>
  );
}
