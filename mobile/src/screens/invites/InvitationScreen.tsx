import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { PtRing } from '../../components/pt/PtRing';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAcceptInvitation, useMyInvitations } from '../../api/hooks';
import { useAskForNewInvite, useInvite, type InvitePreview } from '../../api/invites';
import { useAuth } from '../../store/auth';
import { formatNaira, initials } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

function Line({ text, ok }: { text: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10 }}>
      <Feather name={ok ? 'check' : 'x'} size={18} color={ok ? pt.brand : pt.inkMuted} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, lineHeight: 22, color: ok ? pt.ink : pt.inkMuted }}>{text}</Text>
    </View>
  );
}

/**
 * FAM-06 "Ngozi Okafor invited you to join…", INV-K1 "Ngozi asked you to be a
 * keyholder…", INV-A1 "…gave you read-only access to prepare the family's tax
 * and records", and INV-04 when the invite has expired or went to another
 * number. Ajo, joint, project and savings invites have their own screens.
 */
export function InvitationScreen({ navigation, route }: RootScreenProps<'Invitation'>) {
  const { invitationId, code, decline } = route.params;
  const me = useAuth((s) => s.user);
  const mine = useMyInvitations();
  const byCode = useInvite(code);
  const accept = useAcceptInvitation();
  const ask = useAskForNewInvite();
  const fromList = invitationId ? (mine.data ?? []).find((i) => i.id === invitationId)?.preview : undefined;
  const p: InvitePreview | null | undefined = code ? byCode.data : fromList;
  const first = p?.inviter?.first_name ?? 'them';

  // Some invites have their own journey.
  useEffect(() => {
    if (!p || p.status !== 'pending' || p.for_you === false) return;
    if (decline) navigation.replace('DeclineInvite', { invitationId: p.id, inviter: first });
    else if (p.kind === 'ajo') navigation.replace('AjoJoin', { invitationId: p.id });
    else if (p.kind === 'joint' || p.kind === 'project' || p.kind === 'savings') navigation.replace('Invitations');
  }, [p, decline, first, navigation]);

  if (!p) {
    const err = (code ? byCode.error : mine.error) as Error | null;
    return (
      <PtPageScreen title="Invitation" onBack={() => navigation.goBack()}>
        <LoadingBlock error={err ? err.message : (invitationId && mine.isSuccess ? 'This invitation is no longer waiting.' : null)} onRetry={() => void (code ? byCode.refetch() : mine.refetch())} />
      </PtPageScreen>
    );
  }

  // ---------------------------------------------------------------- INV-04
  if (p.status !== 'pending' || p.for_you === false) {
    const wrong = p.status === 'pending' && p.for_you === false;
    const title = wrong ? 'This invite is for another number' : p.status === 'accepted' ? "You've already joined" : p.status === 'declined' ? 'This invite was declined' : p.status === 'cancelled' ? 'This invite was cancelled' : 'This invite has expired';
    return (
      <PtPageScreen
        title=""
        onBack={() => navigation.goBack()}
        footer={
          <>
            {p.status === 'accepted' ? (
              <PtButton title={`Open ${p.wallet.name}`} onPress={() => navigation.replace('WalletDetail', { walletId: p.wallet.id })} />
            ) : (
              <PtButton
                title={`Ask ${first} for a new invite`}
                loading={ask.isPending}
                onPress={() => p.code && ask.mutate(p.code, { onSuccess: () => { notifySuccess(); showAlert('Asked', `We've told ${first}. Their new invite will show here.`); navigation.goBack(); }, onError: (e) => showAlert('Not sent', e.message) })}
              />
            )}
            <PtButton title="Close" variant="ghost" onPress={() => navigation.goBack()} />
          </>
        }
      >
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FDEBC8', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={wrong ? 'phone-off' : 'clock'} size={30} color="#8F5400" />
          </View>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 26, lineHeight: 32, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">{title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted, textAlign: 'center' }}>
            {wrong
              ? `${first}'s invite went to ${p.sent_to}. Log in with that number to open it.`
              : p.status === 'expired'
                ? `Invites last 7 days. Ask ${first} to send a new one. We can remind them for you.`
                : `Ask ${first} to send a new one if you need it.`}
          </Text>
        </View>
        {wrong ? <PtNote>If the invite was meant for a different phone number, it won't open here. That keeps family wallets safe.</PtNote> : null}
      </PtPageScreen>
    );
  }

  const isKeyholder = p.kind === 'keyholder';
  const isAccountant = p.kind === 'accountant';
  const needsTier = isKeyholder && (p.keyholder_info?.your_tier ?? me?.kyc_tier ?? 0) < (p.keyholder_info?.needs_tier ?? 2);

  const onAccept = () =>
    accept.mutate(p.id, {
      onSuccess: () => {
        notifySuccess();
        if (isKeyholder) navigation.replace(needsTier ? 'KeyholderVerify' : 'KeyholderDone', { walletId: p.wallet.id });
        else if (isAccountant) navigation.replace('WalletStatement', { walletId: p.wallet.id });
        else navigation.replace('WalletDetail', { walletId: p.wallet.id });
      },
      onError: (e) => showAlert('Not joined', e.message),
    });

  const headline = isKeyholder
    ? [first, ' asked you to be a keyholder for ', p.wallet.name, '.']
    : isAccountant
      ? [p.inviter?.name ?? first, " gave you read-only access to prepare the family's tax and records.", '', '']
      : [p.inviter?.name ?? first, ' invited you to join ', p.wallet.name, '.'];

  return (
    <PtPageScreen
      title=""
      onBack={() => navigation.goBack()}
      footer={
        <>
          <PtButton title={isKeyholder ? (needsTier ? 'Accept and verify' : 'Accept') : isAccountant ? 'Accept access' : 'Join'} loading={accept.isPending} onPress={onAccept} />
          <PtButton title="Decline" variant="ghost" onPress={() => navigation.navigate('DeclineInvite', { invitationId: p.id, inviter: first })} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PtAvatar initials={initials(p.inviter?.name ?? '?')} tone="gold" size={56} />
        <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 19, lineHeight: 26, color: pt.inkMuted }}>
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{headline[0]}</Text>
          {headline[1]}
          <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>{headline[2]}</Text>
          {headline[3]}
        </Text>
      </View>

      {p.progress && !isKeyholder && !isAccountant ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <PtRing percent={p.progress.percent} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{p.wallet.name}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
              {`${formatNaira(p.progress.balance)} of ${formatNaira(p.progress.target)}${p.progress.due ? ` · due ${p.progress.due}` : ''}`}
            </Text>
          </View>
        </View>
      ) : null}

      <PtChip label={`You: ${p.role_label}`} tone="brand" icon="circle" />
      {isKeyholder ? <PtGroupLabel>What a keyholder does</PtGroupLabel> : null}
      <PtPanel>
        {p.can.map((t) => <Line key={t} text={t} ok />)}
        {p.cannot.map((t) => <Line key={t} text={t} ok={false} />)}
      </PtPanel>
      {p.note ? <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 22, color: pt.ink }}>{`"${p.note}"`}</Text> : null}

      {isAccountant && p.accountant ? (
        <PtPanel>
          <PtReviewRow label="Access ends" value={p.accountant.access_until_label ?? '—'} sub={`${first} can end it any time`} />
          <PtReviewRow label="Signed in as" value={me?.full_name ?? '—'} last />
        </PtPanel>
      ) : null}
      {needsTier ? <PtNote icon="lock">Keyholders release money, so Patriai needs your BVN and NIN. It takes about 3 minutes.</PtNote> : null}
      {!isKeyholder && !isAccountant ? <PtNote>Joining takes about two minutes with your phone number. Works with numbers outside Nigeria too.</PtNote> : null}
      {p.expires_label ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, textAlign: 'center' }}>{`This invite expires ${p.expires_label.toLowerCase()}.`}</Text> : null}
    </PtPageScreen>
  );
}
