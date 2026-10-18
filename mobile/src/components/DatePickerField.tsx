import React, { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { formatYmd, parseYmd, toYmd } from '../lib/format';
import { selection } from '../lib/haptics';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface DatePickerFieldProps {
  label?: string;
  /** YYYY-MM-DD, or null when empty. */
  value: string | null;
  onChange: (ymd: string | null) => void;
  /** Earliest pickable day (YYYY-MM-DD). */
  minDate?: string;
  placeholder?: string;
  /** Show a "Clear" action (for optional dates). */
  clearable?: boolean;
  className?: string;
}

/** Date field with a month-calendar sheet — no native date-picker dependency. */
export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  placeholder = 'Choose a date',
  clearable = false,
  className = '',
}: DatePickerFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  const min = parseYmd(minDate);
  const start = selected ?? min ?? new Date();
  const [month, setMonth] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) => {
    selection();
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  const prevDisabled = min !== null && new Date(month.y, month.m, 1) <= new Date(min.getFullYear(), min.getMonth(), 1);

  return (
    <View className={className}>
      {label ? <Text className="mb-2 text-[13px] font-semibold text-muted">{label}</Text> : null}
      <Pressable
        onPress={() => {
          selection();
          setMonth({ y: start.getFullYear(), m: start.getMonth() });
          setOpen(true);
        }}
        className="flex-row items-center rounded bg-lav-faint px-4 active:opacity-90"
        style={{ minHeight: 54 }}
      >
        <Ionicons name="calendar-outline" size={19} color={colors.faded} style={{ marginRight: 10 }} />
        <Text className={`flex-1 text-[15px] ${value ? 'font-semibold text-ink' : 'text-faded'}`}>
          {value ? formatYmd(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t bg-white px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
              <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-lav" />
              <View className="mb-3 flex-row items-center">
                <Pressable onPress={() => !prevDisabled && shift(-1)} hitSlop={8} className="h-9 w-9 items-center justify-center rounded bg-lav-faint">
                  <Ionicons name="chevron-back" size={18} color={prevDisabled ? colors.faded : colors.navy} />
                </Pressable>
                <Text className="flex-1 text-center text-[16px] font-bold text-ink">
                  {MONTHS[month.m]} {month.y}
                </Text>
                <Pressable onPress={() => shift(1)} hitSlop={8} className="h-9 w-9 items-center justify-center rounded bg-lav-faint">
                  <Ionicons name="chevron-forward" size={18} color={colors.navy} />
                </Pressable>
              </View>

              <View className="flex-row">
                {WEEKDAYS.map((w) => (
                  <Text key={w} className="flex-1 pb-2 text-center text-[12px] font-semibold text-muted">
                    {w}
                  </Text>
                ))}
              </View>
              {Array.from({ length: cells.length / 7 }, (_, row) => (
                <View key={row} className="flex-row">
                  {cells.slice(row * 7, row * 7 + 7).map((day, i) => {
                    if (!day) return <View key={i} className="flex-1" style={{ height: 42 }} />;
                    const date = new Date(month.y, month.m, day);
                    const disabled = min !== null && date < min;
                    const isSelected = selected !== null && toYmd(date) === toYmd(selected);
                    return (
                      <Pressable
                        key={i}
                        disabled={disabled}
                        onPress={() => {
                          selection();
                          onChange(toYmd(date));
                          setOpen(false);
                        }}
                        className="flex-1 items-center justify-center"
                        style={{ height: 42 }}
                      >
                        <View className={`h-9 w-9 items-center justify-center rounded ${isSelected ? 'bg-navy' : ''}`}>
                          <Text className={`text-[14px] ${isSelected ? 'font-bold text-white' : disabled ? 'text-faded' : 'font-medium text-ink'}`}>
                            {day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              <View className="mt-3 flex-row" style={{ gap: 10 }}>
                {clearable && value ? (
                  <Pressable
                    onPress={() => {
                      selection();
                      onChange(null);
                      setOpen(false);
                    }}
                    className="flex-1 items-center rounded bg-lav py-3"
                  >
                    <Text className="text-[14px] font-bold text-navy">Clear</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setOpen(false)} className="flex-1 items-center rounded bg-lav-faint py-3">
                  <Text className="text-[14px] font-bold text-muted">Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
