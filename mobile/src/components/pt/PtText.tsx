import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { pt, ptFont } from '../../theme';

/**
 * Prototype type scale (tokens.css). Letter spacing is converted from em to
 * points at each size: -0.025em at 28pt is -0.7.
 */
const variants = {
  hero: { fontFamily: ptFont.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  headline: { fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  title: { fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.33 },
  subtitle: { fontFamily: ptFont.bold, fontSize: 17, lineHeight: 24, letterSpacing: -0.17 },
  body: { fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: ptFont.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: ptFont.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.13 },
  caption: { fontFamily: ptFont.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: ptFont.bold, fontSize: 11, lineHeight: 16, letterSpacing: 0.88 },
} satisfies Record<string, TextStyle>;

export type PtTextVariant = keyof typeof variants;

interface PtTextProps extends TextProps {
  variant?: PtTextVariant;
  color?: string;
}

export function PtText({ variant = 'body', color = pt.ink, style, ...rest }: PtTextProps) {
  return <Text {...rest} style={[variants[variant], { color }, style]} />;
}
