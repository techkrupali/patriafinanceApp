import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtLogo } from '../../components/pt/PtLogo';
import { PtText } from '../../components/pt/PtText';
import { PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAjoCode, useJoinAjoCode, type AjoPreview } from '../../api/ajo';
import { useAcceptInvitation, useDeclineInvitation, useMyInvitations } from '../../api/hooks';
import { initials } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * INV-J1 "Mama Chioma invited you to Unity ladies ajo": what you pay, what you
 * receive, the late fee, who has joined, and "Pay automatically from Main".
 * From an invitation, or from a code the organiser shared.
 */
export function AjoJoinScreen({ navigation, route }: RootScreenProps<'AjoJoin'>) {
  const { invitationId, code } = route.params;
  const invitations = useMyInvitations();
  const byCode = useAjoCode(code ?? '');
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const join = useJoinAjoCode();
  const [autoPay, setAutoPay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inv = invitationId ? (invitations.data ?? []).find((i) => i.id === invitationId) : undefined;
  const p: AjoPreview | null | undefined = invitationId ? inv?.ajo : byCode.data;
  const loading = invitationId ? invitations.isLoading : byCode.isLoading;
  const loadError = invitationId ? (invitations.error as Error | null) : (byCode.error as Error | null);

  if (!p) {
    return (
      <PtPageScreen title="Join the circle" onBack={() => navigation.goBack()}>
        {loading || loadError ? (
          <LoadingBlock error={loadError ? loadError.message : null} onRetry={() => void (invitationId ? invitations.refetch() : byCode.refetch())} />
        ) : (
          <PtNote>This invitation is no longer open.</PtNote>
        )}
      </PtPageScreen>
    );
  }

  const organiser = p.organiser.name ?? 'The organiser';
  const joined = (walletId: number) => {
    notifySuccess();
    navigation.popToTop();
    navigation.navigate('Ajo', { walletId });
  };
  const onJoin = () => {
    setError(null);
    if (invitationId) {
      accept.mutate({ invitationId, options: { auto_pay: autoPay } }, { onSuccess: () => joined(p.wallet_id), onError: (e) => setError(e.message) });
    } else {
      join.mutate({ code: p.code, auto_pay: autoPay }, { onSuccess: (r) => joined(r.ajo.wallet_id), onError: (e) => setError(e.message) });
    }
  };
  const closed = p.already_in || (!invitationId && !p.open);

  return (
    <PtPageScreen
      title=""
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          {p.already_in ? (
            <PtButton title="Open the circle" onPress={() => navigation.replace('Ajo', { walletId: p.wallet_id })} />
          ) : (
            <PtButton title="Join the circle" disabled={closed} loading={accept.isPending || join.isPending} onPress={onJoin} />
          )}
          <PtButton
            title="Not now"
            variant="ghost"
            onPress={() => (invitationId ? decline.mutate(invitationId, { onSuccess: () => navigation.goBack() }) : navigation.goBack())}
          />
        </>
      }
    >
      <PtLogo height={30} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PtAvatar initials={initials(organiser)} tone="gold" size={56} />
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 19, lineHeight: 26, color: pt.inkMuted }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{organiser}</Text>
          {invitationId ? ' invited you to ' : ' runs '}
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{p.name}</Text>.
        </Text>
      </View>
      <PtChip label="You: Member" tone="brand" icon="circle" />
      <PtPanel>
        <PtReviewRow label="You pay" value={p.pay_label} sub={p.period_label} />
        <PtReviewRow label="You receive" value={p.receive_label} sub={p.turn_note} />
        <PtReviewRow label="Late fee" value={p.late_fee_label} />
        <PtReviewRow label="Members" value={p.members_label} last />
      </PtPanel>
      {closed && !p.already_in ? <PtNote tone="attention">{p.status === 'forming' ? 'This circle is full.' : 'This circle has already started.'}</PtNote> : null}
      {!closed ? (
        <PtPanel>
          <PtSwitchRow title="Pay automatically from Main" subtitle={autoPay ? p.pay_day_label : 'Off: you pay each round yourself'} value={autoPay} onChange={setAutoPay} />
        </PtPanel>
      ) : null}
      <PtNote icon="lock">Patriai holds the pot and pays out on the day, so nobody holds cash for the group.</PtNote>
    </PtPageScreen>
  );
}
