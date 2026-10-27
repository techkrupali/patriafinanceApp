import type { ViewStyle } from 'react-native';

/**
 * Patriai design language — "The Curated Ledger" (client design system,
 * navy+green revision per client video 2026-08-03).
 *
 * High-end editorial family finance: a bright layered surface stack, a deep
 * treasury navy for hero money cards, and a grounded green for actions and
 * every positive financial signal. The gold scheme is retired ("I do not want
 * to use this colour scheme") — the gold* token NAMES are kept so every screen
 * repaints without edits, but their values now resolve to the green action family.
 *
 * Style fixes per client video 2026-10-17: every button and box uses the same
 * small corner radius (`radius`), and there are no drop shadows — light
 * surfaces are separated by a faint gray outline (`outline`) instead.
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
  border: '#E4E9ED', // faint gray outline around light surfaces + dividers
  white: '#FFFFFF',
} as const;

/**
 * Corner radius for every button, card, tile, chip and sheet (client: 3px).
 * Mirrored by `rounded` (borderRadius.DEFAULT) in tailwind.config.js.
 * True circles (avatars, dots, round icon buttons) stay fully round.
 */
export const radius = 3;

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

/**
 * Faint gray outlines that replace drop shadows (client video 2026-10-17:
 * "remove shadows and use faint gray outline"). Solid navy/green surfaces —
 * hero cards, primary buttons — need no outline and get neither.
 */
export const outline: Record<'card' | 'tab', ViewStyle> = {
  card: { borderWidth: 1, borderColor: colors.border },
  tab: { borderTopWidth: 1, borderTopColor: colors.border },
};

/**
 * Client prototype design system (prototype.patriai.app, captured 2026-10-27;
 * see prototype-designs/ds/patriai/tokens.css). Screens rebuilt to the
 * prototype use these instead of the tokens above — onboarding first.
 */
export const pt = {
  emerald900: '#08392F',
  emerald700: '#0B5D4B',
  emerald500: '#1FA07A',
  emerald300: '#5FD3A5',
  emerald100: '#DFF3EA',
  emerald50: '#F3F7F4',
  gold500: '#F2A93B',
  gold100: '#FCEBCC',

  surface: '#F3F7F4',
  raised: '#FFFFFF',
  sunken: '#E3ECE6',
  ink: '#0E1A16',
  inkMuted: '#3D5249',
  inkSubtle: '#56695F',
  line: '#D3E3DA',
  lineStrong: '#6F8A7E',
  brand: '#0B5D4B',
  brandSoft: '#DFF3EA',
  onBrand: '#FFFFFF',
  danger: '#B3311A',
  dangerSoft: '#FBE3DD',
  info: '#1D5FA8',
  infoSoft: '#E1ECF9',
  focus: '#1D5FA8',
  /** Welcome-screen pager dots and body copy on the dark emerald canvas. */
  dotIdle: '#2E5A4F',
  onDarkMuted: '#CFE3DA',
} as const;

/** Prototype radii: xs chips · sm buttons/inputs · md cards · lg hero cards. */
export const ptRadius = { xs: 6, sm: 12, md: 18, lg: 28 } as const;

/**
 * Plus Jakarta Sans by weight. Custom fonts on Android pick the face from the
 * family name, not fontWeight, so each weight is its own family.
 */
export const ptFont = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;
