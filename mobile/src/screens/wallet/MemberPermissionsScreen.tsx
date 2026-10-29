import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCheckbox } from '../../components/pt/PtCheck';
import { PtGroupLabel, PtNote, PtPanel, PtSegmented } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useRemoveMember, useUpdateMember, useWallet } from '../../api/hooks';
import { useWalletPeople } from '../../api/walletManage';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { UpdateMemberPayload, WalletMember } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Role = 'contributor' | 'approver' | 'co_owner';
type Perms = { fund: boolean; view: boolean; see_contributions: boolean; request: boolean };

const roleOf = (m: WalletMember): Role => (m.role === 'co_owner' ? 'co_owner' : m.can_approve || m.role === 'admin' ? 'approver' : 'contributor');

function CheckRow({ title, sub, checked, disabled, onToggle, last = false }: { title: string; sub?: string; checked: boolean; disabled?: boolean; onToggle?: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        if (disabled || !onToggle) return;
        selection();
        onToggle();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: checked, disabled }}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line, opacity: disabled ? 0.45 : 1 }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      <PtCheckbox checked={checked} />
    </Pressable>
  );
}

/**
 * WAL-07 Permissions and role ceilings: Contributor, Approver or Co-owner,
 * and what this person may do — add money, see the balance, see who paid
 * what, ask to take money out. Approving is for approvers and co-owners,
 * changing rules for co-owners only.
 */
export function MemberPermissionsScreen({ navigation, route }: RootScreenProps<'MemberPermissions'>) {
  const { walletId, memberId } = route.params;
  const detail = useWallet(walletId);
  const people = useWalletPeople(walletId);
  const update = useUpdateMember(walletId);
  const remove = useRemoveMember(walletId);
  const member = people.data?.members.find((m) => m.id === memberId);
  const first = (member?.name ?? '').split(' ')[0] || 'This person';
  const myRole = detail.data?.my_role;

  const [role, setRole] = useState<Role>('contributor');
  const [perms, setPerms] = useState<Perms>({ fund: true, view: true, see_contributions: true, request: true });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!member || ready) return;
    setRole(roleOf(member));
    setPerms({
      fund: member.permissions?.fund ?? true,
      view: member.permissions?.view ?? true,
      see_contributions: member.permissions?.see_contributions ?? true,
      request: member.permissions?.request ?? true,
    });
    setReady(true);
  }, [member, ready]);

  const coOwner = role === 'co_owner';
  const toggle = (k: keyof Perms) => setPerms((p) => ({ ...p, [k]: !p[k] }));

  const save = () => {
    if (!member) return;
    const body: UpdateMemberPayload = {};
    const was = roleOf(member);
    if (role !== was) {
      if (role === 'co_owner') {
        body.role = 'co_owner';
      } else {
        body.role = role === 'approver' && member.role === 'admin' ? 'admin' : 'contributor';
        body.can_approve = role === 'approver';
      }
    }
    if (!coOwner) body.permissions = perms;
    update.mutate(
      { memberId, body },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => showAlert('Could not save', e.message),
      },
    );
  };

  const confirmRemove = () =>
    showAlert(`Remove ${first}?`, `${first} stops seeing ${detail.data?.wallet.name ?? 'this wallet'}. What they put in stays in the wallet.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          remove.mutate(memberId, {
            onSuccess: () => {
              notifySuccess();
              navigation.goBack();
            },
            onError: (e) => showAlert('Could not remove', e.message),
          }),
      },
    ]);

  return (
    <PtPageScreen
      title="Permissions"
      subtitle={member ? `${first} · ${detail.data?.wallet.name ?? ''}` : detail.data?.wallet.name}
      onBack={() => navigation.goBack()}
      footer={member ? <PtButton title="Save" onPress={save} loading={update.isPending} disabled={!ready} /> : undefined}
    >
      {people.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !member ? (
        <LoadError message={people.error ? (people.error as Error).message : 'This person is no longer in the wallet.'} onRetry={() => void people.refetch()} />
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Role</PtGroupLabel>
            <PtSegmented<Role>
              options={[
                { value: 'contributor', label: 'Contributor' },
                { value: 'approver', label: 'Approver' },
                ...(myRole === 'owner' || role === 'co_owner' ? [{ value: 'co_owner' as const, label: 'Co-owner' }] : []),
              ]}
              value={role}
              onChange={setRole}
            />
          </View>

          <PtPanel>
            <CheckRow title="Add money" checked={coOwner || perms.fund} disabled={coOwner} onToggle={() => toggle('fund')} />
            <CheckRow title="See the balance and progress" checked={coOwner || perms.view} disabled={coOwner} onToggle={() => toggle('view')} />
            <CheckRow title="See who paid what" sub="Turn off to keep amounts private" checked={coOwner || perms.see_contributions} disabled={coOwner} onToggle={() => toggle('see_contributions')} />
            <CheckRow title="Request money out" sub="Goes through the approval rules" checked={coOwner || perms.request} disabled={coOwner} onToggle={() => toggle('request')} />
            <CheckRow title="Approve payments" sub="Approvers and co-owners only" checked={role !== 'contributor'} disabled />
            <CheckRow title="Change rules" sub="Co-owners only" checked={coOwner} disabled last />
          </PtPanel>

          <PtNote tone="info" icon="lock">
            {role === 'contributor'
              ? `Role ceilings: a contributor can never approve or change rules. Make ${first} an approver to give them a say.`
              : role === 'approver'
                ? `Role ceilings: an approver says yes or no to payments but can't change the rules. Only co-owners can.`
                : `A co-owner can pay out, approve and change the rules, with the other owners agreeing to rule changes.`}
          </PtNote>

          <Pressable onPress={confirmRemove} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 8 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.danger }}>Remove {first} from this wallet</Text>
          </Pressable>
        </>
      )}
    </PtPageScreen>
  );
}
