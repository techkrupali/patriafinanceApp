import React from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt } from '../theme';
import { PtSheet } from './pt/PtSheet';
import { PtRow, PtIconTile } from './pt/PtList';
import { useWallet, useWalletMembers } from '../api/hooks';
import { lockedReason } from '../lib/sendRules';
import { walletSubtitle } from '../lib/walletRows';
import { formatNaira } from '../lib/format';
import type { Wallet } from '../api/types';
import type { RootStackParamList } from '../navigation/types';

/**
 * TRS-04 Wallet quick actions (press and hold a wallet in Treasury): top up,
 * move money out, add a rule, a statement, members and settings.
 */
export function WalletActionsSheet({ wallet, onClose }: { wallet: Wallet | null; onClose: () => void }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const members = useWalletMembers(wallet?.id ?? 0, Boolean(wallet?.is_shared));
  const detail = useWallet(wallet?.id ?? 0);
  if (!wallet) return null;
  const locked = lockedReason(wallet);
  const approvers = (detail.data?.approval.approvers ?? []).map((a) => a.name.split(' ')[0]);
  const go = (fn: () => void) => {
    onClose();
    fn();
  };
  const tile = (name: React.ComponentProps<typeof Feather>['name']) => (
    <PtIconTile>
      <Feather name={name} size={18} color={pt.brand} />
    </PtIconTile>
  );
  const count = members.data?.length ?? 1;
  const rows = [
    { key: 'top', title: 'Top up', subtitle: wallet.type === 'main' ? 'Bank transfer, card or a Patriai agent' : 'From Main or another wallet', icon: 'arrow-down-circle' as const, on: () => (wallet.type === 'main' ? navigation.navigate('AddMoney', { walletId: wallet.id }) : navigation.navigate('MoveMoney', { toWalletId: wallet.id })) },
    {
      key: 'out',
      title: 'Move money out',
      subtitle: locked ? `${locked}${approvers.length ? ` · needs ${approvers.join(' and ')}` : ''}` : 'To Main or another wallet',
      icon: 'arrow-up-circle' as const,
      on: () => navigation.navigate('MoveMoney', { fromWalletId: wallet.id }),
      disabled: Boolean(locked) && !approvers.length,
    },
    { key: 'rule', title: 'Add a rule', subtitle: 'Like 10% of every salary', icon: 'repeat' as const, on: () => navigation.navigate('CreateAutomation', wallet.type === 'main' ? { fromWalletId: wallet.id } : { toWalletId: wallet.id }) },
    { key: 'statement', title: 'Statement', subtitle: 'PDF, Excel or CSV', icon: 'file-text' as const, on: () => navigation.navigate('WalletStatement', { walletId: wallet.id }) },
    { key: 'members', title: 'Members', subtitle: `${count} ${count === 1 ? 'person' : 'people'}`, icon: 'users' as const, on: () => navigation.navigate('WalletMembers', { walletId: wallet.id }) },
    { key: 'settings', title: 'Settings', subtitle: undefined, icon: 'settings' as const, on: () => navigation.navigate('WalletSettings', { walletId: wallet.id }) },
  ];
  return (
    <PtSheet visible title={wallet.name} subtitle={`${formatNaira(wallet.balance)} · ${walletSubtitle(wallet)}`} onClose={onClose}>
      <View>
        {rows.map((r, i) => (
          <PtRow key={r.key} title={r.title} subtitle={r.subtitle} left={tile(r.icon)} chevron onPress={() => go(r.on)} disabled={r.disabled} last={i === rows.length - 1} />
        ))}
      </View>
    </PtSheet>
  );
}
