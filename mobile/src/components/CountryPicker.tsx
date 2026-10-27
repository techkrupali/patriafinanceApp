import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { selection } from '../lib/haptics';
import { flagEmoji, searchCountries, type Country } from '../lib/phone';

interface CountryPickerModalProps {
  visible: boolean;
  /** The country shown as selected. */
  country: Country;
  onPick: (c: Country) => void;
  onClose: () => void;
}

/** Full-screen searchable country list (flag, name, dial code). */
export function CountryPickerModal({ visible, country, onPick, onClose }: CountryPickerModalProps) {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const results = useMemo(() => searchCountries(query), [query]);

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const pick = (c: Country) => {
    selection();
    onPick(c);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
          <Text className="flex-1 text-lg font-bold text-ink">Select country</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
        </View>

        <View className="px-5 pb-3">
          <View
            className="w-full flex-row items-center rounded px-4"
            style={{ minHeight: 48, backgroundColor: colors.lavSoft }}
          >
            <Ionicons name="search" size={18} color={colors.muted} style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search country or code"
              placeholderTextColor={colors.faded}
              selectionColor={colors.goldDeep}
              cursorColor={colors.goldDeep}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 py-2.5 text-base"
              style={{ color: colors.ink }}
            />
          </View>
        </View>

        <FlatList
          data={results}
          keyExtractor={(c) => c.iso2}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <Text className="mt-8 text-center text-sm text-muted">No countries found.</Text>
          }
          renderItem={({ item }) => {
            const active = item.iso2 === country.iso2;
            return (
              <Pressable
                onPress={() => pick(item)}
                className={`flex-row items-center rounded px-4 py-3.5 active:opacity-80 ${
                  active ? 'bg-success-soft' : ''
                }`}
              >
                <Text className="text-2xl" style={{ marginRight: 12 }}>
                  {flagEmoji(item.iso2)}
                </Text>
                <Text className="flex-1 text-[15px] font-medium text-ink">{item.name}</Text>
                <Text className="text-[15px] font-semibold text-muted">+{item.dial}</Text>
                {active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.brand}
                    style={{ marginLeft: 10 }}
                  />
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
