import type { ViewStyle } from 'react-native';

/**
 * Patriai design language — "Indigo Heritage".
 *
 * A premium, trustworthy fintech system: deep indigo hero surfaces, a rich royal
 * accent blue, and a single restrained champagne-gold used only for premium
 * moments (logo detail, verified/premium marks, money-in highlights). Backgrounds
 * are a soft aurora — never flat white. Token NAMES are kept stable so every
 * screen keeps working; values were tuned for depth and rhythm.
 */
export const colors = {
  // Deep indigo hero + text
  navy: '#0B1233', // deepest indigo (hero base, headings)
  navyLight: '#1B2A63',
  ink: '#0D1430', // primary text

  // Royal accent blue (links, active, positive)
  brand: '#2E5BF0',
  brandDeep: '#1E40C8',
  brandMint: '#6089F4',
  brandGlow: '#C6D6FF',

  // Champagne gold — premium accent, used sparingly
  gold: '#E4B15C',
  goldDeep: '#CE9736',
  goldSoft: '#F7EDD7',

  // Soft indigo tints (fills, chips)
  lav: '#D6E1FA',
  lavSoft: '#E7EEFE',
  lavFaint: '#EFF3FE',

  // Backgrounds
  page: '#F3F6FD', // base page tint (aurora sits on top)
  pageTop: '#E9EEFF', // top aurora tint

  // Text greys
  muted: '#59647F',
  faded: '#93A0BE',

  // States
  danger: '#D5443C',
  dangerSoft: '#FCEAE8',
  success: '#2E5BF0', // success reads blue (no green)
  successSoft: '#E9EEFF',
  rose: '#EF5D6B', // money-out accent
  roseSoft: '#FDEBEE',

  card: '#FFFFFF',
  border: '#E5E9F5',
  white: '#FFFFFF',
} as const;

/** LinearGradient colour stops (tuples so expo-linear-gradient accepts them). */
export const gradients = {
  // Hero — deep indigo → royal (the money card / primary buttons)
  navy: ['#12204F', '#233F97'] as const,
  navyDeep: ['#0B1233', '#17245A'] as const,
  brand: ['#2E5BF0', '#1E40C8'] as const,
  mint: ['#3D6BF5', '#6089F4'] as const,
  glow: ['#2E5BF0', '#C6D6FF'] as const,
  /** Page-top aurora that melts into the background. */
  glowSoft: ['#E9EEFF', '#F6F8FF'] as const,
  lav: ['#E7EEFE', '#D6E1FA'] as const,
  avatar: ['#1B2A63', '#2E5BF0'] as const,
  /** Premium gold sheen. */
  gold: ['#EEC57A', '#D69A3E'] as const,
  /** Full-page aurora backdrop — cool indigo drifting to a warm hint. */
  aurora: ['#ECF0FF', '#F3F6FD', '#FBF8F1'] as const,
} as const;

/** Layered soft elevation — premium fintech shadows. */
export const shadow: Record<'card' | 'soft' | 'hero' | 'tab' | 'gold', ViewStyle> = {
  card: {
    shadowColor: '#0B1233',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  soft: {
    shadowColor: '#0D1430',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  hero: {
    shadowColor: '#12204F',
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  tab: {
    shadowColor: '#0B1233',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  gold: {
    shadowColor: '#CE9736',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
