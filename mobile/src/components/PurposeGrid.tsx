import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { selection } from '../lib/haptics';
import type { WalletPurpose } from '../lib/walletGuides';

interface PurposeGridProps<K extends string> {
  purposes: WalletPurpose<K>[];
  value: K | null;
  onChange: (key: K) => void;
}

/** Two-column purpose chips for ONE wallet type (design: "Purpose of Wallet"). */
export function PurposeGrid<K extends string>({ purposes, value, onChange }: PurposeGridProps<K>) {
  return (
    <View className="flex-row flex-wrap justify-between" style={{ rowGap: 10 }}>
      {purposes.map((p) => {
        const active = value === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => {
              selection();
              onChange(p.key);
            }}
            className={`flex-row items-center rounded border px-4 py-3.5 active:opacity-90 ${
              active ? 'border-navy bg-lav' : 'border-transparent bg-lav-faint'
            }`}
            style={{ width: '48.5%' }}
          >
            <Ionicons name={p.icon} size={16} color={active ? colors.navy : colors.muted} style={{ marginRight: 8 }} />
            <Text className={`flex-1 text-[14px] ${active ? 'font-bold text-navy' : 'font-semibold text-ink'}`} numberOfLines={1}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
