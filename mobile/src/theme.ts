import type { ViewStyle } from 'react-native';

/**
 * Patriai design language. Token names come from "The Curated Ledger"
 * (navy+green, client video 2026-08-03); since 2026-10-27 their values are the
 * client prototype's emerald palette (see `pt` below), so every screen shares
 * the prototype's colour code.
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
  navy: '#08392F', // on-secondary-fixed — the Treasury card base
  navyLight: '#0B5D4B',
  ink: '#0E1A16', // on-surface — primary text (never pure black)

  // Positive/action green (tertiary) — all positive financial trends
  brand: '#0B5D4B',
  brandDeep: '#08392F',
  brandMint: '#5FD3A5', // tertiary-fixed-dim
  brandGlow: '#5FD3A5', // tertiary-fixed

  // Action colour — grounded green (was metallic gold; retired per client)
  gold: '#1FA07A', // bright action green
  goldDeep: '#0B5D4B', // deep action green (tints, icons, labels on soft fills)
  goldSoft: '#DFF3EA', // soft green fill (tiles, active pills)

  // Tonal surface tints (chips, fills) — surface-variant family
  lav: '#D3E3DA', // surface-variant
  lavSoft: '#E3ECE6', // surface-container-high
  lavFaint: '#EBF2EE', // surface-container

  // Backgrounds — the surface stack
  page: '#F3F7F4', // surface
  pageTop: '#EAF1EC', // surface-container-low

  // Text hierarchy
  muted: '#3D5249', // secondary — supporting text & labels
  faded: '#6F8A7E', // quiet metadata

  // States
  danger: '#B3311A', // error
  dangerSoft: '#FBE3DD', // error-container
  success: '#127A55', // tertiary green
  successSoft: '#DDF4E9',
  rose: '#B3311A', // money-out accent (on-error-container)
  roseSoft: '#FBE3DD',

  card: '#FFFFFF', // surface-container-lowest
  border: '#D3E3DA', // faint gray outline around light surfaces + dividers
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
  navy: ['#08392F', '#0B4A3C'] as const,
  navyDeep: ['#062B23', '#08392F'] as const,
  // Positive green actions/tiles
  brand: ['#08392F', '#0B5D4B'] as const,
  mint: ['#1FA07A', '#5FD3A5'] as const,
  glow: ['#0B5D4B', '#5FD3A5'] as const,
  /** Page-top wash that melts into the background. */
  glowSoft: ['#EAF1EC', '#F3F7F4'] as const,
  lav: ['#EBF2EE', '#D3E3DA'] as const,
  // Slate secondary avatars
  avatar: ['#0B5D4B', '#1FA07A'] as const,
  /** Signature action gradient — deep green → bright green at 135° (was gold). */
  gold: ['#08392F', '#0B5D4B'] as const,
  /** Full-page backdrop — cool surface drifting into a faint green hint. */
  aurora: ['#EAF1EC', '#F3F7F4', '#F3F7F4'] as const,
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
