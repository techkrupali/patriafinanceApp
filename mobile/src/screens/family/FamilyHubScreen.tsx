import React from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { LogoMark } from '../../components/pt/PtLogo';
import { LoadError } from '../../components/LoadError';
import { useCancelInvitation, useFamily, useResendInvitation, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { agoLabel, initials } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { roleLabel } from '../../lib/governance';
import { inviteTarget } from '../../lib/invite';
import { notifySuccess, selection } from '../../lib/haptics';
import type { FamilyInvitation, FamilyMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const LEAD_ROLES = ['owner', 'co_owner', 'admin'];

/** "4 wallets · approves" or the one wallet's name. */
function memberSubtitle(m: FamilyMember): string {
  const approves = m.memberships.some((ms) => ms.can_approve) ? ' · approves' : '';
  if (m.memberships.length === 1) return `${m.memberships[0].wallet_name}${approves}`;
  return `${m.memberships.length} wallets${approves}`;
}

const showIdentifier = (id: string) => (id.startsWith('+') ? formatE164(id) : id);

/** Someone who is only in child wallets, and not as a parent, is a child. */
function memberRole(m: FamilyMember): string {
  const onlyChild = m.memberships.length > 0 && m.memberships.every((ms) => ms.wallet_type === 'child');
  return onlyChild && !LEAD_ROLES.includes(m.role) ? 'Child' : roleLabel(m.role);
}

/** A sent invite: dashed avatar, who and where, Resend, and × to cancel it. */
function SentInviteRow({ inv, last }: { inv: FamilyInvitation; last: boolean }) {
  const resend = useResendInvitation();
  const cancel = useCancelInvitation(inv.wallet_id);

  const confirmCancel = () => {
    selection();
    Alert.alert('Cancel this invite?', `${showIdentifier(inv.invited_identifier)} won't be able to join ${inv.wallet_name ?? 'the wallet'}.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel invite',
        style: 'destructive',
        onPress: () => cancel.mutate(inv.id, { onError: (e) => Alert.alert('Could not cancel', e.message) }),
      },
    ]);
  };

  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: pt.line,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: pt.lineStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="user-plus" size={16} color={pt.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 22, color: pt.ink }} numberOfLines={1}>
          {showIdentifier(inv.invited_identifier)}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }} numberOfLines={2}>
          {roleLabel(inv.role)} · {inv.wallet_name ?? 'A wallet'} · invited {agoLabel(inv.created_at)}
        </Text>
      </View>
      <PtButton
        title="Resend"
        variant="ghost"
        size="sm"
        loading={resend.isPending}
        style={{ paddingHorizontal: 8 }}
        onPress={() =>
          resend.mutate(
            { walletId: inv.wallet_id, invitationId: inv.id },
            {
              onSuccess: () => {
                notifySuccess();
                Alert.alert('Invite sent again', `${showIdentifier(inv.invited_identifier)} has another 7 days to join.`);
              },
              onError: (e) => Alert.alert('Could not resend', e.message),
            },
          )
        }
      />
      <Pressable
        onPress={confirmCancel}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Cancel invite"
        style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: -6 }}
      >
        <Feather name="x" size={18} color={pt.inkSubtle} />
      </Pressable>
    </View>
  );
}

/**
 * Family tab (prototype FAM-01): the family circle, everyone in it with their
 * role, invitations waiting for you, and invites you've sent (Resend). Also
 * opened from other screens as "FamilyHub", with a back button.
 */
export function FamilyHubScreen({ navigation, route }: RootScreenProps<'FamilyHub'>) {
  const isTab = route?.name !== 'FamilyHub';
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const wallets = useWallets();

  const data = family.data;
  const members = data?.members ?? [];
  const received = data?.pending_invitations.received ?? [];
  const sent = data?.pending_invitations.sent ?? [];
  const surname = (me?.last_name || me?.full_name?.split(' ').slice(-1)[0] || 'My').trim();

  const startInvite = () => {
    const t = inviteTarget(wallets.data);
    if (t.screen === 'InviteMember') navigation.navigate(t.screen, t.params);
    else navigation.navigate(t.screen);
  };

  return (
    <PtTabScreen
      title="Family"
      gap={18}
      onBack={isTab ? undefined : () => navigation.goBack()}
      action={<PtButton title="Invite" variant="secondary" size="sm" onPress={startInvite} />}
      refreshing={family.isRefetching}
      onRefresh={() => {
        void family.refetch();
        void wallets.refetch();
      }}
    >
      {family.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 48 }} />
      ) : family.error ? (
        <LoadError message={(family.error as Error).message} onRetry={() => void family.refetch()} />
      ) : (
        <>
          {/* The circle */}
          <View
            style={{
              backgroundColor: pt.raised,
              borderRadius: ptRadius.md,
              paddingVertical: 18,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <LogoMark size={64} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 24, color: pt.ink }} numberOfLines={1}>
                {surname} family circle
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                {members.length + 1} member{members.length === 0 ? '' : 's'} · {data?.stats.shared_wallets ?? 0} shared wallet
                {(data?.stats.shared_wallets ?? 0) === 1 ? '' : 's'}
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                Owner: you ·{' '}
                <Text
                  onPress={() => {
                    selection();
                    navigation.navigate('Activity');
                  }}
                  style={{ fontFamily: ptFont.bold, color: pt.brand }}
                >
                  Activity
                </Text>
              </Text>
            </View>
          </View>

          {/* Members, you first */}
          <View style={{ gap: 8 }}>
            <PtSectionTitle title="Members" />
            <PtCard>
              <PtRow
                minHeight={64}
                last={members.length === 0}
                left={<PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} />}
                title={`${me?.full_name ?? 'You'} (you)`}
                subtitle={`${wallets.data?.length ?? 0} wallet${(wallets.data?.length ?? 0) === 1 ? '' : 's'}`}
                right={<PtChip label="Owner" tone="brand" />}
              />
              {members.map((m, i) => (
                <PtRow
                  key={m.id}
                  minHeight={64}
                  last={i === members.length - 1}
                  left={<PtAvatar initials={m.avatar || initials(m.name)} tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />}
                  title={m.name}
                  subtitle={memberSubtitle(m)}
                  right={<PtChip label={memberRole(m)} tone={LEAD_ROLES.includes(m.role) ? 'brand' : 'neutral'} />}
                  onPress={() => navigation.navigate('FamilyMember', { memberId: m.id })}
                />
              ))}
            </PtCard>
            {members.length === 0 ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                It's just you so far. Invite a spouse, children, relatives or a vendor into a wallet and they'll show here.
              </Text>
            ) : null}
          </View>

          {/* Invitations waiting for you */}
          {received.length > 0 ? (
            <View style={{ gap: 8 }}>
              <PtSectionTitle title="Invitations for you" />
              <PtCard>
                {received.map((inv, i) => (
                  <PtRow
                    key={inv.id}
                    minHeight={64}
                    last={i === received.length - 1}
                    left={<PtAvatar initials={initials(inv.inviter?.name)} tone="mint" />}
                    title={`${inv.inviter?.name ?? 'Someone'} invited you`}
                    subtitle={`${roleLabel(inv.role)} · ${inv.wallet_name ?? 'A wallet'}`}
                    right={<PtChip label="Review" tone="warning" />}
                    onPress={() => navigation.navigate('Invitations')}
                  />
                ))}
              </PtCard>
            </View>
          ) : null}

          {/* Invites you've sent */}
          {sent.length > 0 ? (
            <View style={{ gap: 8 }}>
              <PtSectionTitle title={sent.length === 1 ? 'Pending invite' : 'Pending invites'} />
              <PtCard>
                {sent.map((inv, i) => (
                  <SentInviteRow key={inv.id} inv={inv} last={i === sent.length - 1} />
                ))}
              </PtCard>
            </View>
          ) : null}
        </>
      )}
    </PtTabScreen>
  );
}
