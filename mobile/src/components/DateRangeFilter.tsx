import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { colors, shadow } from '../theme';
import { selection } from '../lib/haptics';

/**
 * Reusable date/time range filter — the common filter shared by every Dispute
 * Center category (transactions, withdrawals, projects, wallets, …). Presets
 * only; a custom from–to range would need a date-picker dependency.
 */
export type DateRangeKey = 'all' | '1h' | '24h' | '7d' | '3m';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const RANGES: { key: DateRangeKey; label: string; ms: number | null }[] = [
  { key: 'all', label: 'All', ms: null },
  { key: '1h', label: 'Last 1h', ms: HOUR },
  { key: '24h', label: 'Last 24h', ms: DAY },
  { key: '7d', label: 'Last 7 days', ms: 7 * DAY },
  { key: '3m', label: 'Last 3 months', ms: 90 * DAY },
];

/** Epoch-ms lower bound for a range (null = no bound / show everything). */
export function cutoffFor(key: DateRangeKey): number | null {
  const r = RANGES.find((x) => x.key === key);
  if (!r || r.ms == null) return null;
  return Date.now() - r.ms;
}

/** True if an ISO timestamp falls within the range. Undated items always pass. */
export function withinRange(iso: string | null | undefined, key: DateRangeKey): boolean {
  const cutoff = cutoffFor(key);
  if (cutoff == null || !iso) return true;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? true : t >= cutoff;
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeKey;
  onChange: (key: DateRangeKey) => void;
}) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {RANGES.map((r) => {
        const active = value === r.key;
        return (
          <Pressable
            key={r.key}
            onPress={() => {
              selection();
              onChange(r.key);
            }}
            className={`rounded-full px-3.5 py-2 active:opacity-80 ${active ? '' : 'bg-lav'}`}
            style={active ? [{ backgroundColor: colors.navy }, shadow.soft] : undefined}
          >
            <Text className={`text-[12px] font-semibold ${active ? 'text-white' : 'text-ink'}`}>
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
