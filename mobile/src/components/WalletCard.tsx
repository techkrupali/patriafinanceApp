import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Wallet } from '../api/types';
import { colors, shadow } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';
import { walletVisual } from '../lib/walletVisual';

interface WalletCardProps {
  wallet: Wallet;
  onPress?: () => void;
  /** Kept for API compatibility; the premium card routes actions to the detail screen. */
  onFund?: () => void;
  onWithdraw?: () => void;
  onSend?: () => void;
  className?: string;
}

function subtitleFor(wallet: Wallet): string {
  if (wallet.my_role && wallet.my_role !== 'owner') {
    const owner = wallet.owner?.name ? ` · ${wallet.owner.name}` : '';
    return `${wallet.my_role.replace('_', ' ')}${owner}`;
  }
  const map: Record<string, string> = {
    main: 'Personal account',
    shared: 'Shared wallet',
    savings: 'Savings',
    goal: 'Goal wallet',
    project: 'Project escrow',
    emergency: 'Emergency fund',
    giving: 'Giving',
    joint: 'Joint wallet',
    child: 'Child wallet',
    spending: 'Spending',
  };
  return map[wallet.type] ?? 'Wallet';
}

export function WalletCard({ wallet, onPress, className = '' }: WalletCardProps) {
  const s = walletVisual(wallet.type);
  const frozen = wallet.status && wallet.status !== 'active';
  const acct = wallet.virtual_account ? `•••• ${wallet.virtual_account.slice(-4)}` : null;

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          selection();
          onPress();
        }
      }}
      className={`rounded-3xl border border-border bg-card p-5 active:opacity-95 ${className}`}
      style={shadow.card}
    >
      <View className="flex-row items-start justify-between">
        <LinearGradient
          colors={s.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            { height: 46, width: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
            shadow.soft,
          ]}
        >
          <Ionicons name={s.icon} size={22} color={s.onDark ? colors.white : colors.navy} />
        </LinearGradient>

        {frozen ? (
          <View className="flex-row items-center rounded-full bg-danger-soft px-2.5 py-1">
            <Ionicons name="lock-closed" size={10} color={colors.danger} style={{ marginRight: 4 }} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-danger">
              {String(wallet.status)}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center rounded-full bg-success-soft px-2.5 py-1">
            <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-brand">Active</Text>
          </View>
        )}
      </View>

      <Text className="mt-4 text-[17px] font-extrabold tracking-tight text-ink" numberOfLines={1}>
        {wallet.name}
      </Text>
      <Text className="text-[13px] capitalize text-muted" numberOfLines={1}>
        {subtitleFor(wallet)}
      </Text>

      <Text className="mt-4 text-[10.5px] font-bold uppercase tracking-widest text-faded">
        Available balance
      </Text>
      <Text className="mt-0.5 text-[28px] font-extrabold tracking-tight text-ink">
        {formatMoney(wallet.balance)}
      </Text>

      <View className="mt-4 flex-row items-center justify-between border-t border-border pt-3">
        <Text className="text-[12px] font-medium text-faded">{acct ?? 'Tap to open'}</Text>
        <View className="flex-row items-center">
          <Text className="text-[12px] font-semibold text-brand">Open</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.brand} style={{ marginLeft: 2 }} />
        </View>
      </View>
    </Pressable>
  );
}
