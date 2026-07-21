import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { gradients } from '../theme';
import type { WalletType } from '../api/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface WalletVisual {
  /** LinearGradient colour stops (Curated Ledger palette). */
  gradient: readonly [string, string];
  icon: IconName;
  /** Short uppercase badge label, e.g. "SAVINGS". */
  label: string;
  /** true when the gradient is dark and content should render in white. */
  onDark: boolean;
}

/**
 * Each wallet type gets its own recognisable material (client request):
 * treasury navy for main, slate for the family wallets, metallic gold for
 * savings/goals, green for giving, warm red for emergency.
 */
const MAP: Record<WalletType, WalletVisual> = {
  main: { gradient: gradients.navy, icon: 'shield-checkmark', label: 'MAIN', onDark: true },
  shared: { gradient: ['#314863', '#49607C'] as const, icon: 'people', label: 'SHARED', onDark: true },
  project: { gradient: ['#EAEEF2', '#DFE3E7'] as const, icon: 'flag', label: 'PROJECT', onDark: false },
  savings: { gradient: ['#745B00', '#E0B200'] as const, icon: 'wallet', label: 'SAVINGS', onDark: true },
  goal: { gradient: ['#8A6D00', '#F1C100'] as const, icon: 'trophy', label: 'GOAL', onDark: true },
  emergency: { gradient: ['#7F1D1D', '#BA1A1A'] as const, icon: 'medkit', label: 'EMERGENCY', onDark: true },
  giving: { gradient: ['#005322', '#0F8A44'] as const, icon: 'heart', label: 'GIVING', onDark: true },
  joint: { gradient: ['#25405C', '#3E5C7E'] as const, icon: 'people-circle', label: 'JOINT', onDark: true },
  child: { gradient: ['#C7DFFF', '#B0C9E8'] as const, icon: 'happy', label: 'CHILD', onDark: false },
  spending: { gradient: ['#0B2A44', '#173A5C'] as const, icon: 'card', label: 'SPENDING', onDark: true },
};

const FALLBACK: WalletVisual = {
  gradient: gradients.navy,
  icon: 'wallet',
  label: 'WALLET',
  onDark: true,
};

/** Visual treatment (gradient, icon, badge, contrast) for a wallet type. Never throws on unknown types. */
export function walletVisual(type: WalletType | string | null | undefined): WalletVisual {
  if (type && type in MAP) return MAP[type as WalletType];
  return FALLBACK;
}

/** Human label for a wallet type, e.g. "Emergency Fund". */
const TITLES: Record<WalletType, string> = {
  main: 'Main',
  shared: 'Shared',
  project: 'Project',
  savings: 'Savings',
  goal: 'Goal',
  emergency: 'Emergency',
  giving: 'Giving',
  joint: 'Joint',
  child: 'Child',
  spending: 'Spending',
};

export function walletTypeTitle(type: WalletType | string | null | undefined): string {
  if (type && type in TITLES) return TITLES[type as WalletType];
  return 'Wallet';
}
