import type React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { MilestoneStatus, ProjectRole, ProjectStatus } from '../api/types';
import type { StatusVisual } from './governance';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Project status ----

const PROJECT_STATUS_VISUALS: Record<ProjectStatus, StatusVisual> = {
  active: { label: 'Active', bg: 'bg-success-soft', text: 'text-brand', icon: 'trending-up-outline' },
  completed: { label: 'Completed', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-done-circle' },
  cancelled: { label: 'Cancelled', bg: 'bg-lav-faint', text: 'text-faded', icon: 'ban-outline' },
};

export function projectStatusVisual(status: ProjectStatus | string): StatusVisual {
  if (status in PROJECT_STATUS_VISUALS) return PROJECT_STATUS_VISUALS[status as ProjectStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

// ---- Milestone status ----

const MILESTONE_STATUS_VISUALS: Record<MilestoneStatus, StatusVisual> = {
  funded: { label: 'Funded', bg: 'bg-lav-faint', text: 'text-muted', icon: 'lock-closed-outline' },
  submitted: { label: 'Submitted', bg: 'bg-lav-soft', text: 'text-navy', icon: 'cloud-upload-outline' },
  approved: { label: 'Approved', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-circle' },
  released: { label: 'Released', bg: 'bg-success-soft', text: 'text-brand', icon: 'checkmark-done-circle' },
  rejected: { label: 'Rejected', bg: 'bg-danger-soft', text: 'text-danger', icon: 'close-circle' },
};

export function milestoneStatusVisual(status: MilestoneStatus | string): StatusVisual {
  if (status in MILESTONE_STATUS_VISUALS) return MILESTONE_STATUS_VISUALS[status as MilestoneStatus];
  return { label: humanize(status), bg: 'bg-lav-faint', text: 'text-muted', icon: 'ellipse-outline' };
}

// ---- Roles ----

export function projectRoleLabel(role: ProjectRole | null | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'vendor') return 'Vendor';
  return '';
}

// ---- Milestone action predicates (mirror the backend guards) ----

/** Vendor can submit/re-submit work while a milestone is funded or rejected. */
export function canSubmitMilestone(status: MilestoneStatus | string): boolean {
  return status === 'funded' || status === 'rejected';
}

/** Owner can approve or reject only while the vendor's work is submitted. */
export function canReviewMilestone(status: MilestoneStatus | string): boolean {
  return status === 'submitted';
}

/** Owner can remove a milestone only before any work is submitted. */
export function canRemoveMilestone(status: MilestoneStatus | string): boolean {
  return status === 'funded' || status === 'rejected';
}
