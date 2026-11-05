import React from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { LoadError } from '../../components/LoadError';
import { PtButton } from '../../components/pt/PtButton';
import { selection } from '../../lib/haptics';

/** Two cards side by side: the dark one leads (INS-01 "In this month", INS-03 "Balance"). */
export function StatPair({
  dark,
  light,
}: {
  dark: { label: string; value: string; note?: string | null };
  light: { label: string; value: string; note?: string | null; noteColor?: string };
}) {
  const card = (c: { label: string; value: string; note?: string | null; noteColor?: string }, onDark: boolean) => (
    <View style={{ flex: 1, backgroundColor: onDark ? pt.emerald900 : pt.raised, borderRadius: ptRadius.sm, paddingHorizontal: 14, paddingVertical: 14, gap: 2 }}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: onDark ? pt.onDarkMuted : pt.inkMuted }} numberOfLines={1}>
        {c.label}
      </Text>
      <Text
        style={{ fontFamily: ptFont.extrabold, fontSize: 21, letterSpacing: -0.4, color: onDark ? '#FFFFFF' : pt.ink }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {c.value}
      </Text>
      {c.note ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: c.noteColor ?? (onDark ? pt.onDarkMuted : pt.inkMuted) }} numberOfLines={2}>
          {c.note}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {card(dark, true)}
      {card(light, false)}
    </View>
  );
}

/** Loading, a load error with Try again, or the page. */
export function Loaded({ query, children }: { query: { isLoading: boolean; error: unknown; refetch: () => unknown }; children: () => React.ReactNode }) {
  if (query.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 32 }} />;
  if (query.error) return <LoadError message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  return <>{children()}</>;
}

/** A thin track with a fill, and a "today" tick (INS-04). */
export function Track({ percent, color, marker }: { percent: number; color: string; marker?: number | null }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ height: 8, justifyContent: 'center' }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: pt.sunken, overflow: 'hidden' }}>
        <View style={{ width: `${p}%`, minWidth: p > 0 ? 8 : 0, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
      {marker !== null && marker !== undefined ? (
        <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, marker))}%`, top: -4, width: 2, height: 16, marginLeft: -1, borderRadius: 1, backgroundColor: pt.ink }} />
      ) : null}
    </View>
  );
}

/** A coloured square and its words: the chart legends. */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: i.color }} />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Nothing to show yet: a line and, maybe, a way to start. */
export function Empty({ icon, title, body, action, onAction }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={24} color={pt.brand} />
      </View>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 18, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">
        {title}
      </Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted, textAlign: 'center', maxWidth: 300 }}>{body}</Text>
      {action && onAction ? <PtButton title={action} variant="secondary" onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 4 }} /> : null}
    </View>
  );
}

/** A round icon button in the page's top bar (INS-07 "+"). */
export function HeaderIcon({ icon, label, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Feather name={icon} size={24} color={pt.ink} />
    </Pressable>
  );
}

/** Open a download link: a new tab on the web, the browser on a phone. */
export function openDownload(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank');
  else void Linking.openURL(url);
}

/** '2026-12-01' → '1 Dec' */
export function dayMonth(ymd: string | null | undefined): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return '';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${names[Number(m[2]) - 1]}`;
}

/** "₦615k", "₦1.2m": short money for chips and the middle of a ring. */
export function nairaShort(value: string | number | null | undefined): string {
  const n = Math.max(0, typeof value === 'number' ? value : parseFloat(value ?? '0') || 0);
  if (n >= 1_000_000) return `₦${(Math.round(n / 100_000) / 10).toLocaleString('en-NG')}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000).toLocaleString('en-NG')}k`;
  return `₦${Math.round(n)}`;
}
