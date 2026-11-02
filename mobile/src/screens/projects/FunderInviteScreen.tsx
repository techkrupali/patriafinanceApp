import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useAcceptInvitation, useDeclineInvitation, useMyInvitations } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { formatNaira, initials } from '../../lib/format';
import { namesList } from '../../lib/projects';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * CTB-02 Funder-approver accepts: who invited you to which project, your
 * roles, what you can do, "2 of 3: Ngozi, Chidi and you", what's next to
 * approve — Accept and verify, or Decline.
 */
export function FunderInviteScreen({ navigation, route }: RootScreenProps<'FunderInvite'>) {
  const { invitationId } = route.params;
  const me = useAuth((s) => s.user);
  const query = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const inv = (query.data ?? []).find((x) => x.id === invitationId);

  if (!inv) {
    return (
      <PtStepScreen onBack={() => navigation.goBack()}>
        {query.isLoading ? <ActivityIndicator color={pt.brand} style={{ marginTop: 40 }} /> : <PtNote>This invitation was answered or has expired.</PtNote>}
      </PtStepScreen>
    );
  }

  const who = inv.inviter?.name ?? 'Someone';
  const first = who.split(' ')[0];
  const pr = inv.project;
  const perms = inv.permissions;
  const fund = inv.role !== 'viewer' && perms?.fund !== false;
  const can = [fund ? 'put money in' : null, inv.can_approve ? 'approve milestones' : null, (perms as { chat?: boolean } | null)?.chat !== false ? 'chat with the builder' : null, perms?.view !== false ? 'see documents and proof' : null].filter(Boolean) as string[];
  const verify = inv.can_approve && (me?.kyc_tier ?? 0) < 2;

  const yes = () =>
    accept.mutate(inv.id, {
      onSuccess: () => {
        notifySuccess();
        if (verify) {
          showAlert('Joined', 'Verify your identity to Tier 2 so your yes can release money.');
          navigation.replace('Kyc');
        } else if (pr) navigation.replace('ProjectDetail', { projectId: pr.id });
        else navigation.goBack();
      },
      onError: (e) => showAlert('Not joined', (e as Error).message),
    });
  const no = () =>
    decline.mutate(inv.id, {
      onSuccess: () => {
        showAlert('Declined', `We told ${first}.`);
        navigation.goBack();
      },
      onError: (e) => showAlert('Not declined', (e as Error).message),
    });

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title={verify ? 'Accept and verify' : 'Accept'} loading={accept.isPending} onPress={yes} />
          <PtButton title="Decline" variant="ghost" loading={decline.isPending} onPress={no} />
        </>
      }
    >
      <PtLogo />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PtAvatar initials={initials(who)} tone="brand" size={52} />
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 17, lineHeight: 24, color: pt.inkMuted }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{first}</Text>
          {' invited you to help with '}
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{pr?.title ?? inv.wallet?.name}</Text>.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PtChip label={inv.role === 'viewer' ? 'Viewer' : 'Contributor'} tone="brand" icon="circle" />
        {inv.can_approve ? <PtChip label="Approver" tone="brand" icon="circle" /> : null}
      </View>
      <PtPanel>
        <PtReviewRow label="You can" value={can.length ? can.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'See the project'} last={!pr} />
        {pr && inv.can_approve ? <PtReviewRow label="Approvals" value={`${pr.approvals.needed} of ${pr.approvals.of}: ${namesList(pr.approvals.names)}`} /> : null}
        {pr?.next ? <PtReviewRow label={inv.can_approve ? 'Next to approve' : 'Next phase'} value={`${pr.next.title} · ${formatNaira(pr.next.amount)}`} last /> : null}
      </PtPanel>
      {verify ? <PtNote tone="attention" icon="shield">Approvers verify to Tier 2, since their yes releases money. It takes a few minutes.</PtNote> : null}
    </PtStepScreen>
  );
}
