import React from 'react';
import { ActivityIndicator, Text, View, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';

/** `mint` is the light-on-dark button on the emerald Welcome canvas. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'mint';

const fill: Record<Variant, { bg: string; fg: string }> = {
  primary: { bg: pt.brand, fg: pt.onBrand },
  secondary: { bg: pt.brandSoft, fg: pt.brand },
  ghost: { bg: 'transparent', fg: pt.brand },
  mint: { bg: pt.emerald300, fg: pt.emerald900 },
};

interface PtButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/** Prototype `pt-btn`: 52pt (or 40pt) tall, 12pt corners, bold 15pt label. */
export function PtButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: PtButtonProps) {
  const { bg, fg } = fill[variant];
  const inactive = disabled || loading;

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
          height: size === 'md' ? 52 : 40,
          paddingHorizontal: size === 'md' ? 24 : 16,
          borderRadius: ptRadius.sm,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
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
        )}
      </View>
    </Pressable>
  );
}
