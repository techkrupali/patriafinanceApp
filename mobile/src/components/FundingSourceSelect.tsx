import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, outline } from '../theme';
import { formatMoney } from '../lib/format';
import { selection } from '../lib/haptics';
import type { Wallet } from '../api/types';

interface FundingSourceSelectProps {
  label: string;
  wallets: Wallet[];
  value: number | null;
  onChange: (walletId: number) => void;
  className?: string;
}

/** Dropdown-style picker for the wallet that funds a new wallet (design: "Funding Source"). */
export function FundingSourceSelect({ label, wallets, value, onChange, className = '' }: FundingSourceSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = wallets.find((w) => w.id === value);

  return (
    <View className={className}>
      <Text className="mb-2 text-[13px] font-semibold text-muted">{label}</Text>
      <Pressable
        onPress={() => {
          selection();
          setOpen((o) => !o);
        }}
        className="flex-row items-center rounded bg-lav-faint px-4 active:opacity-90"
        style={{ minHeight: 54 }}
      >
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
            {selected ? selected.name : 'Choose a wallet'}
          </Text>
          {selected ? <Text className="text-[12px] text-muted">{formatMoney(selected.balance)} available</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open ? (
        <View className="mt-2 overflow-hidden rounded bg-white" style={outline.card}>
          {wallets.length === 0 ? (
            <Text className="p-4 text-[13px] text-muted">You have no wallet to fund from yet.</Text>
          ) : (
            wallets.map((w, i) => {
              const active = w.id === value;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    selection();
                    onChange(w.id);
                    setOpen(false);
                  }}
                  className={`flex-row items-center px-4 py-3 active:opacity-80 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <View className="flex-1 pr-2">
                    <Text className={`text-[14px] ${active ? 'font-bold text-navy' : 'font-semibold text-ink'}`}>{w.name}</Text>
                    <Text className="text-[12px] text-muted">{formatMoney(w.balance)}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={colors.brand} /> : null}
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}
