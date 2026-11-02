import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useApproval, useApprovalQuestion, useCancelApproval } from '../../api/hooks';
import { useRemindApproval } from '../../api/payments';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtField } from '../../components/pt/PtField';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock, Timeline, type TimelineState } from '../../components/project/ProjectUi';
import { ApprovePinSheet } from '../../components/approvals/ApprovalUi';
import { outcomeChip } from './ApprovalsScreen';
import { formatNaira, initials } from '../../lib/format';
import { dayTime } from '../../lib/projects';
import { approvalActionLabel } from '../../lib/governance';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ApprovalRequest } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const CANCEL_REASONS = ['Paid another way', 'Wrong amount', 'No longer needed'];

/** "Expires in 41 hours". */
function expiresIn(at: string | null | undefined): string | null {
  if (!at) return null;
  const h = Math.round((new Date(at).getTime() - Date.now()) / 3_600_000);
  return h <= 0 ? 'Expires soon' : h < 48 ? `Expires in ${h} hour${h === 1 ? '' : 's'}` : `Expires in ${Math.round(h / 24)} days`;
}

/**
 * APR-02 Request detail for an approver ("Waiting for you"), and APR-07 Track
 * my request for the person who asked: who viewed it, nudge, answer a question,
 * or cancel (APR-08). Answered requests show their outcome.
 */
export function ApprovalDetailScreen({ route, navigation }: RootScreenProps<'ApprovalDetail'>) {
  const { approvalId } = route.params;
  const myId = useAuth((s) => s.user?.id);
  const q = useApproval(approvalId);
  const a = q.data;

  if (!a) {
    return (
      <PtPageScreen title="Approval" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  return a.initiator?.id === myId ? <Track a={a} navigation={navigation} /> : <Detail a={a} navigation={navigation} />;
}

type Nav = RootScreenProps<'ApprovalDetail'>['navigation'];

/** The rows both sides see: from, for, attachments, unlock terms. */
function Facts({ a }: { a: ApprovalRequest }) {
  return (
    <PtPanel>
      <PtReviewRow label="From" value={a.wallet?.name ?? '—'} sub={a.from_balance != null ? formatNaira(a.from_balance) : null} />
      {a.pays_to ? <PtReviewRow label="To" value={a.pays_to} /> : null}
      <PtReviewRow label="Asked" value={dayTime(a.created_at)} sub={a.paused ? 'Paused · waiting for an answer' : null} />
      {a.unlock && parseFloat(a.unlock.early_fee) > 0 ? <PtReviewRow label="Early unlock fee" value={formatNaira(a.unlock.early_fee)} /> : null}
      {a.unlock?.proof_url || a.proof_url ? (
        <PtReviewRow label="Proof" value="Attached" onEdit={() => void Linking.openURL((a.unlock?.proof_url ?? a.proof_url)!)} last />
      ) : (
        <PtReviewRow label="Type" value={approvalActionLabel(a.action)} last />
      )}
    </PtPanel>
  );
}

/** APR-05 thread: each question, and the answer once it comes. */
function Questions({ a }: { a: ApprovalRequest }) {
  if (!a.questions?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {a.questions.map((x, i) => (
        <View key={i} style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 6 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{`${x.by_name ?? 'Someone'} asked: "${x.body}"`}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: x.answer ? pt.ink : pt.inkMuted }}>{x.answer ? `"${x.answer.body}"` : 'No answer yet'}</Text>
        </View>
      ))}
    </View>
  );
}

function Detail({ a, navigation }: { a: ApprovalRequest; navigation: Nav }) {
  const [approving, setApproving] = useState(false);
  const first = (a.initiator?.name ?? 'Someone').split(' ')[0];
  const pending = a.status === 'pending';
  const canAnswer = pending && !a.my_responded;
  const chip = outcomeChip(a);

  return (
    <PtPageScreen
      title={pending ? (a.acting_for ? `Approving for ${a.acting_for}` : 'Waiting for you') : chip.label}
      subtitle={a.wallet?.name}
      onBack={() => navigation.goBack()}
      footer={
        canAnswer ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PtButton title="Decline" variant="secondary" style={{ flex: 1 }} onPress={() => navigation.navigate('ApprovalDecline', { approvalId: a.id })} />
            <PtButton title="Approve" style={{ flex: 1 }} onPress={() => setApproving(true)} />
          </View>
        ) : !pending ? (
          <PtButton title="See the outcome" variant="secondary" onPress={() => navigation.navigate('ApprovalOutcome', { approvalId: a.id })} />
        ) : null
      }
    >
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
        <PtAvatar initials={initials(a.initiator?.name ?? '')} size={56} tone="mint" />
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{a.governance ? `${first} asked for a change` : `${first} asked for`}</Text>
        {a.governance ? null : <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, letterSpacing: -0.8, color: pt.ink }}>{formatNaira(a.amount)}</Text>}
        {a.description ? <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 22, color: pt.ink, textAlign: 'center' }}>{`"${a.description}"`}</Text> : null}
        {!pending ? <PtChip label={chip.label} tone={chip.tone} /> : null}
      </View>
      <Facts a={a} />
      {pending ? (
        <PtPanel>
          <PtReviewRow label="Why you" value={a.acting_for ? `${a.acting_for} is away and asked you` : a.why ?? 'You approve payments on this wallet'} sub={`${a.approvals_count} of ${a.required_approvals} approved`} last />
        </PtPanel>
      ) : null}
      <Questions a={a} />
      {canAnswer ? (
        <Pressable onPress={() => { selection(); navigation.navigate('ApprovalQuestion', { approvalId: a.id }); }} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{`Ask ${first} a question`}</Text>
        </Pressable>
      ) : null}
      {pending && a.my_responded ? <PtNote>You answered. It's waiting for the others.</PtNote> : null}
      {approving ? (
        <ApprovePinSheet
          approval={a}
          onDone={(id) => {
            setApproving(false);
            navigation.replace('ApprovalOutcome', { approvalId: id });
          }}
          onClose={() => setApproving(false)}
        />
      ) : null}
    </PtPageScreen>
  );
}

/** APR-07 Track my request, APR-08 Cancel my request. */
function Track({ a, navigation }: { a: ApprovalRequest; navigation: Nav }) {
  const remind = useRemindApproval(a.id);
  const cancel = useCancelApproval(a.id);
  const qa = useApprovalQuestion(a.id);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const pending = a.status === 'pending';
  const waiting = a.waiting_on ?? [];
  const waitingNames = waiting.length ? waiting.join(' and ') : 'the approvers';
  const openQuestion = a.questions?.find((x) => !x.answer);

  const items: { key: string; state: TimelineState; title: string; sub?: string; meta?: string }[] = [
    { key: 'sent', state: 'done', title: 'You sent the request', meta: dayTime(a.created_at) },
    ...(a.responses ?? []).map((r, i) => ({ key: `r${i}`, state: 'done' as TimelineState, title: `${r.approver?.name?.split(' ')[0] ?? 'Someone'} ${r.decision === 'approve' ? 'approved' : 'declined'}`, sub: r.note ? `"${r.note}"` : undefined, meta: dayTime(r.created_at) })),
    ...(a.viewed ?? []).filter((v) => !(a.responses ?? []).some((r) => r.approver?.name?.split(' ')[0] === v.name)).map((v, i) => ({ key: `v${i}`, state: 'done' as TimelineState, title: `${v.name ?? 'Someone'} viewed it`, meta: dayTime(v.at) })),
    ...(pending ? [{ key: 'now', state: 'now' as TimelineState, title: `Waiting for ${waitingNames}`, meta: 'Now' }] : []),
  ];

  return (
    <PtPageScreen
      title="My request"
      subtitle={a.wallet?.name}
      onBack={() => navigation.goBack()}
      footer={
        pending ? (
          <>
            <PtButton
              title={`Nudge ${waiting[0] ?? 'them'}`}
              loading={remind.isPending}
              onPress={() =>
                remind.mutate(undefined, {
                  onSuccess: () => { notifySuccess(); showAlert('Reminded', `We nudged ${waitingNames}.`); },
                  onError: (e) => showAlert('Not sent', (e as Error).message),
                })
              }
            />
            <PtButton title="Cancel request" variant="ghost" onPress={() => setCancelling(true)} />
          </>
        ) : (
          <PtButton title="See the outcome" variant="secondary" onPress={() => navigation.navigate('ApprovalOutcome', { approvalId: a.id })} />
        )
      }
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }}>{a.governance ? a.description : `${formatNaira(a.amount)}${a.pays_to ? ` to ${a.pays_to}` : ''}`}</Text>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pending ? pt.ink : pt.inkMuted }}>{pending ? `Waiting for ${waitingNames}` : outcomeChip(a).label}</Text>
        {pending ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
            {[a.paused ? 'Paused while you answer' : expiresIn(a.expires_at), a.reminded_at ? `we reminded them ${dayTime(a.reminded_at)}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <Facts a={a} />
      <PtPanel>
        <PtReviewRow label="Approvals" value={`${a.approvals_count} of ${a.required_approvals}`} sub={a.approver_names?.length ? `Asked: ${a.approver_names.join(', ')}` : null} last />
      </PtPanel>
      <Timeline items={items} />
      <Questions a={a} />
      {pending && openQuestion ? (
        <View style={{ gap: 10 }}>
          <PtField label={`Answer ${openQuestion.by_name ?? 'them'}`} value={answer} onChangeText={setAnswer} maxLength={300} placeholder="Yes, I'll add a photo of it." />
          <PtButton
            title="Send answer"
            variant="secondary"
            disabled={!answer.trim()}
            loading={qa.answer.isPending}
            onPress={() => qa.answer.mutate(answer.trim(), { onSuccess: () => { setAnswer(''); notifySuccess(); }, onError: (e) => showAlert('Not sent', (e as Error).message) })}
          />
        </View>
      ) : null}

      <PtSheet
        visible={cancelling}
        title="Cancel this request?"
        subtitle={`${a.governance ? 'It' : `${formatNaira(a.amount)}${a.pays_to ? ` to ${a.pays_to}` : ''}`} won't be paid. ${waitingNames}'s pending approval is removed.`}
        onClose={() => setCancelling(false)}
        footer={
          <>
            <PtButton
              title="Cancel request"
              style={{ backgroundColor: pt.danger }}
              loading={cancel.isPending}
              onPress={() =>
                cancel.mutate(reason ?? undefined, {
                  onSuccess: () => {
                    setCancelling(false);
                    navigation.replace('ApprovalOutcome', { approvalId: a.id });
                  },
                  onError: (e) => showAlert('Not cancelled', (e as Error).message),
                })
              }
            />
            <PtButton title="Keep it" variant="ghost" onPress={() => setCancelling(false)} />
          </>
        }
      >
        {CANCEL_REASONS.map((r) => (
          <PtChoiceCard key={r} title={r} selected={reason === r} onPress={() => setReason(reason === r ? null : r)} />
        ))}
      </PtSheet>
    </PtPageScreen>
  );
}
