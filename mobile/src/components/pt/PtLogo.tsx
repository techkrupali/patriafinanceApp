import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';

interface MarkColors {
  outer: string;
  middle: string;
  seed: string;
}

/** Logo colours on light surfaces and on the emerald canvas (tokens.css `--logo-*`). */
export const markOnLight: MarkColors = { outer: pt.emerald700, middle: pt.emerald500, seed: pt.gold500 };
export const markOnDark: MarkColors = { outer: pt.emerald50, middle: pt.emerald300, seed: pt.gold500 };

interface LogoMarkProps {
  /** Rendered width/height of the mark. */
  size: number;
  colors?: MarkColors;
  /** Ring thickness in mark units (the logo uses 8; the Welcome artwork uses 5). */
  stroke?: number;
  /** Seed radius and centre in mark units (the Welcome artwork uses r11 at y75). */
  seedR?: number;
  seedCy?: number;
}

/**
 * The Patriai mark: an outer ring, a lower inner ring and a gold seed. Drawn
 * with views from the logo's 100-unit geometry (outer r36 at y50, middle r22 at
 * y64, seed r10 at y72), cropped to the 88-unit box the prototype uses.
 */
export function LogoMark({ size, colors = markOnLight, stroke = 8, seedR = 10, seedCy = 72 }: LogoMarkProps) {
  const u = size / 88;
  const ring = (r: number, cy: number, color: string) => {
    const d = (r * 2 + stroke) * u;
    return (
      <View
        style={{
          position: 'absolute',
          left: (44 - r - stroke / 2) * u,
          top: (cy - 6 - r - stroke / 2) * u,
          width: d,
          height: d,
          borderRadius: d / 2,
          borderWidth: stroke * u,
          borderColor: color,
        }}
      />
    );
  };
  const seed = seedR * u;

  return (
    <View style={{ width: size, height: size }}>
      {ring(36, 50, colors.outer)}
      {ring(22, 64, colors.middle)}
      <View
        style={{
          position: 'absolute',
          left: 44 * u - seed,
          top: (seedCy - 6) * u - seed,
          width: seed * 2,
          height: seed * 2,
          borderRadius: seed,
          backgroundColor: colors.seed,
        }}
      />
    </View>
  );
}

/** Mark plus the lowercase "patriai" wordmark, side by side or stacked (splash). */
export function PtLogo({
  height = 30,
  onDark = false,
  stacked = false,
}: {
  height?: number;
  onDark?: boolean;
  stacked?: boolean;
}) {
  const ink = onDark ? pt.emerald50 : pt.emerald900;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Patriai"
      style={{ flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: stacked ? height * 0.1 : height * 0.12 }}
    >
      <LogoMark size={stacked ? height * 0.78 : height} colors={onDark ? markOnDark : markOnLight} />
      <Text
        style={{
          fontFamily: ptFont.extrabold,
          fontSize: stacked ? height * 0.34 : height * 0.92,
          lineHeight: stacked ? height * 0.4 : height * 1.05,
          letterSpacing: -0.5,
          color: ink,
          includeFontPadding: false,
        }}
      >
        patriai
      </Text>
    </View>
  );
}
