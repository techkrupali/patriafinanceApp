import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { SettingsRow, rulesLine, scheduleLine } from '../../components/wallet/WalletManageUi';
import { useBudget, useUpdateWallet, useWallet, useWalletDeletion, useWalletInvitations, useWalletLock } from '../../api/hooks';
import { formatNaira, formatYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { WalletNotify } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const NOTIFY: { value: WalletNotify; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Every payment, for all members', hint: 'Everyone in the wallet hears when money comes in or goes out' },
  { value: 'owners', label: 'Every payment, owners only', hint: 'You and any co-owner hear about every payment' },
  { value: 'off', label: 'Only approvals and alerts', hint: 'No message for each payment' },
];

const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/**
 * WAL-06 Wallet settings: name, colour and goal · members and permissions ·
 * approval rules · spending limits and hours · lock · notifications ·
 * statements · audit log · pause · close or archive. Owners and co-owners.
 */
export function WalletSettingsScreen({ navigation, route }: RootScreenProps<'WalletSettings'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const update = useUpdateWallet(walletId);
  const pause = useWalletLock(walletId);
  const deletion = useWalletDeletion(walletId);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const d = detail.data;
  const wallet = d?.wallet;
  const type = wallet?.type;
  const isMain = type === 'main';
  const archived = wallet?.status === 'closed';
  const role = d?.my_role;
  const invites = useWalletInvitations(walletId, Boolean(wallet) && !isMain && !archived);
  const budget = useBudget(walletId, type === 'spending');

  if (detail.isLoading || !d || !wallet) {
    return (
      <PtPageScreen title="Wallet settings" onBack={() => navigation.goBack()}>
        {detail.error ? <LoadError message={(detail.error as Error).message} onRetry={() => void detail.refetch()} /> : <ActivityIndicator color={pt.brand} />}
      </PtPageScreen>
    );
  }

  const target = parseFloat(wallet.target_amount ?? '');
  const approvers = (d.governance?.approvers ?? []).map((a) => a.name);
  const named = (d.governance?.approvers ?? []).filter((a) => wallet.approver_ids?.includes(a.user_id)).map((a) => a.name);
  const lock = wallet.lock;
  const canLock = !['main', 'joint', 'emergency', 'project'].includes(wallet.type);
  const pendingInvites = invites.data?.length ?? 0;
  const memberCount = d.members.length;
  const frozen = wallet.status === 'frozen';
  const suspended = wallet.status === 'suspended';
  const notify = NOTIFY.find((n) => n.value === wallet.notify);

  const lockLine = lock?.locked
    ? lock.mode === 'date' && lock.until
      ? `Locked until ${formatYmd(lock.until)}`
      : lock.mode === 'target'
        ? `Locked until ${formatNaira(wallet.target_amount)} is in`
        : `Locked until ${joinFirst([firstName(wallet.owner?.name), ...(d.governance?.others ?? [])])} agree`
    : 'Not locked';

  const togglePause = () => {
    if (frozen) {
      pause.unfreeze.mutate(undefined, {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => showAlert('Could not resume', e.message),
      });
      return;
    }
    showAlert(`Pause ${wallet.name}?`, 'Rules and payments stop until someone resumes it. Money can still come in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Pause wallet',
        style: 'destructive',
        onPress: () =>
          pause.freeze.mutate(undefined, {
            onSuccess: () => {
              notifySuccess();
              navigation.goBack();
            },
            onError: (e) => showAlert('Could not pause', e.message),
          }),
      },
    ]);
  };

  const restore = () =>
    deletion.unarchive.mutate(undefined, {
      onSuccess: () => {
        notifySuccess();
        navigation.goBack();
      },
      onError: (e) => showAlert('Could not restore', e.message),
    });

  return (
    <PtPageScreen title="Wallet settings" subtitle={wallet.name} onBack={() => navigation.goBack()}>
      <PtPanel>
        <SettingsRow
          icon="edit-2"
          title={isMain ? 'Name' : 'Name, colour and goal'}
          sub={Number.isFinite(target) && target > 0 ? `${formatNaira(target)}${wallet.target_date ? ` by ${shortDate(wallet.target_date)}` : ''}` : wallet.name}
          onPress={archived ? undefined : () => navigation.navigate('WalletBasics', { walletId })}
          last={isMain}
        />
        {!isMain ? (
          <>
            <SettingsRow
              icon="user"
              title="Members and permissions"
              sub={`${memberCount} member${memberCount === 1 ? '' : 's'}${pendingInvites ? `, ${pendingInvites} invite${pendingInvites === 1 ? '' : 's'}` : ''}`}
              onPress={() => navigation.navigate('WalletMembers', { walletId })}
            />
            <SettingsRow
              icon="check"
              title="Approval rules"
              sub={
                d.governance?.pending_change
                  ? `Waiting for ${joinFirst(d.governance.pending_change.approver_names ?? [])} to approve a change`
                  : wallet.type === 'joint'
                    ? 'Joint rules change together'
                    : rulesLine({ enabled: Boolean(d.approval.enabled), threshold: d.approval.threshold, mode: wallet.approval_mode, approvers, named })
              }
              onPress={archived ? undefined : () => navigation.navigate('ApprovalRules', { walletId })}
            />
            {type === 'spending' ? (
              <SettingsRow
                icon="slash"
                title="Spending limits"
                sub={budget.data ? `${formatNaira(budget.data.spent)} of ${formatNaira(budget.data.amount)} spent` : 'Limits by category and person'}
                onPress={() => navigation.navigate('SpendingLimits', { walletId })}
              />
            ) : null}
            <SettingsRow
              icon="clock"
              title="Spending hours"
              sub={scheduleLine(wallet.access_schedule)}
              onPress={archived || suspended ? undefined : () => navigation.navigate('WalletLock', { walletId })}
              last={!canLock}
            />
            {canLock ? (
              <SettingsRow icon="lock" title="Lock" sub={lockLine} onPress={archived ? undefined : () => navigation.navigate('LockWallet', { walletId })} last />
            ) : null}
          </>
        ) : null}
      </PtPanel>

      <PtPanel>
        <SettingsRow
          icon="bell"
          title="Notifications"
          sub={notify?.label ?? 'Money in, for the owner'}
          onPress={archived ? undefined : () => setNotifyOpen(true)}
        />
        <SettingsRow icon="download" title="Statements" sub="PDF or CSV" onPress={() => navigation.navigate('WalletStatement', { walletId })} />
        <SettingsRow icon="rotate-ccw" title="Audit log" sub="Every change, who and when" onPress={() => navigation.navigate('WalletAuditLog', { walletId })} last />
      </PtPanel>

      {!isMain && wallet.type !== 'project' ? (
        <PtPanel>
          {archived ? (
            role === 'owner' && wallet.closed?.mode !== 'close' ? (
              <SettingsRow icon="refresh-ccw" title="Restore this wallet" sub="Make it active again" onPress={restore} last />
            ) : (
              <SettingsRow icon="archive" title={wallet.closed?.mode === 'close' ? 'Closed for good' : 'Archived'} sub="Read only. History and statements stay available" last />
            )
          ) : (
            <>
              <SettingsRow
                icon={frozen ? 'play' : 'pause'}
                title={frozen ? 'Resume this wallet' : 'Pause this wallet'}
                sub={suspended ? 'Patriai stopped this wallet. Talk to support' : frozen ? 'Rules and payments run again' : 'Stops rules and payments for now'}
                onPress={suspended || pause.freeze.isPending || pause.unfreeze.isPending ? undefined : togglePause}
              />
              <SettingsRow
                icon="trash-2"
                title="Close or archive"
                sub="Move what's left, keep the history"
                danger
                onPress={suspended ? undefined : () => navigation.navigate('CloseWallet', { walletId })}
                last
              />
            </>
          )}
        </PtPanel>
      ) : null}

      <View style={{ height: 8 }} />
      <PtOptionSheet
        visible={notifyOpen}
        title="Notifications"
        options={NOTIFY}
        value={wallet.notify ?? null}
        onClose={() => setNotifyOpen(false)}
        onPick={(value) => {
          setNotifyOpen(false);
          update.mutate({ notify: value }, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Could not save', e.message) });
        }}
      />
    </PtPageScreen>
  );
}

function joinFirst(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length <= 1) return n[0] ?? 'everyone';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}
