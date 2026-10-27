import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { pt, ptFont } from '../../theme';

/** `pt-ring` goal ring: sunken track, gold arc from 12 o'clock, % in the middle. */
export function PtRing({
  percent,
  size = 56,
  stroke = 6,
  color = pt.gold500,
  track = pt.sunken,
  labelColor = pt.ink,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  labelColor?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: size >= 80 ? 22 : 12, letterSpacing: -0.24, color: labelColor }}>
        {Math.round(p)}%
      </Text>
    </View>
  );
}
