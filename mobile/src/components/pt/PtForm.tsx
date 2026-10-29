import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';
import { PtCheckbox, PtRadio } from './PtCheck';
import { PtSwitch } from './PtTabScreen';

/** Uppercase group label ("WHAT IS IT FOR", "IF YOU NEED IT EARLY"). */
export function PtGroupLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 0.96, color: pt.inkMuted, textTransform: 'uppercase' }}>{children}</Text>
  );
}

export const PtDivider = () => <View style={{ height: 1, backgroundColor: pt.line }} />;

/**
 * A choice as a card (templates, "Just me / Shared", how money comes in, lock,
 * missed save): optional icon circle, title and line, radio or checkbox; the
 * chosen one turns mint with a brand border.
 */
export function PtChoiceCard({
  title,
  subtitle,
  icon,
  selected,
  kind = 'radio',
  onPress,
  extra,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  selected: boolean;
  kind?: 'radio' | 'check';
  onPress: () => void;
  /** Shown under the subtitle when chosen ("✓ Earns more"). */
  extra?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      // "button" + selected: RNGH's Pressable ignores taps on radio/checkbox roles on web.
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: ptRadius.md,
        borderWidth: 2,
        borderColor: selected ? pt.brand : 'transparent',
        backgroundColor: selected ? pt.brandSoft : pt.raised,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? pt.brand : pt.brandSoft,
          }}
        >
          <Feather name={icon} size={18} color={selected ? pt.onBrand : pt.brand} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: selected ? pt.brand : pt.ink }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{subtitle}</Text> : null}
        {selected && extra ? <View style={{ marginTop: 4 }}>{extra}</View> : null}
      </View>
      {kind === 'radio' ? <PtRadio checked={selected} /> : <PtCheckbox checked={selected} />}
    </Pressable>
  );
}

/** Rounded pills, one or many chosen (Rent · School…, ₦50,000 · ₦100,000…). */
export function PtPills<T extends string | number>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: { value: T; label: string }[];
  value: T | T[] | null;
  onChange: (value: T) => void;
  /** Smaller pills that fit a row of filters (PRJ-01 "All · In progress · Saving · Done"). */
  compact?: boolean;
}) {
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 8 : 10 }}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              selection();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              height: compact ? 36 : 40,
              paddingHorizontal: compact ? 14 : 16,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: on ? 2 : 1.5,
              borderColor: on ? pt.brand : pt.lineStrong,
              backgroundColor: on ? pt.brandSoft : pt.raised,
            }}
          >
            <Text style={{ fontFamily: on ? ptFont.semibold : ptFont.medium, fontSize: compact ? 14 : 15, color: on ? pt.brand : pt.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sunken track with a white chosen segment (₦100 · ₦500 · ₦1,000; 1 of 3 · 2 of 3 · All 3). */
export function PtSegmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: pt.sunken, borderRadius: ptRadius.sm, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              selection();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: 40,
              paddingHorizontal: 6,
              paddingVertical: 4,
              borderRadius: ptRadius.sm - 3,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? pt.raised : 'transparent',
            }}
          >
            {/* A long label ("Share of income") wraps centred, as in JNT-02. */}
            <Text style={{ fontFamily: on ? ptFont.semibold : ptFont.medium, fontSize: 15, lineHeight: 19, textAlign: 'center', color: on ? pt.brand : pt.inkMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Title + line on the left, a switch on the right. */
export function PtSwitchRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
  right,
}: {
  title: string;
  subtitle?: string;
  value?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  /** Instead of a switch, e.g. "Always on". */
  right?: React.ReactNode;
}) {
  return (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{subtitle}</Text> : null}
      </View>
      {right ?? <PtSwitch value={Boolean(value)} onChange={(v) => onChange?.(v)} disabled={disabled} label={title} />}
    </View>
  );
}

const NOTE_TONES = {
  info: { bg: pt.infoSoft, fg: pt.ink, icon: pt.info, name: 'info' as const },
  success: { bg: pt.brandSoft, fg: pt.ink, icon: pt.brand, name: 'check' as const },
  warning: { bg: '#FDEBC8', fg: pt.ink, icon: '#8F5400', name: 'lock' as const },
  attention: { bg: '#FDEBC8', fg: pt.ink, icon: '#8F5400', name: 'info' as const },
};

/** Tinted note under a step ("Saving automatically is how most families reach their goal…"). */
export function PtNote({
  tone = 'info',
  icon,
  children,
}: {
  tone?: keyof typeof NOTE_TONES;
  /** Instead of the tone's own ("lock" on JNT-04's blue note). */
  icon?: React.ComponentProps<typeof Feather>['name'];
  children: React.ReactNode;
}) {
  const t = NOTE_TONES[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.bg, borderRadius: ptRadius.md, padding: 14 }}>
      <Feather name={icon ?? t.name} size={16} color={t.icon} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: t.fg }}>{children}</Text>
    </View>
  );
}

/** Small label, bold value, a line under it and Edit — review cards and settings like "How often". */
export function PtReviewRow({
  label,
  value,
  sub,
  onEdit,
  last = false,
}: {
  label: string;
  value: string;
  sub?: string | null;
  onEdit?: () => void;
  last?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{label}</Text>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{value}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      {onEdit ? (
        <Pressable
          onPress={() => {
            selection();
            onEdit();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label.toLowerCase()}`}
        >
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Edit</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** White card with side padding; rows inside draw their own dividers. */
export function PtPanel({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: padded ? 16 : 0, paddingVertical: padded ? 4 : 0 }}>
      {children}
    </View>
  );
}
