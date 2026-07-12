import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import type { Transaction } from '../api/types';
import { formatMoney, humanizeType, timeLabel } from '../lib/format';

interface TxnRowProps {
  txn: Transaction;
  /** Optional wallet name shown in the subtitle. */
  walletName?: string;
  className?: string;
}

const shadow: ViewStyle = {
  shadowColor: '#0b1c30',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};

export function TxnRow({ txn, walletName, className = '' }: TxnRowProps) {
  const credit = txn.direction === 'credit';
  const title = txn.description || humanizeType(txn.type);
  const subtitleParts = [walletName, timeLabel(txn.created_at), txn.reference].filter(Boolean);

  return (
    <View
      className={`flex-row items-center rounded-2xl bg-white p-3.5 ${className}`}
      style={shadow}
    >
      <View
        className={`mr-3 h-11 w-11 items-center justify-center rounded-2xl ${
          credit ? 'bg-success' : 'bg-lav-soft'
        }`}
      >
        <Text className={`text-lg font-bold ${credit ? 'text-brand' : 'text-navy'}`}>
          {credit ? '↑' : '↓'}
        </Text>
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
          <Text className="mt-0.5 text-[10px] uppercase tracking-wider text-faded">
            {txn.status}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
