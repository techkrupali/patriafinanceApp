import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { PtAvatar, AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { PtChip } from '../../components/pt/PtChip';
import { LoadError } from '../../components/LoadError';
import { AddLink, HeaderIcon } from '../../components/wallet/WalletManageUi';
import { useWallet, useWalletInvitations } from '../../api/hooks';
import { useWalletPeople } from '../../api/walletManage';
import { useAuth } from '../../store/auth';
import { agoLabel, formatNaira, initials } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { canInviteMembers, canManageWallet, roleLabel } from '../../lib/governance';
import type { WalletMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** The bar's colours, member by member; what nobody in the wallet put in is grey. */
const BAR = [pt.emerald700, pt.emerald300, pt.gold500, '#6D28D9', '#C2410C', '#1D5FA8'];

const isApprover = (m: WalletMember) => ['co_owner', 'admin'].includes(m.role) || m.can_approve;

/**
 * WAL-04 Members: who put in what, each person's role, amount and share, who
 * is still invited, and adding someone. Owners and co-owners open a member's
 * permissions (WAL-07); the gear sets everyone's access at once.
 */
export function WalletMembersScreen({ navigation, route }: RootScreenProps<'WalletMembers'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const role = detail.data?.my_role;
  const canManage = canManageWallet(role) && detail.data?.wallet.status !== 'closed';
  const canInvite = canInviteMembers(role) && detail.data?.wallet.status === 'active';
  const people = useWalletPeople(walletId);
  const invites = useWalletInvitations(walletId, canInvite);
  const members = people.data?.members ?? [];
  const totals = people.data?.contributions;
  const pending = canInvite ? invites.data ?? [] : [];

  const segments = totals
    ? [
        ...members.map((m, i) => ({ key: `m${m.user_id}`, share: m.share ?? 0, color: BAR[i % BAR.length] })),
        { key: 'others', share: totals.others_share, color: pt.lineStrong },
      ].filter((s) => s.share > 0)
    : [];

  const open = (m: WalletMember) => {
    if (!canManage || m.role === 'owner' || !m.id) return;
    navigation.navigate('MemberPermissions', { walletId, memberId: m.id });
  };

  return (
    <PtPageScreen
      title="Members"
      subtitle={detail.data?.wallet.name}
      onBack={() => navigation.goBack()}
      right={canManage && members.length > 1 ? <HeaderIcon icon="settings" label="Access for everyone" onPress={() => navigation.navigate('AssignAccess', { walletId })} /> : undefined}
    >
      {people.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : people.error ? (
        <LoadError message={(people.error as Error).message} onRetry={() => void people.refetch()} />
      ) : (
        <>
          {segments.length ? (
            <View style={{ gap: 10 }}>
              <PtSectionTitle title="Who put in what" />
              <View style={{ flexDirection: 'row', height: 12, gap: 3 }} accessibilityLabel={members.map((m) => `${m.name} ${m.share ?? 0}%`).join(', ')}>
                {segments.map((s, i) => (
                  <View
                    key={s.key}
                    style={{
                      flex: s.share,
                      backgroundColor: s.color,
                      borderTopLeftRadius: i === 0 ? 6 : 0,
                      borderBottomLeftRadius: i === 0 ? 6 : 0,
                      borderTopRightRadius: i === segments.length - 1 ? 6 : 0,
                      borderBottomRightRadius: i === segments.length - 1 ? 6 : 0,
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <PtCard>
            {members.map((m, i) => {
              const you = m.user_id === me?.id;
              const amount = m.put_in != null ? ` · ${formatNaira(m.put_in)} · ${m.share ?? 0}%` : '';
              const editable = canManage && m.role !== 'owner' && Boolean(m.id);
              return (
                <PtRow
                  key={m.user_id}
                  minHeight={68}
                  last={i === members.length - 1 && pending.length === 0}
                  left={<PtAvatar initials={initials(m.name)} tone={m.role === 'owner' ? 'deep' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />}
                  title={`${m.name.split(' ')[0]}${you ? ' (you)' : ''}`}
                  subtitle={`${roleLabel(m.role)}${m.role !== 'owner' && m.role !== 'co_owner' && m.can_approve ? ' · approver' : ''}${amount}`}
                  right={
                    m.role === 'owner' ? (
                      <PtChip label="Owner" tone="neutral" icon="circle" />
                    ) : isApprover(m) ? (
                      <PtChip label="Approver" tone="brand" icon="circle" />
                    ) : editable ? (
                      // The whole row opens WAL-07; "Edit" is its label, not a button inside a button.
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Edit</Text>
                    ) : undefined
                  }
                  onPress={editable ? () => open(m) : undefined}
                />
              );
            })}
            {pending.map((inv, i) => (
              <PtRow
                key={`inv-${inv.id}`}
                minHeight={68}
                last={i === pending.length - 1}
                left={<PtAvatar initials={/^[A-Za-z@]/.test(inv.invitee_identifier ?? '') ? (inv.invitee_identifier ?? '').replace(/^@/, '').charAt(0).toUpperCase() : '+'} tone="dashed" />}
                title={inv.invitee_identifier?.startsWith('+') ? formatE164(inv.invitee_identifier) : inv.invitee_identifier ?? 'Invited'}
                subtitle={`Invited ${agoLabel(inv.created_at)} · ${roleLabel(inv.role).toLowerCase()}`}
                right={<PtChip label="Pending" tone="warning" icon="clock" />}
              />
            ))}
          </PtCard>

          {totals && parseFloat(totals.others) > 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
              {formatNaira(totals.others)} ({totals.others_share}%) came from bank transfers and the contribution link.
            </Text>
          ) : null}

          {canInvite ? <AddLink label="Add someone to this wallet" onPress={() => navigation.navigate('InviteMember', { walletId })} /> : null}
        </>
      )}
    </PtPageScreen>
  );
}
