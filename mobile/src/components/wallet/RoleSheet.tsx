import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtSheet } from '../pt/PtSheet';
import { PtButton } from '../pt/PtButton';
import { PtGroupLabel } from '../pt/PtForm';
import { useAskForAccess } from '../../api/savingsBreak';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Wallet } from '../../api/types';

/** What each wallet calls the people in it (WPV-01…08). */
export function roleTitle(type: string | undefined, role: string | undefined): string {
  if (role === 'owner') return 'Owner';
  if (type === 'savings') return 'Co-saver';
  if (type === 'joint') return 'Partner';
  if (type === 'emergency') return 'Keyholder';
  if (type === 'spending' && role !== 'co_owner') return 'Spender';
  if (role === 'co_owner') return 'Co-owner';
  if (role === 'viewer') return 'Viewer';
  return 'Contributor';
}

/**
 * WPV-09 What can I do here: what your role in this wallet lets you do, what
 * only owners can, and "Ask Ngozi for more access".
 */
export function RoleSheet({
  visible,
  wallet,
  role,
  ownerFirst,
  canFund,
  canSpend,
  canApprove,
  onClose,
}: {
  visible: boolean;
  wallet: Wallet;
  role: string | undefined;
  ownerFirst: string;
  canFund: boolean;
  canSpend: boolean;
  canApprove: boolean;
  onClose: () => void;
}) {
  const ask = useAskForAccess(wallet.id);
  const title = roleTitle(wallet.type, role);
  // WPV-07: on an emergency fund, keyholders say yes to releases and nobody withdraws alone.
  const emergency = wallet.type === 'emergency';
  const approveText = emergency ? 'Say yes or no to a release' : 'Approve payments';
  const can = [
    canFund ? 'Add money' : null,
    'See progress and who put in what',
    wallet.type === 'savings' && canFund ? 'Save from your own salary or wallet' : null,
    wallet.type === 'goal' && canFund ? 'Set up a monthly gift' : null,
    emergency && canApprove ? 'Ask for a release, with proof' : null,
    canSpend ? 'Take money out' : null,
    canApprove ? approveText : null,
  ].filter(Boolean) as string[];
  const cannot = [canSpend ? null : emergency ? 'Withdraw alone' : 'Take money out', canApprove ? null : approveText, 'Change rules or invite people'].filter(Boolean) as string[];
  const line = (text: string, ok: boolean, last: boolean) => (
    <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <Feather name={ok ? 'check' : 'x'} size={20} color={ok ? pt.brand : pt.inkMuted} />
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 16, color: ok ? pt.ink : pt.inkMuted }}>{text}</Text>
    </View>
  );

  return (
    <PtSheet
      visible={visible}
      title={`You're ${/^[AEIOU]/.test(title) ? 'an' : 'a'} ${title.toLowerCase()}`}
      subtitle={`On ${wallet.name}. ${ownerFirst} set this when inviting you.`}
      onClose={onClose}
      footer={
        <PtButton
          title={`Ask ${ownerFirst} for more access`}
          variant="secondary"
          loading={ask.isPending}
          onPress={() =>
            ask.mutate(undefined, {
              onSuccess: () => {
                notifySuccess();
                onClose();
                showAlert('Asked', `We told ${ownerFirst}. They can change what you can do in Members.`);
              },
              onError: (e) => showAlert('Not sent', e.message),
            })
          }
        />
      }
    >
      <View style={{ gap: 6 }}>
        <PtGroupLabel>You can</PtGroupLabel>
        <View style={{ paddingHorizontal: 12 }}>{can.map((t, i) => line(t, true, i === can.length - 1))}</View>
        <PtGroupLabel>Only owners can</PtGroupLabel>
        <View style={{ paddingHorizontal: 12 }}>{cannot.map((t, i) => line(t, false, i === cannot.length - 1))}</View>
      </View>
    </PtSheet>
  );
}
