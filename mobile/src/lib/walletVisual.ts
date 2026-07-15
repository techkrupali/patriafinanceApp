import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { gradients } from '../theme';
import type { WalletType } from '../api/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface WalletVisual {
  /** LinearGradient colour stops (blue/navy theme only). */
  gradient: readonly [string, string];
  icon: IconName;
  /** Short uppercase badge label, e.g. "SAVINGS". */
  label: string;
  /** true when the gradient is dark and content should render in white. */
  onDark: boolean;
}

const MAP: Record<WalletType, WalletVisual> = {
  main: { gradient: gradients.navy, icon: 'shield-checkmark', label: 'MAIN', onDark: true },
  shared: { gradient: gradients.brand, icon: 'people', label: 'SHARED', onDark: true },
  project: { gradient: ['#e9f0ff', '#d3e4fe'] as const, icon: 'flag', label: 'PROJECT', onDark: false },
  savings: { gradient: gradients.mint, icon: 'wallet', label: 'SAVINGS', onDark: true },
  goal: { gradient: ['#12376e', '#1f6feb'] as const, icon: 'trophy', label: 'GOAL', onDark: true },
  emergency: { gradient: gradients.navyDeep, icon: 'medkit', label: 'EMERGENCY', onDark: true },
  giving: { gradient: ['#1f6feb', '#4f9bff'] as const, icon: 'heart', label: 'GIVING', onDark: true },
  joint: { gradient: ['#1657c9', '#1f6feb'] as const, icon: 'people-circle', label: 'JOINT', onDark: true },
  child: { gradient: gradients.lav, icon: 'happy', label: 'CHILD', onDark: false },
  spending: { gradient: ['#0d3b8c', '#1f6feb'] as const, icon: 'card', label: 'SPENDING', onDark: true },
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
