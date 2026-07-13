import type { ViewStyle } from 'react-native';

/**
 * The Patriai brand palette as JS constants, for the many places that need a
 * literal color instead of a Tailwind class: LinearGradient stops, icon `color`
 * props, ActivityIndicator / RefreshControl tints and native tab-bar styling.
 * Mirrors tailwind.config.js.
 */
export const colors = {
  navy: '#001736',
  navyLight: '#002b5c',
  ink: '#0b1c30',
  brand: '#006c49',
  brandMint: '#4edea3',
  brandGlow: '#6cf8bb',
  lav: '#d3e4fe',
  lavSoft: '#e5eeff',
  lavFaint: '#eff4ff',
  page: '#f8f9ff',
  muted: '#64748b',
  faded: '#94a3b8',
  danger: '#ba1a1a',
  dangerSoft: '#ffdad6',
  success: '#047857',
  successSoft: '#ecfdf5',
  card: '#ffffff',
  border: '#e8ecf4',
  white: '#ffffff',
  rose: '#fb7185',
  roseSoft: '#fee2e2',
} as const;

/** LinearGradient colour stops (typed as tuples so expo-linear-gradient accepts them). */
export const gradients = {
  navy: ['#001736', '#002b5c'] as const,
  navyDeep: ['#00224d', '#001024'] as const,
  brand: ['#006c49', '#04a06a'] as const,
  mint: ['#04a06a', '#4edea3'] as const,
  glow: ['#0b7a56', '#6cf8bb'] as const,
  lav: ['#e5eeff', '#d3e4fe'] as const,
  avatar: ['#002b5c', '#006c49'] as const,
};

/** Reusable soft elevation for cards / floating surfaces. */
export const shadow: Record<'card' | 'soft' | 'hero' | 'tab', ViewStyle> = {
  card: {
    shadowColor: '#001736',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  soft: {
    shadowColor: '#0b1c30',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  hero: {
    shadowColor: '#001736',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  tab: {
    shadowColor: '#001736',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
};
