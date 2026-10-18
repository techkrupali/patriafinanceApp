import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { colors } from '../theme';
import { selection } from '../lib/haptics';
import type { SavingsFrequency } from '../api/types';

export const FREQUENCY_LABEL: Record<SavingsFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const WEEKDAY_LABEL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "every Monday" / "monthly on day 5" / "every day" */
export function scheduleLabel(frequency: SavingsFrequency, dayOfWeek: number, dayOfMonth: number): string {
  if (frequency === 'weekly') return `every ${WEEKDAY_LABEL[dayOfWeek]}`;
  if (frequency === 'monthly') return `monthly on day ${dayOfMonth}`;
  return 'every day';
}

interface FrequencyPickerProps {
  frequency: SavingsFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  onChange: (next: { frequency: SavingsFrequency; dayOfWeek: number; dayOfMonth: number }) => void;
  disabled?: boolean;
}

function Chip({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        selection();
        onPress();
      }}
      className={`items-center rounded px-3.5 py-2 ${active ? 'bg-navy' : 'bg-lav'}`}
    >
      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
}

/** How often money moves, and on which day (savings plans and auto-saves). */
export function FrequencyPicker({ frequency, dayOfWeek, dayOfMonth, onChange, disabled }: FrequencyPickerProps) {
  const set = (patch: Partial<{ frequency: SavingsFrequency; dayOfWeek: number; dayOfMonth: number }>) =>
    onChange({ frequency, dayOfWeek, dayOfMonth, ...patch });

  return (
    <View style={disabled ? { opacity: 0.55 } : undefined}>
      <View className="flex-row rounded bg-page-top p-1" style={{ gap: 4 }}>
        {(Object.keys(FREQUENCY_LABEL) as SavingsFrequency[]).map((f) => {
          const active = f === frequency;
          return (
            <Pressable
              key={f}
              disabled={disabled}
              onPress={() => {
                selection();
                set({ frequency: f });
              }}
              className="flex-1 items-center rounded py-2.5"
              style={active ? { backgroundColor: colors.white } : undefined}
            >
              <Text className={`text-[13px] ${active ? 'font-bold text-navy' : 'font-medium text-muted'}`}>{FREQUENCY_LABEL[f]}</Text>
            </Pressable>
          );
        })}
      </View>

      {frequency === 'weekly' ? (
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <Chip key={d} label={WEEKDAY_SHORT[d]} active={d === dayOfWeek} onPress={() => set({ dayOfWeek: d })} disabled={disabled} />
          ))}
        </View>
      ) : null}

      {frequency === 'monthly' ? (
        <>
          <Text className="mb-2 mt-3 text-[12px] text-muted">Day of the month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <Chip key={d} label={String(d)} active={d === dayOfMonth} onPress={() => set({ dayOfMonth: d })} disabled={disabled} />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}
