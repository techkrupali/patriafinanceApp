import type { ViewStyle } from 'react-native';

/**
 * Patriai palette — a clean, light, Google-Pay style white + single-blue system
 * (no green, no dark hero, no gradients). Token NAMES are kept stable so every
 * screen/component keeps working; only the values changed. `navy`/`ink` now read
 * near-black so headings stay dark (not blue); `brand`/`success` are one restrained
 * Google blue used sparingly for links, line icons, active states and the primary CTA.
 */
export const colors = {
  navy: '#202124', // near-black primary text (headings, dark labels)
  navyLight: '#3c4043',
  ink: '#202124',
  brand: '#1a73e8', // the single Google blue (links, icons, primary, credit ticks)
  brandMint: '#5e9bf0', // lighter blue (used rarely)
  brandGlow: '#c6dcfb', // soft blue tint (used rarely)
  lav: '#d9e7fd', // active tab pill / active chip
  lavSoft: '#e8f0fe', // icon tiles / soft accents
  lavFaint: '#f1f5fa', // default flat card / tile fill
  page: '#ffffff', // screens are white
  muted: '#5f6472', // secondary text
  faded: '#9aa4b2', // tertiary / placeholder
  danger: '#c5221f',
  dangerSoft: '#fce8e6',
  success: '#1a73e8', // "success" is blue in this theme (no green)
  successSoft: '#e8f0fe',
  card: '#ffffff',
  border: '#eceff3', // hairlines
  white: '#ffffff',
  rose: '#d93025', // money-out accent (kept red-ish, not green)
  roseSoft: '#fce8e6',
} as const;

/**
 * LinearGradient colour stops (typed as tuples so expo-linear-gradient still
 * accepts them). LinearGradient has been removed from the UI — these are kept
 * flat / same-colour so any stray usage renders light and calm.
 */
export const gradients = {
  navy: ['#ffffff', '#f5f8fe'] as const,
  navyDeep: ['#ffffff', '#f5f8fe'] as const,
  brand: ['#1a73e8', '#1a73e8'] as const,
  mint: ['#5e9bf0', '#5e9bf0'] as const,
  glow: ['#c6dcfb', '#c6dcfb'] as const,
  lav: ['#e8f0fe', '#d9e7fd'] as const,
  avatar: ['#e8f0fe', '#e8f0fe'] as const,
};

/** Reusable elevation. Cards are effectively flat; only the tab bar keeps a faint lift. */
export const shadow: Record<'card' | 'soft' | 'hero' | 'tab', ViewStyle> = {
  card: {
    shadowColor: '#202124',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  soft: {
    shadowColor: '#202124',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  hero: {
    shadowColor: '#202124',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  tab: {
    shadowColor: '#202124',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
};
