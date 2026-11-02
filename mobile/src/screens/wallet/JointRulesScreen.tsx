import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useJointActions, useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { JointChangeSheet, type JointPart } from '../../components/joint/JointChangeSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { contributionLine, splitShort } from '../../lib/joint';
import { formatNaira, initials } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { JointChanges } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/**
 * WAL-19 Joint wallet rules: a change the other proposed (Decline / Approve),
 * then Contributions, Spend alone and If one leaves, each with Edit. "Any change
 * you make here goes to Emeka to approve, just like his comes to you."
 */
export function JointRulesScreen({ navigation, route }: RootScreenProps<'JointRules'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const q = useWallet(walletId);
  const actions = useJointActions(walletId);
  const [part, setPart] = useState<JointPart | null>(null);
  const [pending, setPending] = useState<{ kind: 'propose'; changes: JointChanges } | { kind: 'answer'; agree: boolean } | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const wallet = q.data?.wallet;
  const j = wallet?.joint;

  if (!wallet || !j) {
    return (
      <PtPageScreen title="Joint rules" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const iAmOwner = wallet.owner ? wallet.owner.id === me?.id : true;
  const other = iAmOwner ? j.partner?.name : wallet.owner?.name;
  const otherName = (other ?? j.proposal?.by_name ?? 'your partner').split(/\s+/)[0];
  const open = j.state === 'open' || j.state === 'leaving';
  const proposal = j.proposal;
  const theirs = proposal && proposal.by !== me?.id;
  const canEdit = open && !proposal && !j.closing;
  const [yours, others] = iAmOwner ? [j.contribution.mine, j.contribution.partner] : [j.contribution.partner, j.contribution.mine];
  const both = [j.always.new_account ? 'New accounts' : null, j.always.personal ? 'moving money out' : null, j.always.rules ? 'rule changes' : null].filter(Boolean).join(', ');

  const run = (pin: string) => {
    if (!pending) return;
    setPinError(null);
    const fail = (e: Error) => setPinError(e.message);
    if (pending.kind === 'propose') {
      actions.propose.mutate(
        { pin, changes: pending.changes },
        {
          onSuccess: (r) => {
            notifySuccess();
            setPending(null);
            showAlert(r.applied ? 'Rules changed' : `Sent to ${otherName}`, r.applied ? 'Both of you have been told.' : `It changes once ${otherName} agrees.`);
          },
          onError: fail,
        },
      );
    } else {
      actions.answer.mutate(
        { pin, agree: pending.agree },
        {
          onSuccess: () => {
            notifySuccess();
            setPending(null);
            showAlert(pending.agree ? 'Rules changed' : 'Change declined', `${otherName} has been told.`);
          },
          onError: fail,
        },
      );
    }
  };

  return (
    <PtPageScreen title={wallet.name} subtitle="Joint · rules" onBack={() => navigation.goBack()}>
      {proposal ? (
        <View style={{ backgroundColor: '#FDEBC8', borderRadius: ptRadius.md, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PtAvatar initials={initials(theirs ? (other ?? proposal.by_name ?? '') : `${me?.first_name ?? ''} ${me?.last_name ?? ''}`)} size={40} tone="gold" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{theirs ? `${otherName} ${proposal.before_accept ? 'suggested' : 'proposed'} a change` : `Waiting for ${otherName} to agree`}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{proposal.summary}</Text>
            </View>
          </View>
          {theirs ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PtButton title="Decline" variant="secondary" size="sm" style={{ flex: 1, backgroundColor: pt.raised }} onPress={() => setPending({ kind: 'answer', agree: false })} />
              <PtButton title="Approve" size="sm" style={{ flex: 1 }} onPress={() => setPending({ kind: 'answer', agree: true })} />
            </View>
          ) : null}
        </View>
      ) : null}

      <PtPanel>
        <PtReviewRow
          label="Contributions"
          value={contributionLine(yours, others, j.contribution.day)}
          sub={Number(yours) === Number(others) ? null : `You ${formatNaira(yours)} · ${otherName} ${formatNaira(others)}`}
          onEdit={canEdit ? () => setPart('contribution') : undefined}
        />
        <PtReviewRow
          label="Spend alone"
          value={`Up to ${formatNaira(j.limits.per_payment)} a payment`}
          sub={`${formatNaira(j.limits.per_day)} a day each · above that, the other has ${j.expiry_hours} hours to say yes`}
          onEdit={canEdit ? () => setPart('spend') : undefined}
        />
        {both ? <PtReviewRow label="Always both" value={both} /> : null}
        <PtReviewRow label="Notifications" value="Every payment, both of you" sub={j.notify.big_payment ? `Big payment alert over ${formatNaira(j.notify.big_amount)}` : null} />
        <PtReviewRow
          label="If one leaves"
          value={splitShort(j.leave.split)}
          sub={j.leave.notice_days ? `${j.leave.notice_days} days' notice` : 'No notice'}
          onEdit={canEdit ? () => setPart('leave') : undefined}
          last
        />
      </PtPanel>
      <PtNote>{j.always.rules ? `Any change you make here goes to ${otherName} to approve, just like theirs comes to you.` : 'Changes apply straight away, and both of you are told who made them.'}</PtNote>

      <JointChangeSheet
        part={part}
        joint={j}
        viewerIsPartner={!iAmOwner}
        otherName={otherName}
        submitTitle={j.always.rules ? `Send to ${otherName}` : 'Change it'}
        onSubmit={(changes) => {
          setPart(null);
          setPending({ kind: 'propose', changes });
        }}
        onClose={() => setPart(null)}
      />
      <PinSheet
        visible={pending !== null}
        title="Enter your PIN"
        subtitle={pending?.kind === 'answer' ? (pending.agree ? 'To approve the change' : 'To decline the change') : 'To change the joint rules'}
        loading={actions.propose.isPending || actions.answer.isPending}
        error={pinError}
        onSubmit={run}
        onClose={() => setPending(null)}
      />
    </PtPageScreen>
  );
}
