import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';

/** `mint` is the light-on-dark button on the emerald Welcome canvas. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'mint' | 'danger';

const fill: Record<Variant, { bg: string; fg: string }> = {
  // Start, Continue, Set PIN…: dark green words on a light green button, so
  // the label reads on every phone (owner's call, 2026-11-04).
  primary: { bg: pt.emerald300, fg: pt.emerald900 },
  secondary: { bg: pt.brandSoft, fg: pt.brand },
  ghost: { bg: 'transparent', fg: pt.brand },
  mint: { bg: pt.emerald300, fg: pt.emerald900 },
  // FAM-09 "Remove Aunty Ada": something that can't be undone.
  danger: { bg: pt.danger, fg: '#FFFFFF' },
};

interface PtButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  /** Leading icon (drawn in the label colour by the caller). */
  icon?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Prototype `pt-btn`: 52pt (or 40pt) tall, 12pt corners, bold 15pt label.
 *
 * The fill is drawn by an inner View, not by the Pressable: on some Android
 * phones the gesture-handler button doesn't paint its own background, which
 * left white labels on a white page. Layout from `style` (flex, margins,
 * alignSelf…) stays on the Pressable; a caller's background, height or
 * padding goes to the fill.
 */
export function PtButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: PtButtonProps) {
  const { bg, fg } = fill[variant];
  const inactive = disabled || loading;
  const {
    backgroundColor: bgOverride,
    height: heightOverride,
    paddingHorizontal: padOverride,
    borderRadius: radiusOverride,
    ...outer
  } = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const radius = (radiusOverride as number | undefined) ?? ptRadius.sm;

  return (
    <Pressable
      onPress={() => {
        if (inactive) return;
        selection();
        onPress?.();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        {
          borderRadius: radius,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        outer,
      ]}
    >
      <View
        style={{
          height: heightOverride ?? (size === 'md' ? 52 : 40),
          paddingHorizontal: padOverride ?? (size === 'md' ? 24 : 16),
          borderRadius: radius,
          backgroundColor: bgOverride ?? bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : (
            <>
              {icon}
              <Text
                style={{
                  fontFamily: ptFont.bold,
                  fontSize: size === 'md' ? 15 : 13,
                  letterSpacing: 0.08,
                  color: fg,
                }}
              >
                {title}
              </Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}
