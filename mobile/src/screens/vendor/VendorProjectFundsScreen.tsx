import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { namesList } from '../../lib/projects';
import type { RootScreenProps } from '../../navigation/types';

/**
 * VDM-13 Project funds: what's been paid to you, what's waiting for approval
 * (each milestone and any materials advance asked with it), what's held back
 * until after handover — then Go to payouts.
 */
export function VendorProjectFundsScreen({ navigation, route }: RootScreenProps<'VendorProjectFunds'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);

  if (!query.data) {
    return (
      <PtPageScreen title="Project funds" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const p = query.data.project;
  const ms = query.data.milestones;
  const waiting = ms.filter((m) => m.status === 'submitted' || m.status === 'approved');
  const advances = ms.filter((m) => m.advance && !m.advance.paid);
  const total = waiting.reduce((t, m) => t + Number(m.release_now), 0) + advances.reduce((t, m) => t + Number(m.advance!.amount), 0);
  const months = p.setup?.release?.retention_months ?? 3;
  const rows: { label: string; value: string; sub: string }[] = [
    ...waiting.map((m) => {
      const yes = (m.approval?.approvers ?? []).filter((a) => a.said_yes).map((a) => a.first_name);
      const left = (m.approval?.approvers ?? []).filter((a) => !a.said_yes).map((a) => a.first_name);
      return {
        label: m.title,
        value: formatNaira(m.release_now),
        sub: m.dispute ? `On hold · dispute ${m.dispute.number ?? ''}` : yes.length ? `Waiting · ${namesList(yes)} approved, ${namesList(left)} to go` : `Waiting for ${namesList(left) || 'the family'}`,
      };
    }),
    ...advances.map((m) => ({
      label: `${m.advance!.title ?? 'Next phase'} materials advance`,
      value: formatNaira(m.advance!.amount),
      sub: m.status === 'released' ? `Approved with ${m.title} · paid once ${m.advance!.title ?? 'that phase'} is funded` : `Asked with ${m.title} · needs the same approvals`,
    })),
  ];

  return (
    <PtPageScreen title="Project funds" subtitle={p.title} onBack={() => navigation.goBack()} footer={<PtButton title="Go to payouts" onPress={() => navigation.navigate('VendorTabs', { screen: 'VendorPayouts' })} />}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 14, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.onDarkMuted }}>Paid to you</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: '#FFFFFF' }}>{formatNaira(p.paid_so_far)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Waiting for approval</Text>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{formatNaira(total)}</Text>
        </View>
      </View>
      <PtPanel>
        {rows.map((r) => (
          <PtReviewRow key={r.label} label={r.label} value={r.value} sub={r.sub} />
        ))}
        <PtReviewRow label="Held back" value={formatNaira(p.held_back)} sub={`Released ${months} month${months === 1 ? '' : 's'} after handover`} />
        <PtReviewRow label="Already paid" value={formatNaira(p.paid_so_far)} sub="To your business wallet, then your bank if automatic withdrawal is on" last />
      </PtPanel>
      <PtNote tone="info" icon="lock">Money stays in the family's project wallet until the approvers say yes. You get it within minutes of the last approval.</PtNote>
    </PtPageScreen>
  );
}
