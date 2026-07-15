import type { ViewStyle } from 'react-native';

/**
 * Patriai palette — a clean white + blue system (no green). The token NAMES are
 * kept stable so every screen/component keeps working; only the values changed.
 * `brand` / `success` are now blue, so accents, links, "money in", verified
 * states and success checks all read blue instead of green.
 */
export const colors = {
  navy: '#0a1f44', // primary dark (hero, buttons, headings)
  navyLight: '#12376e',
  ink: '#0f1e38',
  brand: '#1f6feb', // accent blue (links, active, credit, success ticks)
  brandMint: '#4f9bff', // lighter accent blue
  brandGlow: '#bcd7ff', // soft blue for glows/tints
  lav: '#d7e5fb',
  lavSoft: '#e8f0fe',
  lavFaint: '#f0f5ff',
  page: '#f6f9ff',
  muted: '#64748b',
  faded: '#98a6bd',
  danger: '#c62828',
  dangerSoft: '#fde8e8',
  success: '#1f6feb', // "success" is blue in this theme (no green)
  successSoft: '#eaf1ff',
  card: '#ffffff',
  border: '#e6ecf6',
  white: '#ffffff',
  rose: '#ef5b6e', // money-out accent (kept red-ish, not green)
  roseSoft: '#fdeaec',
} as const;

/** LinearGradient colour stops (typed as tuples so expo-linear-gradient accepts them). Blue/navy only. */
export const gradients = {
  navy: ['#0a1f44', '#12376e'] as const,
  navyDeep: ['#0c2555', '#07152f'] as const,
  brand: ['#1f6feb', '#1657c9'] as const,
  mint: ['#2f7ff0', '#4f9bff'] as const,
  glow: ['#1f6feb', '#bcd7ff'] as const,
  /** Barely-there blue haze that melts into the page background (hero backdrops). */
  glowSoft: ['#eaf1ff', '#f8f9ff'] as const,
  lav: ['#e8f0fe', '#d7e5fb'] as const,
  avatar: ['#12376e', '#1f6feb'] as const,
};

/** Reusable soft elevation for cards / floating surfaces. */
export const shadow: Record<'card' | 'soft' | 'hero' | 'tab', ViewStyle> = {
  card: {
    shadowColor: '#0a1f44',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  soft: {
    shadowColor: '#0f1e38',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  hero: {
    shadowColor: '#0a1f44',
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  tab: {
    shadowColor: '#0a1f44',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
};
