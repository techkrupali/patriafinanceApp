import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useApproveRelease } from '../../api/projectFlow';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock, PersonRow } from '../../components/project/ProjectUi';
import { formatNaira, initials } from '../../lib/format';
import { namesList } from '../../lib/projects';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import type { RootScreenProps } from '../../navigation/types';
import { showAlert } from '../../lib/alert';

/**
 * PRJ-07 Release payment: what's paid now and what's held back, from the
 * project wallet to the verified business account, who approves — then
 * "Approve with PIN".
 */
export function ReleasePaymentScreen({ navigation, route }: RootScreenProps<'ReleasePayment'>) {
  const { projectId, milestoneId } = route.params;
  const query = useProject(projectId);
  const me = useAuth((s) => s.user);
  const approve = useApproveRelease();
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const m = query.data?.milestones.find((x) => x.id === milestoneId);
  const p = query.data?.project;

  if (!query.data || !m || !p) {
    return (
      <PtPageScreen title="Release payment" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const retention = p.setup?.release?.retention_percent ?? 0;
  const months = p.setup?.release?.retention_months ?? 3;
  const after = Math.max(0, Number(p.in_wallet) - Number(m.release_now));
  const approvers = m.approval?.approvers ?? p.approvers.map((a) => ({ ...a, said_yes: false, asked_at: null }));
  const needsAll = (m.approval?.required ?? 1) > 1;
  const others = approvers.filter((a) => a.id !== me?.id && !a.said_yes);
  const verified = Boolean(p.vendor?.verified);

  const submit = (pin: string) => {
    setPinError(null);
    approve.mutate(
      { milestoneId, pin },
      {
        onSuccess: (r) => {
          setPinOpen(false);
          if (r.milestone.status === 'released') {
            showAlert('Payment released', `${formatNaira(r.milestone.paid_now ?? m.release_now)} is on its way to ${p.vendor?.name ?? 'the builder'}.`);
          } else {
            showAlert('Approved', `We've asked ${namesList(others.map((o) => o.first_name)) || 'the other approvers'} to approve too. It's paid once they do.`);
          }
          navigation.navigate('ProjectDetail', { projectId });
        },
        onError: (e) => {
          const err = e as ApiError;
          if (err.errors?.pin) setPinError(err.errors.pin[0]);
          else {
            setPinOpen(false);
            showAlert('Not released', err.message);
          }
        },
      },
    );
  };

  return (
    <PtPageScreen
      title="Release payment"
      subtitle={m.title}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Approve with PIN" onPress={() => setPinOpen(true)} disabled={!verified} />}
    >
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 12 }}>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1.2, color: pt.ink }}>{formatNaira(m.release_now)}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>to {p.vendor?.name ?? 'the builder'}</Text>
      </View>
      <PtPanel>
        <PtReviewRow label="Milestone" value={formatNaira(m.amount)} />
        {Number(m.hold_back) > 0 ? <PtReviewRow label={`Held back (${retention}%)`} value={formatNaira(m.hold_back)} sub={`Released ${months} month${months === 1 ? '' : 's'} after handover`} /> : null}
        <PtReviewRow label="From" value={p.title} sub={`${formatNaira(p.in_wallet)} → ${formatNaira(after)}`} />
        <PtReviewRow
          label="To"
          value={`${p.vendor?.name ?? 'The builder'}${p.vendor?.account_last4 ? ` · •••• ${p.vendor.account_last4}` : ''}`}
          sub={verified ? 'Verified business account' : 'Not verified yet'}
          last
        />
      </PtPanel>
      {!verified ? <PtNote tone="attention">{`${p.vendor?.name ?? 'This business'} isn't verified yet, so it can't be paid. Patriai checks businesses within a working day.`}</PtNote> : null}
      <PtPanel>
        {approvers.map((a, i) => {
          const isMe = a.id === me?.id;
          return (
            <PersonRow
              key={a.id}
              initials={initials(a.name)}
              tone={i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
              name={isMe ? `${a.first_name} (you)` : a.first_name}
              sub={isMe ? 'Approving now' : a.said_yes ? 'Approved' : needsAll ? (a.asked_at ? 'Asked' : 'Will be asked') : 'Can approve too'}
              chip={isMe || a.said_yes ? { label: 'Yes', tone: 'success', icon: 'check' } : needsAll ? { label: 'Waiting', tone: 'warning', icon: 'clock' } : null}
              last={i === approvers.length - 1}
            />
          );
        })}
      </PtPanel>
      <PinSheet
        visible={pinOpen}
        title="Approve with PIN"
        subtitle={`${m.title} · ${p.title}`}
        amount={formatNaira(m.release_now)}
        recipient={p.vendor?.name}
        loading={approve.isPending}
        error={pinError}
        onSubmit={submit}
        onClose={() => setPinOpen(false)}
      />
    </PtPageScreen>
  );
}
