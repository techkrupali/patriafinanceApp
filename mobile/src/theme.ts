import type { ViewStyle } from 'react-native';

/**
 * Patriai design language — "The Curated Ledger" (client design system,
 * navy+green revision per client video 2026-08-03).
 *
 * High-end editorial family finance: a bright layered surface stack (no hard
 * borders — boundaries come from tonal shifts), a deep treasury navy for hero
 * money cards, and a grounded green for actions and every positive financial
 * signal. The gold scheme is retired ("I do not want to use this colour
 * scheme") — the gold* token NAMES are kept so every screen repaints without
 * edits, but their values now resolve to the green action family.
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

  // Action colour — grounded green (was metallic gold; retired per client)
  gold: '#0F8A44', // bright action green
  goldDeep: '#006D2F', // deep action green (tints, icons, labels on soft fills)
  goldSoft: '#DFF2E5', // soft green fill (tiles, active pills)

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
  /** Signature action gradient — deep green → bright green at 135° (was gold). */
  gold: ['#005322', '#0F8A44'] as const,
  /** Full-page backdrop — cool surface drifting into a faint green hint. */
  aurora: ['#F0F4F8', '#F6FAFE', '#EFF7F1'] as const,
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
  // Client rule (video 2026-08-03): no deep/heavy shadows — soft blurry only.
  hero: {
    shadowColor: '#011D35',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  tab: {
    shadowColor: '#171C1F',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  gold: {
    shadowColor: '#006D2F',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};
