import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { CreatableWalletType, EmergencyPurpose } from '../api/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface WalletPurpose<K extends string = string> {
  key: K;
  label: string;
  icon: IconName;
}

/**
 * Guided-creation copy and options for one wallet type. Client (2026-10-17):
 * "Every wallet here has its own purpose" — purposes are never mixed across
 * types, and each type walks the user through only what it needs.
 */
export interface WalletGuide {
  type: CreatableWalletType;
  /** "Savings Wallet" */
  title: string;
  /** One line on the type-picker card. */
  tagline: string;
  /** Subtitle under the setup headline. */
  explainer: string;
  /** "Good for" examples on the type-picker card. */
  goodFor: string[];
  purposes: WalletPurpose[];
  namePlaceholder: string;
  /** Saves toward a number — show the target amount. */
  showTarget: boolean;
  /** Offer monthly auto-funding from another wallet. */
  showMonthly: boolean;
}

const OTHER: WalletPurpose = { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' };

export const EMERGENCY_PURPOSES: WalletPurpose<EmergencyPurpose>[] = [
  { key: 'medical', label: 'Medical', icon: 'medkit' },
  { key: 'funeral', label: 'Funeral', icon: 'flower' },
  { key: 'travel', label: 'Travel', icon: 'airplane' },
  { key: 'legal', label: 'Legal', icon: 'hammer' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

/** Picker order: the most common saving wallets first, escrow last. */
export const WALLET_GUIDES: WalletGuide[] = [
  {
    type: 'savings',
    title: 'Savings Wallet',
    tagline: 'Put money aside and watch it grow toward a number you choose.',
    explainer: 'Set money aside for something that matters and grow it steadily, month by month.',
    goodFor: ['Rent', 'School fees', 'Big purchases'],
    purposes: [
      { key: 'rent', label: 'Rent', icon: 'key' },
      { key: 'school_fees', label: 'School Fees', icon: 'school' },
      { key: 'business', label: 'Business', icon: 'briefcase' },
      { key: 'big_purchase', label: 'Big Purchase', icon: 'pricetag' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Rent 2027',
    showTarget: true,
    showMonthly: true,
  },
  {
    type: 'goal',
    title: 'Goal Wallet',
    tagline: 'Save for one specific dream, with progress you can see.',
    explainer: 'Name your goal, set the amount you need, and we will track your progress toward it.',
    goodFor: ['A trip', 'A car', 'A wedding'],
    purposes: [
      { key: 'travel', label: 'Travel', icon: 'airplane' },
      { key: 'car', label: 'Car', icon: 'car' },
      { key: 'wedding', label: 'Wedding', icon: 'heart' },
      { key: 'gadget', label: 'Gadget', icon: 'phone-portrait' },
      OTHER,
    ],
    namePlaceholder: 'e.g. New Car',
    showTarget: true,
    showMonthly: true,
  },
  {
    type: 'emergency',
    title: 'Emergency Wallet',
    tagline: 'A locked fund for life\'s emergencies — with rules for who can unlock it.',
    explainer:
      'Secure your future with money set aside for critical life events. It stays locked until one of your access rules is met.',
    goodFor: ['Medical', 'Funeral', 'Legal'],
    purposes: EMERGENCY_PURPOSES,
    namePlaceholder: 'e.g. Family Medical Fund',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'giving',
    title: 'Giving Wallet',
    tagline: 'Set money aside for tithes, offerings and causes you care about.',
    explainer: 'Keep your giving separate so it is always ready when you want to give.',
    goodFor: ['Tithe', 'Offering', 'Charity'],
    purposes: [
      { key: 'tithe', label: 'Tithe', icon: 'heart' },
      { key: 'offering', label: 'Offering', icon: 'gift' },
      { key: 'charity', label: 'Charity', icon: 'hand-left' },
      { key: 'zakat', label: 'Zakat', icon: 'moon' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Church Giving',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'shared',
    title: 'Shared Wallet',
    tagline: 'Pool money with people you invite. Everyone sees and uses it together.',
    explainer: 'Create the wallet, then invite family members and choose what each person can do.',
    goodFor: ['Household bills', 'Groceries', 'Family trips'],
    purposes: [
      { key: 'household', label: 'Household Bills', icon: 'home' },
      { key: 'groceries', label: 'Groceries', icon: 'cart' },
      { key: 'rent', label: 'Rent', icon: 'key' },
      { key: 'family_trip', label: 'Family Trip', icon: 'airplane' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Family Upkeep',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'joint',
    title: 'Joint Wallet',
    tagline: 'Run money together with your partner — you both manage it.',
    explainer: 'Create the wallet, then invite your partner as a co-owner so you both manage it.',
    goodFor: ['Rent', 'Household', 'Saving together'],
    purposes: [
      { key: 'household', label: 'Household', icon: 'home' },
      { key: 'rent', label: 'Rent', icon: 'key' },
      { key: 'saving_together', label: 'Saving Together', icon: 'people' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Our Home',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'child',
    title: 'Child Wallet',
    tagline: 'Manage money on behalf of a child, with you in control.',
    explainer: 'Set aside money for a child. You stay in control of every naira that leaves it.',
    goodFor: ['School fees', 'Pocket money', 'Savings'],
    purposes: [
      { key: 'school_fees', label: 'School Fees', icon: 'school' },
      { key: 'pocket_money', label: 'Pocket Money', icon: 'cash' },
      { key: 'savings', label: 'Savings', icon: 'wallet' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Ada\'s Wallet',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'spending',
    title: 'Spending Wallet',
    tagline: 'Everyday spending, kept separate from your main balance.',
    explainer: 'Give everyday spending its own budget so your main balance stays untouched.',
    goodFor: ['Groceries', 'Transport', 'Utilities'],
    purposes: [
      { key: 'groceries', label: 'Groceries', icon: 'cart' },
      { key: 'transport', label: 'Transport', icon: 'bus' },
      { key: 'utilities', label: 'Utilities', icon: 'flash' },
      { key: 'entertainment', label: 'Entertainment', icon: 'film' },
      OTHER,
    ],
    namePlaceholder: 'e.g. Monthly Spending',
    showTarget: false,
    showMonthly: true,
  },
  {
    type: 'project',
    title: 'Project Wallet',
    tagline: 'Escrow for a project: fund milestones and pay a vendor only when work is approved.',
    explainer: 'Set up the project, add a vendor and milestones, and release payment as work is approved.',
    goodFor: ['Building', 'Renovation', 'Events'],
    purposes: [],
    namePlaceholder: 'e.g. Home Renovation',
    showTarget: false,
    showMonthly: false,
  },
];

export function walletGuide(type: CreatableWalletType): WalletGuide {
  return WALLET_GUIDES.find((g) => g.type === type) ?? WALLET_GUIDES[0];
}

/** "Medical" for a purpose key on a given wallet type (falls back to humanized key). */
export function purposeLabel(type: string, key: string | null | undefined): string | null {
  if (!key) return null;
  const guide = WALLET_GUIDES.find((g) => g.type === type);
  return guide?.purposes.find((p) => p.key === key)?.label ?? key.replace(/_/g, ' ');
}
