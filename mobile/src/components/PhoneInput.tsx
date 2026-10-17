import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { selection } from '../lib/haptics';
import { flagEmoji, searchCountries, type Country } from '../lib/phone';

interface PhoneInputProps {
  country: Country;
  onChangeCountry: (c: Country) => void;
  /** National number as typed (digits only). */
  value: string;
  onChangeText: (national: string) => void;
  label?: string;
  labelClassName?: string;
  placeholder?: string;
}

/**
 * Design-system phone field: a tappable country pill (flag + dial code) that
 * opens a searchable country picker, next to the national-number input. Matches
 * the auth fields (tonal fill, 12px radius, gold focus). The parent keeps the
 * national number in state and composes E.164 via `toE164` on submit.
 */
export function PhoneInput({
  country,
  onChangeCountry,
  value,
  onChangeText,
  label = 'Phone number',
  labelClassName = 'mb-2 ml-1 text-sm font-semibold',
  placeholder = 'Enter your phone number',
}: PhoneInputProps) {
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();

  const results = useMemo(() => searchCountries(query), [query]);

  const openPicker = () => {
    selection();
    setQuery('');
    setPickerOpen(true);
  };

  const pick = (c: Country) => {
    selection();
    onChangeCountry(c);
    setPickerOpen(false);
  };

  return (
    <View className="w-full">
      <Text className={labelClassName} style={{ color: colors.muted }}>
        {label}
      </Text>
      <View
        className="w-full flex-row items-center rounded pr-4"
        style={{
          minHeight: 54,
          backgroundColor: focused ? colors.white : colors.lavSoft,
          borderWidth: 1.5,
          borderColor: focused ? colors.goldDeep : 'transparent',
        }}
      >
        <Pressable
          onPress={openPicker}
          className="h-full flex-row items-center rounded-l px-3 active:opacity-70"
          hitSlop={4}
        >
          <Text className="text-lg" style={{ marginRight: 6 }}>
            {flagEmoji(country.iso2)}
          </Text>
          <Text className="text-base font-semibold" style={{ color: colors.ink }}>
            +{country.dial}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.muted} style={{ marginLeft: 3 }} />
        </Pressable>
        <View className="mr-2 h-6 w-px" style={{ backgroundColor: colors.border }} />
        <TextInput
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ''))}
          placeholder={placeholder}
          placeholderTextColor={colors.faded}
          selectionColor={colors.goldDeep}
          cursorColor={colors.goldDeep}
          keyboardType="phone-pad"
          maxLength={15}
          className="flex-1 py-3.5 text-base"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ color: colors.ink, fontWeight: '500' }}
        />
      </View>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        transparent={false}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
            <Text className="flex-1 text-lg font-bold text-ink">Select country</Text>
            <Pressable
              onPress={() => setPickerOpen(false)}
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
    </View>
  );
}
