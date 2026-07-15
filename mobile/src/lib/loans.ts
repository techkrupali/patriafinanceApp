import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type {
  LoanCategory,
  LoanStatus,
  RepaymentFrequency,
  RepaymentStatus,
} from '../api/types';
import type { StatusVisual } from './governance';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Flat 5% interest — mirrors the backend's interest_bps (500). Used only for
 *  the pre-submit repayment estimate; real figures come back on the created loan. */
export const LOAN_INTEREST_RATE = 0.05;

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Categories ----

export interface LoanCategoryOption {
  value: LoanCategory;
  label: string;
  icon: IconName;
}

export const LOAN_CATEGORIES: LoanCategoryOption[] = [
  { value: 'rent', label: 'Rent', icon: 'home-outline' },
  { value: 'mortgage', label: 'Mortgage', icon: 'business-outline' },
  { value: 'car', label: 'Car', icon: 'car-outline' },
  { value: 'school_fees', label: 'School Fees', icon: 'school-outline' },
  { value: 'family_emergency', label: 'Emergency', icon: 'medkit-outline' },
  { value: 'business', label: 'Business', icon: 'briefcase-outline' },
  { value: 'feeding', label: 'Feeding', icon: 'fast-food-outline' },
  { value: 'child_allowance', label: 'Child', icon: 'happy-outline' },
  { value: 'short_term', label: 'Short Term', icon: 'flash-outline' },
];

export function loanCategoryOption(cat: LoanCategory | string): LoanCategoryOption {
  return (
    LOAN_CATEGORIES.find((c) => c.value === cat) ?? {
      value: cat as LoanCategory,
      label: humanize(cat),
      icon: 'cash-outline',
    }
  );
}

export function loanCategoryLabel(cat: LoanCategory | string): string {
  return loanCategoryOption(cat).label;
}

// ---- Loan status ----

const LOAN_STATUS_VISUALS: Record<LoanStatus, StatusVisual> = {
  pending: { label: 'Pending', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  approved: { label: 'Approved', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  disbursed: { label: 'Disbursed', bg: 'bg-success-soft', text: 'text-brand', icon: 'cash-outline' },
  active: { label: 'Active', bg: 'bg-success-soft', text: 'text-brand', icon: 'trending-up-outline' },
  repaid: { label: 'Repaid', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-done-circle' },
  rejected: { label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', icon: 'close-circle' },
  defaulted: { label: 'Defaulted', bg: 'bg-danger-soft', text: 'text-danger', icon: 'alert-circle' },
  cancelled: { label: 'Cancelled', bg: 'bg-lav-faint', text: 'text-faded', icon: 'ban-outline' },
};

export function loanStatusVisual(status: LoanStatus | string): StatusVisual {
  if (status in LOAN_STATUS_VISUALS) return LOAN_STATUS_VISUALS[status as LoanStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

/** A loan whose balance can still be repaid. */
export function isRepayable(status: LoanStatus | string): boolean {
  return status === 'active' || status === 'disbursed' || status === 'defaulted';
}

// ---- Repayment status ----

const REPAYMENT_STATUS_VISUALS: Record<RepaymentStatus, StatusVisual> = {
  pending: { label: 'Pending', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  partial: { label: 'Partial', bg: 'bg-success-soft', text: 'text-brand', icon: 'contrast-outline' },
  paid: { label: 'Paid', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  overdue: { label: 'Overdue', bg: 'bg-danger-soft', text: 'text-danger', icon: 'alert-circle' },
};

export function repaymentStatusVisual(status: RepaymentStatus | string): StatusVisual {
  if (status in REPAYMENT_STATUS_VISUALS) return REPAYMENT_STATUS_VISUALS[status as RepaymentStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

// ---- Frequency & installments ----

export interface FrequencyOption {
  value: RepaymentFrequency;
  label: string;
}

export const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: 'once', label: 'One-off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function frequencyLabel(freq: RepaymentFrequency | string): string {
  return FREQUENCY_OPTIONS.find((f) => f.value === freq)?.label ?? humanize(freq);
}

/** Estimated number of installments across the tenor for a given frequency. */
export function installmentCount(tenorDays: number, freq: RepaymentFrequency | string): number {
  if (freq === 'weekly') return Math.max(1, Math.ceil(tenorDays / 7));
  if (freq === 'monthly') return Math.max(1, Math.ceil(tenorDays / 30));
  return 1;
}

// ---- Dates ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a plain "YYYY-MM-DD" (parsed by parts to dodge timezone drift). */
export function scheduleDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const [, y, mo, d] = m;
  const monthIdx = parseInt(mo, 10) - 1;
  return `${parseInt(d, 10)} ${MONTHS[monthIdx] ?? mo} ${y}`;
}
