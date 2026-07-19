import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, shadow } from '../theme';

/**
 * The Patriai mark — a deep-indigo squircle with a bold monogram "P", a soft
 * inner light, and a single champagne-gold accent bar. Custom, not a stock icon.
 */
export function Logo({ size = 88, elevated = true }: { size?: number; elevated?: boolean }) {
  const r = size * 0.31;
  return (
    <LinearGradient
      colors={gradients.navy}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        elevated ? shadow.hero : undefined,
      ]}
    >
      {/* soft top-right inner light */}
      <View
        style={{
          position: 'absolute',
          top: -size * 0.28,
          right: -size * 0.24,
          width: size * 0.82,
          height: size * 0.82,
          borderRadius: size,
          backgroundColor: 'rgba(96,137,244,0.38)',
        }}
      />
      {/* faint bottom shade for depth */}
      <View
        style={{
          position: 'absolute',
          bottom: -size * 0.3,
          left: -size * 0.2,
          width: size * 0.75,
          height: size * 0.75,
          borderRadius: size,
          backgroundColor: 'rgba(11,18,51,0.35)',
        }}
      />
      <Text
        style={{
          color: '#fff',
          fontSize: size * 0.54,
          fontWeight: '900',
          letterSpacing: -1,
          marginBottom: size * 0.06,
          includeFontPadding: false,
        }}
      >
        P
      </Text>
      {/* champagne-gold accent bar */}
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.17,
          width: size * 0.32,
          height: Math.max(3, size * 0.05),
          borderRadius: 999,
          backgroundColor: colors.gold,
        }}
      />
    </LinearGradient>
  );
}
