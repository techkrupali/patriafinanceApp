import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Bank } from '../api/types';
import { useBanks } from '../api/hooks';
import { LoadError } from './LoadError';
import { colors } from '../theme';
import { selection } from '../lib/haptics';

interface BankPickerProps {
  visible: boolean;
  selectedCode?: string;
  onSelect: (bank: Bank) => void;
  onClose: () => void;
}

/** Searchable modal list of banks (GET /banks). */
export function BankPicker({ visible, selectedCode, onSelect, onClose }: BankPickerProps) {
  const insets = useSafeAreaInsets();
  const { data: banks, isLoading, error, refetch } = useBanks();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return banks ?? [];
    return (banks ?? []).filter((b) => b.bank_name.toLowerCase().includes(q));
  }, [banks, search]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-page" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center px-5 py-3">
          <Text className="flex-1 text-xl font-semibold text-ink">Select bank</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View className="px-5 pb-3">
          <View className="flex-row items-center rounded-2xl bg-lav-faint px-4" style={{ minHeight: 50 }}>
            <Ionicons name="search" size={18} color={colors.faded} style={{ marginRight: 8 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search banks…"
              placeholderTextColor={colors.faded}
              className="flex-1 py-3 text-[15px] text-ink"
            />
          </View>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.bank_code}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.bank_code === selectedCode;
              return (
                <Pressable
                  onPress={() => {
                    selection();
                    onSelect(item);
                    setSearch('');
                  }}
                  className={`mb-2 flex-row items-center rounded-2xl p-4 active:opacity-80 ${
                    isSelected ? 'bg-lav' : 'bg-lav-faint'
                  }`}
                >
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-lav-soft">
                    <Text className="text-sm font-semibold text-brand">
                      {item.bank_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text className="flex-1 text-[15px] text-ink">{item.bank_name}</Text>
                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text className="py-10 text-center text-sm text-muted">No banks match “{search}”.</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}
