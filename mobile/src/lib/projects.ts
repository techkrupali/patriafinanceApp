import type { PtChipTone } from '../components/pt/PtChip';
import type { DisputeReason, DisputeRemedy, Milestone, Project, ProjectRole, TeamRole, VendorDeclined } from '../api/types';
import { formatNaira, parseYmd } from './format';

type Chip = { label: string; tone: PtChipTone; icon: 'check' | 'clock' | 'circle' | 'x' | 'alert-triangle' | 'edit-3' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** PRJ-01 chip: "1 to review", "Saving", "Planning", "In progress", "Done". */
export function projectChip(p: Project): Chip {
  switch (p.phase) {
    case 'to_review':
      return { label: `${p.to_review} to review`, tone: 'warning', icon: 'clock' };
    case 'saving':
      return { label: 'Saving', tone: 'neutral', icon: 'circle' };
    case 'planning':
      return { label: p.vendor_status === 'declined' ? 'Builder needed' : 'Planning', tone: 'brand', icon: 'circle' };
    case 'done':
      return { label: 'Done', tone: 'success', icon: 'check' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'x' };
    default:
      return { label: 'In progress', tone: 'brand', icon: 'circle' };
  }
}

/** PRJ-03 milestone chip: "Paid", "To review", "Not started"… */
export function milestoneChip(m: Milestone): Chip {
  if (m.dispute && m.status !== 'released') return { label: 'On hold', tone: 'danger', icon: 'alert-triangle' };
  switch (m.status) {
    case 'released':
      return { label: 'Paid', tone: 'success', icon: 'check' };
    case 'submitted':
      return { label: 'To review', tone: 'warning', icon: 'clock' };
    case 'approved':
      return { label: m.approval ? `${m.approval.yes} of ${m.approval.required} approved` : 'Approving', tone: 'warning', icon: 'clock' };
    case 'proposed':
      return { label: 'New from builder', tone: 'info', icon: 'edit-3' };
    case 'cancelled':
      return { label: 'Refunded', tone: 'neutral', icon: 'x' };
    default:
      if (m.change_request) return { label: 'Change asked', tone: 'warning', icon: 'clock' };
      if (m.rejection) return { label: 'Sent back', tone: 'warning', icon: 'clock' };
      if (m.evidence.length > 0 || m.deliverables.some((d) => d.done)) return { label: 'In progress', tone: 'brand', icon: 'circle' };
      return { label: 'Not started', tone: 'neutral', icon: 'circle' };
  }
}

/** "2 Jul to 30 Jul", "Nov to Dec 2026", "Nov". */
export function milestoneDates(m: Pick<Milestone, 'starts_on' | 'due_date'>, style: 'days' | 'months' = 'days'): string {
  const start = parseYmd(m.starts_on ?? null);
  const end = parseYmd(m.due_date);
  const day = (d: Date) => (style === 'days' ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : MONTHS[d.getMonth()]);
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    return style === 'months'
      ? `${MONTHS[start.getMonth()]}${sameYear ? '' : ` ${start.getFullYear()}`} to ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
      : `${day(start)} to ${day(end)}`;
  }
  if (end) return style === 'days' ? `due ${day(end)}` : `${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  if (start) return `from ${day(start)}`;
  return '';
}

/** "Ngozi and Chidi", "Ngozi, Chidi and Emeka". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** PRJ-04 the line under a milestone. */
export function milestoneLine(m: Milestone, project: Project, prev?: Milestone): string {
  const waitingFor = m.approval?.approvers.filter((a) => !a.said_yes).map((a) => a.first_name) ?? [];
  switch (m.status) {
    case 'released': {
      const refunded = Number(m.refunded ?? 0) > 0 ? ` · ${formatNaira(m.refunded)} refunded` : '';
      return Number(m.retention ?? 0) > 0
        ? `Paid ${formatNaira(m.paid_now ?? m.release_now)} · ${formatNaira(m.retention ?? 0)} held back${refunded}`
        : `Paid ${formatNaira(m.paid_now ?? m.amount)}${refunded}`;
    }
    case 'submitted':
    case 'approved':
      return `Submitted ${m.submitted_at ? relativeDay(m.submitted_at) : ''} · waiting for ${namesList(waitingFor.length ? waitingFor : project.approvers.map((a) => a.first_name))}`.replace('  ', ' ');
    case 'proposed':
      return m.proposal?.family_note ? `You asked for changes: ${m.proposal.family_note}` : 'New from the builder · approve it before work starts';
    case 'cancelled':
      return 'Refunded after a dispute · nothing paid';
    default:
      if (m.dispute) return `Dispute ${m.dispute.number ?? ''} · payment on hold`;
      if (m.rejection) return `Sent back: ${m.rejection}`;
      if (m.change_request?.by === 'family') return 'Your change is with the builder';
      if (m.change_request?.by === 'vendor') return 'The builder asked for a change';
      if (prev && prev.status !== 'released') return `Starts after ${prev.title.toLowerCase()} is approved`;
      return m.status === 'planned' ? 'Waiting for its money in the wallet' : 'Money set aside';
  }
}

/** "today", "yesterday", "on 24 Sep". */
export function relativeDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `on ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "20 Oct" */
export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseYmd(iso) : new Date(iso);
  return d && !Number.isNaN(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}

/**
 * A deadline's day ("reply by 27 Oct"). The API sends deadlines as the end of
 * a day in Lagos with that offset, so the date is read as sent, not moved into
 * the phone's timezone.
 */
export function deadlineDay(iso: string | null | undefined): string {
  return iso ? dayMonth(iso.slice(0, 10)) : '';
}

/** "Today, 9:02 am" */
export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
  const rel = relativeDay(iso);
  return `${rel === 'today' ? 'Today' : rel === 'yesterday' ? 'Yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}`}, ${time}`;
}

/** "9:02 am" */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
}

/** "2027-03" → "March" */
export function monthName(ym: string | null | undefined): string {
  const m = ym ? /^(\d{4})-(\d{2})/.exec(ym) : null;
  return m ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m[2]) - 1] : '';
}

export const DECLINE_REASONS: { value: VendorDeclined['reason']; label: string }[] = [
  { value: 'fully_booked', label: 'Fully booked' },
  { value: 'budget_too_low', label: 'Budget too low' },
  { value: 'outside_area', label: 'Outside my area' },
  { value: 'not_my_work', label: 'Not my kind of work' },
  { value: 'other', label: 'Other' },
];

export const PROPOSE_REASONS = [
  { value: 'family_asked', label: 'Family asked' },
  { value: 'found_on_site', label: 'Found on site' },
  { value: 'price_change', label: 'Price change' },
  { value: 'other', label: 'Other' },
] as const;

export const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'not_as_agreed', label: 'Not as agreed' },
  { value: 'not_finished', label: 'Not finished' },
  { value: 'poor_quality', label: 'Poor quality' },
  { value: 'overcharged', label: 'Overcharged' },
  { value: 'not_delivered', label: 'Not delivered' },
  { value: 'other', label: 'Other' },
];

export const DISPUTE_REMEDIES: { value: DisputeRemedy; label: string }[] = [
  { value: 'fix', label: 'Fix it' },
  { value: 'partial_refund', label: 'Partial refund' },
  { value: 'full_refund', label: 'Full refund' },
];

/** VND-04 "What went well". */
export const REVIEW_TAGS = [
  { value: 'on_time', label: 'On time' },
  { value: 'good_photos', label: 'Good photos' },
  { value: 'clean_site', label: 'Clean site' },
  { value: 'fair_price', label: 'Fair price' },
  { value: 'easy_to_reach', label: 'Easy to reach' },
];

/** VDM-01 "What you do" and the VND-01 directory filters. */
export const TRADES = [
  { value: 'building', label: 'Building', plural: 'Builders' },
  { value: 'tiling', label: 'Tiling', plural: 'Tiling' },
  { value: 'electrical', label: 'Electrical', plural: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing', plural: 'Plumbing' },
  { value: 'events', label: 'Events', plural: 'Events' },
  { value: 'school', label: 'School', plural: 'Schools' },
  { value: 'other', label: 'Other', plural: 'Other' },
];

/** "Builders", "Electricians"… for a directory row. */
export function tradeLabel(category: string): string {
  const map: Record<string, string> = {
    building: 'Builders', construction: 'Builders', tiling: 'Tiling', electrical: 'Electricians', plumbing: 'Plumbers',
    events: 'Event planners', school: 'Schools', education: 'Schools', catering: 'Caterers',
  };
  return map[category] ?? 'Vendor';
}

export const TEAM_ROLES: { value: TeamRole; label: string; hint: string; chip: string }[] = [
  { value: 'site_manager', label: 'Site manager', hint: 'Adds milestones, submits work for payment, talks to families.', chip: 'Submits milestones' },
  { value: 'foreman', label: 'Foreman or worker', hint: "Uploads photos and ticks deliverables. Can't submit for payment.", chip: 'Photos only' },
  { value: 'accounts', label: 'Accounts', hint: "Sees payouts and statements. Can't withdraw.", chip: 'Payouts, view only' },
];

export function projectRoleLabel(role: ProjectRole | null | undefined): string {
  const map: Record<string, string> = {
    owner: 'Owner', vendor: 'Vendor', co_owner: 'Co-owner', contributor: 'Contributor',
    site_manager: 'Site manager', foreman: 'Foreman', accounts: 'Accounts',
  };
  return role ? map[role] ?? '' : '';
}

/** The builder's side of a project (the business or its team). */
export function isVendorSide(role: ProjectRole | null | undefined): boolean {
  return role === 'vendor' || role === 'site_manager' || role === 'foreman' || role === 'accounts';
}

/** "Our house in Enugu" → "Enugu" from "Independence Layout, Enugu". */
export function townOf(location: string | null | undefined): string {
  if (!location) return '';
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
