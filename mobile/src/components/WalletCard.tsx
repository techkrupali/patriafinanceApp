import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import type { Wallet } from '../api/types';
import { formatMoney } from '../lib/format';

interface WalletCardProps {
  wallet: Wallet;
  onPress?: () => void;
  className?: string;
}

const typeBadge: Record<string, { bg: string; text: string; label: string }> = {
  main: { bg: 'bg-lav', text: 'text-navy', label: 'MAIN' },
  shared: { bg: 'bg-success', text: 'text-brand', label: 'SHARED' },
  project: { bg: 'bg-lav-soft', text: 'text-navy-light', label: 'PROJECT' },
};

const shadow: ViewStyle = {
  shadowColor: '#0b1c30',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export function WalletCard({ wallet, onPress, className = '' }: WalletCardProps) {
  const badge = typeBadge[wallet.type] ?? typeBadge.main;
  const isMember = wallet.my_role && wallet.my_role !== 'owner';

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl bg-white p-4 active:opacity-90 ${className}`}
      style={shadow}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-base font-semibold text-ink" numberOfLines={1}>
          {wallet.name}
        </Text>
        <View className={`rounded-full px-2.5 py-1 ${badge.bg}`}>
          <Text className={`text-[10px] font-bold tracking-widest ${badge.text}`}>
            {badge.label}
          </Text>
        </View>
      </View>

      <Text className="mt-3 text-2xl font-bold text-ink">{formatMoney(wallet.balance)}</Text>

      {isMember ? (
        <View className="mt-2 flex-row items-center">
          <View className="rounded-full bg-lav-faint px-2 py-0.5">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {wallet.my_role}
            </Text>
          </View>
          {wallet.owner ? (
            <Text className="ml-2 text-xs text-faded" numberOfLines={1}>
              Owner: {wallet.owner.name}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
