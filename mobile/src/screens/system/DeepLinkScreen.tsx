import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPanel } from '../../components/pt/PtForm';
import { useApproval, useReferralLookup, useUserSearch } from '../../api/hooks';
import { useMoneyRequest } from '../../api/requests';
import { useSendDraft } from '../../store/sendDraft';
import { useAppLock } from '../../store/appLock';
import type { DeepLink } from '../../lib/deepLinks';
import type { RootScreenProps } from '../../navigation/types';

const KINDS: { kind: DeepLink['kind']; icon: React.ComponentProps<typeof Feather>['name']; title: string; sub: string }[] = [
  { kind: 'invite', icon: 'user', title: 'Invite link', sub: 'Opens the invitation' },
  { kind: 'moneyRequest', icon: 'arrow-down', title: 'Payment request', sub: 'Opens pay or decline' },
  { kind: 'referral', icon: 'archive', title: 'Referral link', sub: 'Fills in the code at sign-up' },
];

/** The logo's ring turning, with the gold seed still (the prototype's loader). */
function Spinner() {
  const reduceMotion = useAppLock((s) => s.reduceMotion);
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn, reduceMotion]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Opening">
      <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 5, borderColor: pt.brandSoft }} />
      <Animated.View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 5, borderColor: 'transparent', borderTopColor: pt.brand, borderRightColor: pt.brand, transform: [{ rotate }] }} />
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pt.gold500 }} />
    </View>
  );
}

/**
 * SYS-08 Deep-link landing: "Opening Ngozi's request…" while we find what the
 * link points at, then the right screen — the invitation, the request to pay
 * or decline, or the referral code. Reached only after sign-in and the PIN.
 */
export function DeepLinkScreen({ route, navigation }: RootScreenProps<'DeepLink'>) {
  const { link } = route.params;
  const approval = useApproval(link.kind === 'request' ? link.id : 0);
  const asked = useMoneyRequest(link.kind === 'moneyRequest' ? link.code : '');
  const lookup = useReferralLookup();
  const code = link.kind === 'referral' ? link.code : null;
  // QR-01 pay link: the person behind the @tag.
  const people = useUserSearch(link.kind === 'pay' ? link.tag : '');
  const payee = link.kind === 'pay' ? (people.data ?? []).find((u) => (u.username ?? '').toLowerCase() === link.tag.toLowerCase()) : undefined;
  const draft = useSendDraft();

  useEffect(() => {
    if (code) lookup.mutate(code);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the screen once we know what the link is (a short beat so the landing reads).
  const ready =
    link.kind === 'invite' || (link.kind === 'request' && approval.isSuccess) || (link.kind === 'moneyRequest' && asked.isSuccess) || (link.kind === 'referral' && (lookup.isSuccess || lookup.isError)) || (link.kind === 'pay' && Boolean(payee));
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (link.kind === 'invite') {
        if (link.code) navigation.replace('Invitation', { code: link.code, decline: link.decline });
        else navigation.replace('Invitations');
      }
      else if (link.kind === 'request') navigation.replace('ApprovalDetail', { approvalId: link.id });
      else if (link.kind === 'moneyRequest') navigation.replace('IncomingRequest', { code: link.code });
      else if (link.kind === 'pay' && payee) {
        draft.start();
        draft.setRecipient({ kind: 'user', name: payee.full_name, identifier: `@${payee.username}`, sub: `Patriai · @${payee.username}`, avatarUrl: payee.avatar_url });
        if (link.amount) draft.setAmount(link.amount);
        navigation.replace('SendAmount');
      } else if (link.kind === 'referral') navigation.replace('Referral', { code: link.code });
    }, 700);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const who =
    link.kind === 'request'
      ? approval.data?.initiator.name.split(' ')[0]
      : link.kind === 'moneyRequest'
        ? asked.data?.requester.first_name
        : link.kind === 'referral' ? lookup.data?.from.split(' ')[0] : link.kind === 'pay' ? payee?.full_name.split(' ')[0] : null;
  const title =
    link.kind === 'invite'
      ? 'Opening your invitation…'
      : link.kind === 'request' || link.kind === 'moneyRequest'
        ? who ? `Opening ${who}'s request…` : 'Opening the request…'
        : link.kind === 'pay'
          ? who ? `Paying ${who}…` : 'Opening the payment…'
          : who ? `Opening ${who}'s code…` : 'Opening the code…';
  const failed = (link.kind === 'request' && approval.isError) || (link.kind === 'moneyRequest' && asked.isError) || (link.kind === 'pay' && people.isSuccess && !payee);

  return (
    <PtStepScreen
      onBack={failed ? () => navigation.goBack() : undefined}
      gap={20}
      footer={failed ? <PtButton title="Go home" onPress={() => navigation.goBack()} /> : undefined}
    >
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
        {failed ? (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: pt.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="link-2" size={24} color={pt.danger} />
          </View>
        ) : (
          <Spinner />
        )}
        <PtText variant="headline" style={{ fontSize: 24, lineHeight: 30, textAlign: 'center' }} accessibilityRole="header">
          {failed ? "This link didn't open" : title}
        </PtText>
        <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 320 }}>
          {failed
            ? link.kind === 'pay'
              ? 'No one on Patriai has that @tag. Ask them to show their code again.'
              : 'The request may be finished already, or it was sent to someone else. Ask the sender to share it again.'
            : 'Links for invites, payment requests and referrals open the right screen, after your PIN.'}
        </PtText>
      </View>
      <PtPanel>
        {KINDS.map((k, i) => (
          <View
            key={k.kind}
            accessibilityState={{ selected: k.kind === link.kind || (k.kind === 'moneyRequest' && link.kind === 'request') }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === KINDS.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
          >
            <View style={{ width: 36, height: 36, borderRadius: ptRadius.sm, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={k.icon} size={17} color={pt.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{k.title}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{k.sub}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={pt.inkMuted} />
          </View>
        ))}
      </PtPanel>
    </PtStepScreen>
  );
}
