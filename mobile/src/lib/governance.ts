import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ApprovalAction, ApprovalStatus, NotificationType } from '../api/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---- Member roles ----

export interface RoleOption {
  value: 'co_owner' | 'admin' | 'contributor' | 'viewer';
  label: string;
  hint: string;
}

/** Assignable roles (owner is never assignable). */
export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'co_owner', label: 'Co-owner', hint: 'Full control, incl. settings & members' },
  { value: 'admin', label: 'Admin', hint: 'Invite members and spend' },
  { value: 'contributor', label: 'Contributor', hint: 'Fund and spend' },
  { value: 'viewer', label: 'Viewer', hint: 'View only, no spending' },
];

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  const found = ROLE_OPTIONS.find((r) => r.value === role);
  if (found) return found.label;
  if (role === 'owner') return 'Owner';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Roles that can manage a wallet's settings and members. */
export function canManageWallet(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'co_owner';
}

/** Roles that can invite new members. */
export function canInviteMembers(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'co_owner' || role === 'admin';
}

// ---- Approval actions ----

const ACTION_LABELS: Record<ApprovalAction, string> = {
  withdrawal: 'Withdrawal',
  transfer_wallet: 'Wallet transfer',
  transfer_user: 'Transfer to user',
  transfer_bank: 'Bank transfer',
};

export function approvalActionLabel(action: ApprovalAction | string): string {
  if (action in ACTION_LABELS) return ACTION_LABELS[action as ApprovalAction];
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function approvalActionIcon(action: ApprovalAction | string): IconName {
  if (action === 'withdrawal') return 'cash-outline';
  return 'paper-plane-outline';
}

// ---- Approval status ----

export interface StatusVisual {
  label: string;
  /** Tailwind bg class for the pill. */
  bg: string;
  /** Tailwind text class for the pill. */
  text: string;
  icon: IconName;
}

const STATUS_VISUALS: Record<ApprovalStatus, StatusVisual> = {
  pending: { label: 'Pending', bg: 'bg-lav-faint', text: 'text-muted', icon: 'time-outline' },
  approved: { label: 'Approved', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  executed: { label: 'Executed', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-done-circle' },
  rejected: { label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', icon: 'close-circle' },
  failed: { label: 'Failed', bg: 'bg-danger-soft', text: 'text-danger', icon: 'alert-circle' },
  expired: { label: 'Expired', bg: 'bg-lav-faint', text: 'text-faded', icon: 'hourglass-outline' },
  cancelled: { label: 'Cancelled', bg: 'bg-lav-faint', text: 'text-faded', icon: 'ban-outline' },
};

export function approvalStatusVisual(status: ApprovalStatus | string): StatusVisual {
  if (status in STATUS_VISUALS) return STATUS_VISUALS[status as ApprovalStatus];
  return { label: status, bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

// ---- Notifications ----

export interface NotificationVisual {
  icon: IconName;
  /** Tailwind bg class for the icon tile. */
  tile: string;
  /** Hex colour for the icon. */
  color: string;
}

/**
 * Icon + tint for a notification type. Colours are passed as hex so callers can
 * feed them straight into <Ionicons color>. Blue theme (danger stays red).
 */
export function notificationVisual(
  type: NotificationType | string,
  colors: { brand: string; navy: string; danger: string },
): NotificationVisual {
  switch (type) {
    case 'approval_requested':
      return { icon: 'shield-checkmark', tile: 'bg-lav-soft', color: colors.navy };
    case 'approval_executed':
      return { icon: 'checkmark-done-circle', tile: 'bg-success-soft', color: colors.brand };
    case 'approval_rejected':
      return { icon: 'close-circle', tile: 'bg-danger-soft', color: colors.danger };
    case 'approval_failed':
      return { icon: 'alert-circle', tile: 'bg-danger-soft', color: colors.danger };
    case 'invitation_received':
      return { icon: 'mail-open-outline', tile: 'bg-lav-soft', color: colors.navy };
    case 'invitation_accepted':
      return { icon: 'people', tile: 'bg-success-soft', color: colors.brand };
    case 'transfer_received':
      return { icon: 'arrow-down-circle', tile: 'bg-success-soft', color: colors.brand };
    case 'wallet_member_removed':
      return { icon: 'person-remove-outline', tile: 'bg-danger-soft', color: colors.danger };
    default:
      return { icon: 'notifications-outline', tile: 'bg-lav-faint', color: colors.navy };
  }
}

/** Pull a numeric id out of a notification's opaque `data` bag by any of the given keys. */
export function numFromData(
  data: Record<string, unknown> | null | undefined,
  keys: string[],
): number | undefined {
  if (!data) return undefined;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}
