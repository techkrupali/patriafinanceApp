import type { ViewStyle } from 'react-native';

/**
 * Patriai design language — "The Curated Ledger" (client design system).
 *
 * High-end editorial family finance: a bright layered surface stack (no hard
 * borders — boundaries come from tonal shifts), a deep treasury navy for hero
 * money cards, a metallic gold primary for actions, and a grounded green used
 * for every positive financial signal. Token NAMES are kept stable so every
 * screen repaints without edits; values map to the client's Material tokens.
 */
export const colors = {
  // Deep treasury navy (hero money surfaces, dark chips)
  navy: '#011D35', // on-secondary-fixed — the Treasury card base
  navyLight: '#173A5C',
  ink: '#171C1F', // on-surface — primary text (never pure black)

  // Positive/action green (tertiary) — all positive financial trends
  brand: '#006D2F',
  brandDeep: '#005322',
  brandMint: '#3DE273', // tertiary-fixed-dim
  brandGlow: '#66FF8E', // tertiary-fixed

  // Metallic gold primary — the Ledger's signature action colour
  gold: '#F1C100', // inverse-primary / primary-fixed-dim
  goldDeep: '#745B00', // primary
  goldSoft: '#FFE08B', // primary-fixed

  // Tonal surface tints (chips, fills) — surface-variant family
  lav: '#DFE3E7', // surface-variant
  lavSoft: '#E4E9ED', // surface-container-high
  lavFaint: '#EAEEF2', // surface-container

  // Backgrounds — the surface stack
  page: '#F6FAFE', // surface
  pageTop: '#F0F4F8', // surface-container-low

  // Text hierarchy
  muted: '#49607C', // secondary — supporting text & labels
  faded: '#8C9AA9', // quiet metadata

  // States
  danger: '#BA1A1A', // error
  dangerSoft: '#FFDAD6', // error-container
  success: '#006D2F', // tertiary green
  successSoft: '#E2F3E9',
  rose: '#93000A', // money-out accent (on-error-container)
  roseSoft: '#FFE9E6',

  card: '#FFFFFF', // surface-container-lowest
  border: '#E4E9ED', // soft tonal divider (used sparingly — no-line rule)
  white: '#FFFFFF',
} as const;

/** LinearGradient colour stops (tuples so expo-linear-gradient accepts them). */
export const gradients = {
  // Hero — deep treasury navy (the money card)
  navy: ['#011D35', '#12324F'] as const,
  navyDeep: ['#001526', '#0B2A44'] as const,
  // Positive green actions/tiles
  brand: ['#005322', '#0F8A44'] as const,
  mint: ['#0F8A44', '#3DE273'] as const,
  glow: ['#006D2F', '#66FF8E'] as const,
  /** Page-top wash that melts into the background. */
  glowSoft: ['#F0F4F8', '#F6FAFE'] as const,
  lav: ['#EAEEF2', '#DFE3E7'] as const,
  // Slate secondary avatars
  avatar: ['#314863', '#49607C'] as const,
  /** Signature metallic gold — primary (#745B00) → primary-container (#FFCC00) at 135°. */
  gold: ['#745B00', '#FFCC00'] as const,
  /** Full-page backdrop — cool surface drifting into a warm gold hint. */
  aurora: ['#F0F4F8', '#F6FAFE', '#FBF7EA'] as const,
} as const;

/** Ambient elevation — on-surface-tinted, never pure black (Curated Ledger). */
export const shadow: Record<'card' | 'soft' | 'hero' | 'tab' | 'gold', ViewStyle> = {
  card: {
    shadowColor: '#171C1F',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  soft: {
    shadowColor: '#171C1F',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  hero: {
    shadowColor: '#011D35',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  tab: {
    shadowColor: '#171C1F',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  gold: {
    shadowColor: '#745B00',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
