import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction } from '../api/types';
import { colors, shadow } from '../theme';
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
    return { icon: 'cash-outline', tile: 'bg-lav', tint: colors.navy };
  }
  if (t.includes('fund') || t.includes('deposit') || t.includes('top')) {
    return { icon: 'add-circle', tile: 'bg-success-soft', tint: colors.brand };
  }
  if (txn.direction === 'credit') {
    return { icon: 'arrow-down-circle', tile: 'bg-success-soft', tint: colors.brand };
  }
  return { icon: 'arrow-up-circle', tile: 'bg-lav', tint: colors.navy };
}

const FAILED_STATUSES = ['failed', 'reversed', 'declined', 'cancelled'];

export function TxnRow({ txn, walletName, onPress, className = '' }: TxnRowProps) {
  const credit = txn.direction === 'credit';
  const title = txn.description || humanizeType(txn.type);
  const subtitleParts = [walletName, timeLabel(txn.created_at)].filter(Boolean);
  const v = visuals(txn);
  const failed = FAILED_STATUSES.includes(txn.status.toLowerCase());

  const Container: typeof Pressable | typeof View = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      className={`flex-row items-center rounded-3xl bg-white p-4 ${onPress ? 'active:opacity-90' : ''} ${className}`}
      style={shadow.soft}
    >
      <View className={`mr-3.5 h-11 w-11 items-center justify-center rounded-2xl ${v.tile}`}>
        <Ionicons name={v.icon} size={22} color={v.tint} />
      </View>

      <View className="flex-1 pr-2">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
          {subtitleParts.join(' · ')}
        </Text>
      </View>

      <View className="items-end">
        <Text className={`text-[15px] font-bold ${credit ? 'text-brand' : 'text-ink'}`}>
          {credit ? '+' : '-'}
          {formatMoney(txn.amount)}
        </Text>
        {txn.status !== 'successful' ? (
          <View className={`mt-1 rounded-full px-2 py-0.5 ${failed ? 'bg-danger-soft' : 'bg-lav-faint'}`}>
            <Text
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                failed ? 'text-danger' : 'text-muted'
              }`}
            >
              {txn.status}
            </Text>
          </View>
        ) : null}
      </View>
    </Container>
  );
}
