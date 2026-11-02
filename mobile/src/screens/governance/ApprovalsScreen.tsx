import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useApprovals } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtPills } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { ApprovePinSheet } from '../../components/approvals/ApprovalUi';
import { formatNaira, initials } from '../../lib/format';
import { dayTime } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { ApprovalRequest } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Scope = 'to_me' | 'mine' | 'history';

/** "Approved", "Declined"… for the History tab. */
export function outcomeChip(r: ApprovalRequest): { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning' } {
  switch (r.status) {
    case 'executed':
    case 'approved':
      return { label: 'Approved', tone: 'success' };
    case 'rejected':
      return { label: 'Declined', tone: 'danger' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    case 'failed':
      return { label: "Didn't go through", tone: 'danger' };
    default:
      return { label: 'Waiting', tone: 'warning' };
  }
}

/**
 * APR-01 Approvals: Waiting for me (approve or decline right here), My
 * requests, and History.
 */
export function ApprovalsScreen({ navigation, route }: RootScreenProps<'Approvals'>) {
  const [scope, setScope] = useState<Scope>(route.params?.scope ?? 'to_me');
  const toMe = useApprovals('to_me');
  const mine = useApprovals('mine', 'pending');
  const history = useApprovals('history');
  const [approving, setApproving] = useState<ApprovalRequest | null>(null);
  const q = scope === 'to_me' ? toMe : scope === 'mine' ? mine : history;
  const items = q.data ?? [];
  const open = (r: ApprovalRequest) => { selection(); navigation.navigate('ApprovalDetail', { approvalId: r.id }); };

  return (
    <PtPageScreen title="Approvals" onBack={() => navigation.goBack()}>
      <PtPills
        solid
        compact
        options={[
          { value: 'to_me', label: `Waiting for me${toMe.data ? ` · ${toMe.data.length}` : ''}` },
          { value: 'mine', label: `My requests${mine.data ? ` · ${mine.data.length}` : ''}` },
          { value: 'history', label: 'History' },
        ]}
        value={scope}
        onChange={(v) => setScope(v as Scope)}
      />
      {q.isLoading || q.error ? (
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>
          {scope === 'to_me' ? 'Nothing is waiting for your yes.' : scope === 'mine' ? "You aren't waiting on anyone." : 'Answered requests show here.'}
        </Text>
      ) : (
        items.map((r) => {
          const who = r.initiator?.name ?? 'Someone';
          const chip =
            scope === 'history'
              ? outcomeChip(r)
              : scope === 'mine'
                ? { label: r.waiting_on?.length ? `Waiting for ${r.waiting_on.join(' and ')}` : 'Waiting', tone: 'warning' as const }
                : { label: `${r.approvals_count} of ${r.required_approvals} approved`, tone: 'warning' as const };
          const title = scope === 'mine' ? (r.pays_to ? `To ${r.pays_to}` : r.wallet?.name ?? 'Request') : `${who} requested`;
          const sub = `${scope === 'mine' ? '' : `${r.acting_for ? `For ${r.acting_for} · ` : ''}`}${r.wallet?.name ?? ''} · ${dayTime(r.created_at)}`;
          return (
            // The card opens the request; its own Decline / Approve sit outside that tap area.
            <View key={r.id} style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 20, gap: 14 }}>
              <Pressable onPress={() => open(r)} accessibilityRole="button" accessibilityLabel={`${title} ${formatNaira(r.amount)}`} style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <PtAvatar initials={initials(scope === 'mine' ? r.pays_to ?? r.wallet?.name ?? '' : who)} size={40} tone={r.wallet?.type === 'child' && scope !== 'mine' ? 'gold' : 'mint'} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 20, color: pt.ink }} numberOfLines={2}>{title}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }} numberOfLines={2}>{sub}</Text>
                  </View>
                  <PtChip label={chip.label} tone={chip.tone} icon={chip.tone === 'warning' ? 'clock' : undefined} />
                </View>
                {r.governance ? null : <Text style={{ fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, color: pt.ink }}>{formatNaira(r.amount)}</Text>}
                {r.description ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }} numberOfLines={2}>{r.description}</Text> : null}
              </Pressable>
              {scope === 'to_me' ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PtButton title="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('ApprovalDecline', { approvalId: r.id })} />
                  <PtButton title="Approve" style={{ flex: 1 }} onPress={() => setApproving(r)} />
                </View>
              ) : null}
            </View>
          );
        })
      )}
      <ApprovePinSheet
        approval={approving}
        onDone={(id) => {
          setApproving(null);
          navigation.navigate('ApprovalOutcome', { approvalId: id });
        }}
        onClose={() => setApproving(null)}
      />
    </PtPageScreen>
  );
}
