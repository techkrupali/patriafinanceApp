import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type {
  KycIdType,
  KycSourceOfFunds,
  KycStatus,
  KycSubmissionStatus,
} from '../api/types';
import type { StatusVisual } from './governance';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Tiers ----

/** Human name for each identity tier. Tier 0 is the unverified starting point. */
export const TIER_NAMES: Record<number, string> = {
  0: 'Start',
  1: 'Identity',
  2: 'Address',
  3: 'Source of Funds',
};

export function tierName(tier: number): string {
  return TIER_NAMES[tier] ?? `Tier ${tier}`;
}

/** Short label used under the compact tier stepper nodes. */
export const TIER_SHORT_NAMES: Record<number, string> = {
  0: 'Start',
  1: 'Identity',
  2: 'Address',
  3: 'Source',
};

// ---- ID types (Tier 1) ----

export interface IdTypeOption {
  value: KycIdType;
  label: string;
  icon: IconName;
}

export const ID_TYPE_OPTIONS: IdTypeOption[] = [
  { value: 'nin_slip', label: 'NIN Slip', icon: 'card-outline' },
  { value: 'drivers_license', label: "Driver's License", icon: 'car-outline' },
  { value: 'passport', label: 'Passport', icon: 'airplane-outline' },
  { value: 'voters_card', label: "Voter's Card", icon: 'finger-print-outline' },
];

export function idTypeLabel(value: KycIdType | string): string {
  return ID_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? humanize(value);
}

// ---- Source of funds (Tier 3) ----

export interface SourceOfFundsOption {
  value: KycSourceOfFunds;
  label: string;
  icon: IconName;
}

export const SOURCE_OF_FUNDS_OPTIONS: SourceOfFundsOption[] = [
  { value: 'employment', label: 'Employment', icon: 'briefcase-outline' },
  { value: 'business', label: 'Business', icon: 'storefront-outline' },
  { value: 'investment', label: 'Investment', icon: 'trending-up-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export function sourceOfFundsLabel(value: KycSourceOfFunds | string): string {
  return SOURCE_OF_FUNDS_OPTIONS.find((o) => o.value === value)?.label ?? humanize(value);
}

// ---- Status visuals ----

const KYC_STATUS_VISUALS: Record<KycStatus, StatusVisual> = {
  unverified: { label: 'Unverified', bg: 'bg-lav-faint', text: 'text-muted', icon: 'shield-outline' },
  pending: { label: 'Under review', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  verified: { label: 'Verified', bg: 'bg-success-soft', text: 'text-brand', icon: 'shield-checkmark' },
};

export function kycStatusVisual(status: KycStatus | string): StatusVisual {
  if (status in KYC_STATUS_VISUALS) return KYC_STATUS_VISUALS[status as KycStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

const SUBMISSION_STATUS_VISUALS: Record<KycSubmissionStatus, StatusVisual> = {
  pending: { label: 'Pending review', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  approved: { label: 'Approved', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  rejected: { label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', icon: 'close-circle' },
};

export function submissionStatusVisual(status: KycSubmissionStatus | string): StatusVisual {
  if (status in SUBMISSION_STATUS_VISUALS) return SUBMISSION_STATUS_VISUALS[status as KycSubmissionStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}
