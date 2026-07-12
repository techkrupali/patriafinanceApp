import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Bank } from '../api/types';
import { useBanks } from '../api/hooks';
import { LoadError } from './LoadError';

interface BankPickerProps {
  visible: boolean;
  onSelect: (bank: Bank) => void;
  onClose: () => void;
}

/** Searchable modal list of banks (GET /banks). */
export function BankPicker({ visible, onSelect, onClose }: BankPickerProps) {
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
      <View
        className="flex-1 bg-page"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="flex-row items-center px-5 py-3">
          <Text className="flex-1 text-lg font-bold text-ink">Select bank</Text>
          <Pressable
            onPress={onClose}
            className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
          >
            <Text className="text-base text-muted">✕</Text>
          </Pressable>
        </View>

        <View className="px-5 pb-3">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search banks…"
            placeholderTextColor="#94a3b8"
            className="w-full rounded-2xl bg-lav px-4 py-3.5 text-base text-ink"
          />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#001736" />
          </View>
        ) : error ? (
          <LoadError message={(error as Error).message} onRetry={() => refetch()} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.bank_code}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  setSearch('');
                }}
                className="mb-2 flex-row items-center rounded-2xl bg-white p-4 active:opacity-80"
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-lav-soft">
                  <Text className="text-sm font-bold text-navy">
                    {item.bank_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text className="flex-1 text-[15px] text-ink">{item.bank_name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text className="py-10 text-center text-sm text-muted">No banks match “{search}”.</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}
