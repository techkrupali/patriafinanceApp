import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction } from '../api/types';
import { colors } from '../theme';
import { formatMoney, humanizeType, timeLabel } from '../lib/format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface TxnRowProps {
  txn: Transaction;
  /** Optional wallet name shown in the subtitle. */
  walletName?: string;
  onPress?: () => void;
  className?: string;
}

function visuals(txn: Transaction): { icon: IconName; tile: string; tint: string } {
  const t = txn.type.toLowerCase();
  if (t.includes('withdraw')) {
    return { icon: 'arrow-up-outline', tile: 'bg-white', tint: colors.muted };
  }
  if (t.includes('fund') || t.includes('deposit') || t.includes('top')) {
    return { icon: 'add-outline', tile: 'bg-lav-soft', tint: colors.brand };
  }
  if (txn.direction === 'credit') {
    return { icon: 'arrow-down-outline', tile: 'bg-lav-soft', tint: colors.brand };
  }
  return { icon: 'arrow-up-outline', tile: 'bg-white', tint: colors.muted };
}

export function TxnRow({ txn, walletName, onPress, className = '' }: TxnRowProps) {
  const credit = txn.direction === 'credit';
  const title = txn.description || humanizeType(txn.type);
  const subtitleParts = [walletName, timeLabel(txn.created_at)].filter(Boolean);
  const v = visuals(txn);

  const Container: typeof Pressable | typeof View = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      className={`flex-row items-center rounded-2xl bg-lav-faint p-3.5 ${onPress ? 'active:opacity-90' : ''} ${className}`}
    >
      <View className={`mr-3.5 h-11 w-11 items-center justify-center rounded-full ${v.tile}`}>
        <Ionicons name={v.icon} size={20} color={v.tint} />
      </View>

      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-medium text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {subtitleParts.join(' · ')}
        </Text>
      </View>

      <View className="items-end">
        <Text className={`text-[15px] font-semibold ${credit ? 'text-brand' : 'text-ink'}`}>
          {credit ? '+' : '-'}
          {formatMoney(txn.amount)}
        </Text>
        {txn.status !== 'successful' ? (
          <View className="mt-1 rounded-full bg-white px-2 py-0.5">
            <Text className="text-[10px] font-semibold uppercase tracking-wider text-muted">{txn.status}</Text>
          </View>
        ) : null}
      </View>
    </Container>
  );
}
