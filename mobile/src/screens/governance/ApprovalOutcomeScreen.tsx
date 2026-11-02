import React from 'react';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt } from '../../theme';
import { useApproval } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { DoneHero, LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { dayTime } from '../../lib/projects';
import type { ApprovalRequest } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** APR-06: what happened, in a line. */
function outcome(a: ApprovalRequest, myId: number | undefined): { title: string; body: string } {
  const first = (a.initiator?.name ?? 'They').split(' ')[0];
  const mine = a.initiator?.id === myId;
  const to = a.pays_to ?? a.wallet?.name ?? '';
  switch (a.status) {
    case 'executed':
      return { title: 'Approved', body: a.governance ? `${a.description ?? 'The change'} is done.` : `Paid ${formatNaira(a.amount)}${to ? ` to ${to}` : ''}. We've told ${mine ? 'everyone' : first}.` };
    case 'approved':
    case 'pending':
      return a.status === 'approved' || a.my_responded
        ? { title: 'You said yes', body: a.status === 'approved' ? 'It goes through in a moment.' : `It's waiting for ${(a.waiting_on ?? []).join(' and ') || 'the others'}.` }
        : { title: 'Waiting', body: 'Nobody has answered yet.' };
    case 'rejected':
      return { title: 'Declined', body: mine ? `Nothing was paid.${a.counter_offer ? ` They offered ${formatNaira(a.counter_offer)} instead — you can ask again for that.` : ''}` : `Reason shared with ${first}.${a.counter_offer ? ` You offered ${formatNaira(a.counter_offer)} instead.` : ''}` };
    case 'expired':
      return { title: 'Expired', body: 'Nobody answered in time. Nothing was paid.' };
    case 'cancelled':
      return { title: 'Cancelled', body: `${mine ? 'You' : first} withdrew it${a.cancel_reason ? ` · ${a.cancel_reason}` : ''}. Nothing was paid.` };
    default:
      return { title: "Didn't go through", body: a.fail_reason ?? 'Nothing was paid.' };
  }
}

/** APR-06 Outcomes: approved, declined, expired or cancelled — and what it means. */
export function ApprovalOutcomeScreen({ navigation, route }: RootScreenProps<'ApprovalOutcome'>) {
  const { approvalId } = route.params;
  const insets = useSafeAreaInsets();
  const myId = useAuth((s) => s.user?.id);
  const q = useApproval(approvalId);
  const a = q.data;
  const o = a ? outcome(a, myId) : null;
  const decline = a?.responses?.find((r) => r.decision === 'reject');

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 40, paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
        {!a || !o ? (
          <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <DoneHero />
              <PtText variant="headline" style={{ textAlign: 'center' }}>{o.title}</PtText>
              <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>{o.body}</PtText>
            </View>
            <PtPanel>
              {a.governance ? <PtReviewRow label="What" value={a.description ?? '—'} /> : <PtReviewRow label="Amount" value={formatNaira(a.amount)} sub={a.description} />}
              <PtReviewRow label="From" value={a.wallet?.name ?? '—'} />
              {decline?.note ? <PtReviewRow label={decline.approver?.id === myId ? 'Your reason' : 'Their reason'} value={`"${decline.note}"`} /> : null}
              {a.executed_transaction_reference ? <PtReviewRow label="Reference" value={a.executed_transaction_reference} /> : null}
              <PtReviewRow label="Asked" value={dayTime(a.created_at)} last />
            </PtPanel>
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18 }}>
        <PtButton title="Back to approvals" onPress={() => navigation.navigate('Approvals')} />
      </View>
    </View>
  );
}
