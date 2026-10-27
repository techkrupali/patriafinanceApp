import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';
import { PtText } from './PtText';

/** White card (18pt corners) that holds rows separated by hairlines. */
export function PtCard({ children, style, padded = false }: { children: React.ReactNode; style?: ViewStyle; padded?: boolean }) {
  return (
    <View
      style={[
        { backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 },
        padded ? { paddingVertical: 14 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** "MEMBERS" style overline heading, with an optional link on the right. */
export function PtSectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <PtText variant="overline" color={pt.inkMuted} accessibilityRole="header">
        {title.toUpperCase()}
      </PtText>
      {action && onAction ? (
        <Pressable
          onPress={() => {
            selection();
            onAction();
          }}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface PtRowProps {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  left?: React.ReactNode;
  /** Text or a node on the right (a chip, an amount). */
  right?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
  minHeight?: number;
  disabled?: boolean;
}

/** One row in a PtCard: optional leading visual, title/subtitle, trailing value and chevron. */
export function PtRow({
  title,
  subtitle,
  subtitleColor = pt.inkMuted,
  left,
  right,
  chevron = false,
  onPress,
  last = false,
  minHeight = 60,
  disabled = false,
}: PtRowProps) {
  const body = (
    <View
      style={{
        minHeight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: pt.line,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 22, color: pt.ink }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontFamily: ptFont.medium, fontSize: 12, lineHeight: 16, color: subtitleColor }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof right === 'string' ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{right}</Text>
      ) : (
        right ?? null
      )}
      {chevron ? <Feather name="chevron-right" size={18} color={pt.inkSubtle} /> : null}
    </View>
  );

  if (!onPress || disabled) return body;
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
    >
      {body}
    </Pressable>
  );
}

/** Square brand-soft icon tile used at the start of wallet rows. */
export function PtIconTile({ children, size = 40, round = false }: { children: React.ReactNode; size?: number; round?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : ptRadius.sm,
        backgroundColor: pt.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}
