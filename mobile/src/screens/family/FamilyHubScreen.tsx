import React, { useEffect, useState } from 'react';
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
import { useAnswerTransfer, useMoveWalletToCircle } from '../../api/circles';
import { useCircleStore } from '../../store/circle';
import { PtNote } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { CircleSwitcherSheet } from './CircleSwitcherSheet';
import { showAlert } from '../../lib/alert';
import { useAuth } from '../../store/auth';
import { agoLabel, initials } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { roleLabel } from '../../lib/governance';
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
  const circleId = useCircleStore((s) => s.circleId);
  const setCircle = useCircleStore((s) => s.setCircle);
  const family = useFamily({ circle: circleId });
  const wallets = useWallets();
  const answer = useAnswerTransfer(circleId);
  const move = useMoveWalletToCircle();
  const [switching, setSwitching] = useState(false);
  const [moving, setMoving] = useState(false);

  // A circle you left (or that was handed on) goes back to your own family.
  useEffect(() => {
    if (circleId && family.error) setCircle(null);
  }, [circleId, family.error, setCircle]);

  const data = family.data;
  const members = data?.members ?? [];
  const received = data?.pending_invitations.received ?? [];
  const sent = data?.pending_invitations.sent ?? [];
  const surname = (me?.last_name || me?.full_name?.split(' ').slice(-1)[0] || 'My').trim();
  const circle = data?.circle;
  const circleName = circle ? (circle.is_home ? `${circle.name} circle` : circle.name) : `${surname} family circle`;
  const iOwn = !circle || circle.my_role === 'owner';
  const transfer = circle?.transfer ?? null;
  // Wallets you could share in this circle ("Nothing is shared unless you move it").
  const movable = (wallets.data ?? []).filter((w) => w.my_role === 'owner' && !['main', 'ajo'].includes(w.type) && w.status === 'active' && (w.circle_id ?? null) !== (circle?.is_home ? null : circle?.id ?? null));
  const inCircle = circle ? (wallets.data ?? []).filter((w) => circle.wallet_ids.includes(w.id)) : [];

  // FAM-03 "Invite to Okafor family: What will they do?"
  const startInvite = () => navigation.navigate('InviteRole', { circleId: circle && !circle.is_home ? circle.id : null });
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '');

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
          {/* The circle (HOM-06: tap its name to switch) */}
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
              <Pressable
                onPress={() => {
                  selection();
                  setSwitching(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${circleName}. Switch circle`}
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ flexShrink: 1, fontFamily: ptFont.bold, fontSize: 17, lineHeight: 24, color: pt.ink }} numberOfLines={1}>
                  {circleName}
                </Text>
                <Feather name="chevron-down" size={18} color={pt.inkMuted} />
              </Pressable>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                {members.length + 1} member{members.length === 0 ? '' : 's'} ·{' '}
                <Text
                  onPress={() => {
                    selection();
                    navigation.navigate('CircleView', { circleId });
                  }}
                  style={{ fontFamily: ptFont.bold, color: pt.brand }}
                >
                  {data?.stats.shared_wallets ?? 0} shared wallet{(data?.stats.shared_wallets ?? 0) === 1 ? '' : 's'}
                </Text>
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                Owner: {iOwn ? 'you' : circle?.owner.first_name ?? circle?.owner.name ?? '—'} ·{' '}
                <Text
                  onPress={() => {
                    selection();
                    navigation.navigate('FamilyActivity', { circleId });
                  }}
                  style={{ fontFamily: ptFont.bold, color: pt.brand }}
                >
                  Activity
                </Text>
              </Text>
            </View>
          </View>

          {/* FAM-12: a hand-over on its way. */}
          {transfer ? (
            transfer.for_you && !transfer.accepted_at ? (
              <PtNote tone="attention">
                {`${circle?.owner.first_name ?? 'The owner'} wants to hand you ${circle?.name}. You'd own the circle; their wallets and money stay theirs.`}
              </PtNote>
            ) : (
              <PtNote tone="info">
                {transfer.accepted_at
                  ? `${transfer.for_you ? 'You own' : `${transfer.to.name} owns`} ${circle?.name} from ${when(transfer.effective_at)}.${iOwn ? ' You can cancel until then.' : ''}`
                  : `Waiting for ${transfer.to.name} to accept, by ${when(transfer.accept_by)}.`}
              </PtNote>
            )
          ) : null}
          {transfer && (transfer.for_you || iOwn) ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {transfer.for_you && !transfer.accepted_at ? (
                <View style={{ flex: 1 }}>
                  <PtButton
                    title="Accept"
                    size="sm"
                    loading={answer.isPending}
                    onPress={() => answer.mutate('accept', { onSuccess: () => { notifySuccess(); showAlert('Accepted', `It's yours in 24 hours. ${circle?.owner.first_name ?? 'They'} can cancel until then.`); }, onError: (e) => showAlert('Not accepted', e.message) })}
                  />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <PtButton
                  title={transfer.for_you && !transfer.accepted_at ? 'Not now' : 'Cancel hand-over'}
                  size="sm"
                  variant="secondary"
                  loading={answer.isPending}
                  onPress={() => answer.mutate('cancel', { onSuccess: () => showAlert('Cancelled', `${circle?.name} stays as it is.`), onError: (e) => showAlert('Not cancelled', e.message) })}
                />
              </View>
            </View>
          ) : null}

          {/* A new circle has no wallets yet. */}
          {circle && !circle.is_home && circle.wallet_ids.length === 0 ? (
            <View style={{ gap: 10 }}>
              <PtNote tone="info">{`No wallets in ${circle.name} yet. Each circle keeps its own wallets: move one in, then invite people.`}</PtNote>
              {iOwn ? <PtButton title="Move a wallet here" variant="secondary" onPress={() => (movable.length ? setMoving(true) : showAlert('No wallet to move', 'Make a wallet first, then move it here from its settings.'))} /> : null}
            </View>
          ) : null}

          {/* Members, you first */}
          <View style={{ gap: 8 }}>
            <PtSectionTitle title="Members" />
            <PtCard>
              <PtRow
                minHeight={64}
                last={members.length === 0}
                left={<PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} />}
                title={`${me?.full_name ?? 'You'} (you)`}
                subtitle={circle && !circle.is_home ? `${inCircle.length} wallet${inCircle.length === 1 ? '' : 's'} here` : `${wallets.data?.length ?? 0} wallet${(wallets.data?.length ?? 0) === 1 ? '' : 's'}`}
                right={<PtChip label={roleLabel(circle?.my_role ?? 'owner')} tone="brand" />}
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
                  onPress={() => navigation.navigate('CircleMember', { circleId, userId: m.id })}
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
                    onPress={() => navigation.navigate('Invitation', { invitationId: inv.id })}
                  />
                ))}
              </PtCard>
            </View>
          ) : null}

          {/* Invites you've sent */}
          {sent.length > 0 ? (
            <View style={{ gap: 8 }}>
              <PtSectionTitle title={sent.length === 1 ? 'Pending invite' : 'Pending invites'} action="See all" onAction={() => navigation.navigate('Invites')} />
              <PtCard>
                {sent.map((inv, i) => (
                  <SentInviteRow key={inv.id} inv={inv} last={i === sent.length - 1} />
                ))}
              </PtCard>
            </View>
          ) : null}

          {/* FAM-11 / FAM-12 */}
          <PtCard>
            <PtRow title="Start a new circle" subtitle="Siblings, friends, church: its own wallets" chevron last={!(iOwn && members.length > 0 && !transfer)} onPress={() => navigation.navigate('NewCircle')} />
            {iOwn && members.length > 0 && !transfer ? (
              <PtRow title="Transfer ownership" subtitle="Hand the circle to someone else" chevron last onPress={() => navigation.navigate('TransferCircle', { circleId })} />
            ) : null}
          </PtCard>
        </>
      )}

      <CircleSwitcherSheet
        visible={switching}
        current={circleId}
        onPick={(r) => {
          setSwitching(false);
          setCircle(r.is_home ? null : r.id);
        }}
        onAjo={(walletId) => {
          setSwitching(false);
          navigation.navigate('Ajo', { walletId });
        }}
        onNew={() => {
          setSwitching(false);
          navigation.navigate('NewCircle');
        }}
        onClose={() => setSwitching(false)}
      />
      <PtOptionSheet
        visible={moving}
        title={`Move into ${circle?.name ?? 'this circle'}`}
        options={movable.map((w) => ({ value: w.id, label: w.name }))}
        value={null}
        onPick={(walletId) => {
          setMoving(false);
          move.mutate({ walletId, circleId: circle?.is_home ? null : circle?.id ?? null }, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Not moved', e.message) });
        }}
        onClose={() => setMoving(false)}
      />
    </PtTabScreen>
  );
}
