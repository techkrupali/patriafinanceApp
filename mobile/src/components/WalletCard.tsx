import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Wallet, WalletType } from '../api/types';
import { colors } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface WalletCardProps {
  wallet: Wallet;
  onPress?: () => void;
  onFund?: () => void;
  onWithdraw?: () => void;
  onSend?: () => void;
  className?: string;
}

const META: Record<WalletType, { label: string; icon: IconName }> = {
  main: { label: 'MAIN', icon: 'shield-checkmark-outline' },
  shared: { label: 'SHARED', icon: 'people-outline' },
  project: { label: 'PROJECT', icon: 'flag-outline' },
};

function ActionLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      hitSlop={8}
      className="active:opacity-60"
    >
      <Text className="text-[13px] font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}

/** Flat light wallet card: soft fill, small type label, dark balance, blue text action links. */
export function WalletCard({ wallet, onPress, onFund, onWithdraw, onSend, className = '' }: WalletCardProps) {
  const meta = META[wallet.type] ?? META.main;
  const isMember = wallet.my_role && wallet.my_role !== 'owner';
  const showActions = Boolean(onFund || onWithdraw || onSend);

  return (
    <Pressable onPress={onPress} className={`rounded-[20px] bg-lav-faint p-5 active:opacity-95 ${className}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2.5 h-9 w-9 items-center justify-center rounded-full bg-lav-soft">
            <Ionicons name={meta.icon} size={18} color={colors.brand} />
          </View>
          <Text className="text-base font-semibold text-ink" numberOfLines={1}>
            {wallet.name}
          </Text>
        </View>
        <Text className="text-[11px] font-semibold uppercase tracking-widest text-muted">{meta.label}</Text>
      </View>

      <Text className="mt-4 text-[12px] text-muted">Balance</Text>
      <Text className="mt-0.5 text-3xl font-bold tracking-tight text-ink">{formatMoney(wallet.balance)}</Text>

      {isMember ? (
        <View className="mt-2 flex-row items-center">
          <View className="rounded-full bg-white px-2 py-0.5">
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted">{wallet.my_role}</Text>
          </View>
          {wallet.owner ? (
            <Text className="ml-2 text-xs text-muted" numberOfLines={1}>
              Owner: {wallet.owner.name}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showActions ? (
        <View
          className="mt-5 flex-row items-center border-t pt-4"
          style={{ borderTopColor: colors.border, gap: 24 }}
        >
          {onFund ? <ActionLink label="Fund" onPress={onFund} /> : null}
          {onSend ? <ActionLink label="Send" onPress={onSend} /> : null}
          {onWithdraw ? <ActionLink label="Withdraw" onPress={onWithdraw} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}
