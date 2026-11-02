import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';

export type AjoFrequency = 'weekly' | 'monthly';
export type AjoTone = 'success' | 'warning' | 'danger' | 'neutral';

/** AJO-03 "This round": one member's place in the circle. */
export interface AjoMemberRow {
  member_id: number;
  user_id: number;
  name: string | null;
  /** "Funke A." */
  short: string;
  you: boolean;
  organiser: boolean;
  position: number | null;
  /** "March 2027" once the order is set. */
  turn_label: string | null;
  status: 'active' | 'lost_turn' | 'replaced';
  missed: number;
  received: boolean;
  /** "Paid" · "Due today" · "Late 2 days". */
  round_status: { label: string; tone: AjoTone; days?: number } | null;
  /** Naira decimal: everything they still owe, fees included. */
  owes: string;
  replacing: boolean;
  can_replace: boolean;
  can_swap: boolean;
}

export interface AjoDue {
  contribution_id: number;
  round: number;
  /** "December" or "Week 3". */
  month: string;
  amount: string;
  /** The late fee once it applies, else "0.00". */
  fee: string;
  /** The circle's late fee, for "₦2,000 after 3 days". */
  late_fee: string;
  total: string;
  due_on: string;
  due_label: string;
  days_late: number;
  late: boolean;
  /** "Pay before 4 Dec to avoid the late fee". */
  fee_from: string;
  /** "Funke is waiting on her payout." */
  waiting: string | null;
}

/** AJO-03 for a member, WPV-06 for the organiser, and a circle that is still forming. */
export interface AjoDetail {
  id: number;
  wallet_id: number;
  name: string;
  status: 'forming' | 'active' | 'completed' | 'cancelled';
  code: string;
  role: 'organiser' | 'member';
  organiser: { id: number; name: string | null; first_name: string | null };
  contribution: string;
  frequency: AjoFrequency;
  size: number;
  payout_amount: string;
  starts_on: string;
  ends_on: string;
  /** "Nov 2026 to Oct 2027" */
  period_label: string;
  /** "On the 1st of every month" */
  pay_day_label: string;
  late_fee: string;
  late_after_days: number;
  /** "₦2,000 after 3 days" */
  late_fee_label: string;
  allow_swaps: boolean;
  order_mode: 'random' | 'agreed';
  conversation_id: number | null;
  joined: number;
  invited: { id: number; name: string }[];
  balance: string;
  round: {
    number: number;
    of: number;
    /** "November" */
    label: string;
    collected: string;
    target: string;
    paid: number;
    total: number;
    recipient: { member_id: number; name: string; you: boolean } | null;
    pay_on: string;
    pay_on_label: string;
    paid_out: boolean;
    paid_out_amount: string | null;
  } | null;
  me: {
    member_id: number;
    position: number | null;
    /** "5th" */
    ordinal: string | null;
    turn_label: string | null;
    receives: string;
    received: boolean;
    /** Naira decimal: what reached them, late payments and fees included. */
    received_amount: string;
    auto_pay: boolean;
    pay_from: string;
    missed: number;
    status: AjoMemberRow['status'];
    due: AjoDue | null;
    swaps_in: { id: number; name: string; turn_label: string | null }[];
    swap_out: { id: number; name: string; turn_label: string } | null;
  } | null;
  members: AjoMemberRow[];
  stats: { late: number; due_today: number; fees_collected: string };
}

/** INV-J1 / joining with a code. */
export interface AjoPreview {
  id: number;
  wallet_id: number;
  name: string;
  code: string;
  status: AjoDetail['status'];
  organiser: { id: number; name: string | null; first_name: string | null };
  contribution: string;
  frequency: AjoFrequency;
  /** "₦50,000 every month" */
  pay_label: string;
  period_label: string;
  /** "₦600,000 once" */
  receive_label: string;
  turn_note: string;
  late_fee_label: string;
  /** "11 joined of 12" */
  members_label: string;
  joined: number;
  size: number;
  pay_day_label: string;
  already_in: boolean;
  open: boolean;
}

/** TRS-02 row: "Your turn in March · ₦600,000 · ₦50,000 paid". */
export interface AjoRow {
  status: AjoDetail['status'];
  line: string;
  payout: string;
  paid: string;
  role: 'organiser' | 'member';
}

export interface AjoRulesPayload {
  name?: string;
  contribution?: string;
  size?: number;
  frequency?: AjoFrequency;
  starts_on?: string;
  late_fee?: string;
  late_after_days?: number;
  allow_swaps?: boolean;
}

export type AjoInvitee = { invitee_user_id: number } | { identifier: string };

const ajoKey = (walletId: number) => ['ajo', walletId] as const;

export function useAjo(walletId: number) {
  return useQuery({
    queryKey: ajoKey(walletId),
    queryFn: () => api<{ ajo: AjoDetail }>(`/ajo/${walletId}`),
    select: (d) => d.ajo,
    enabled: walletId > 0,
  });
}

/** Everything an ajo change can touch: the circle, the wallet list, Home and notifications. */
function useRefresh(walletId?: number) {
  const qc = useQueryClient();
  return (id = walletId) => {
    if (id) void qc.invalidateQueries({ queryKey: ajoKey(id) });
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: keys.home });
    void qc.invalidateQueries({ queryKey: keys.myInvitations });
    void qc.invalidateQueries({ queryKey: keys.notifications });
  };
}

/** AJO-01 "New ajo circle". */
export function useCreateAjo() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: Required<Pick<AjoRulesPayload, 'name' | 'contribution' | 'size' | 'frequency' | 'starts_on'>> & AjoRulesPayload) =>
      api<{ ajo: AjoDetail }>('/ajo', { method: 'POST', body: input }),
    onSuccess: (d) => refresh(d.ajo.wallet_id),
  });
}

/** The organiser's and members' actions on one circle. */
export function useAjoActions(walletId: number) {
  const refresh = useRefresh(walletId);
  const done = { onSuccess: () => refresh() };
  return {
    update: useMutation({ mutationFn: (input: AjoRulesPayload) => api<{ ajo: AjoDetail }>(`/ajo/${walletId}`, { method: 'PATCH', body: input }), ...done }),
    invite: useMutation({ mutationFn: (input: AjoInvitee) => api<{ ajo: AjoDetail }>(`/ajo/${walletId}/invite`, { method: 'POST', body: input }), ...done }),
    start: useMutation({
      mutationFn: (input: { order_mode: 'random' | 'agreed'; order?: number[]; allow_swaps: boolean }) => api<{ ajo: AjoDetail }>(`/ajo/${walletId}/start`, { method: 'POST', body: input }),
      ...done,
    }),
    cancel: useMutation({ mutationFn: () => api<{ ajo: AjoDetail }>(`/ajo/${walletId}/cancel`, { method: 'POST' }), ...done }),
    pay: useMutation({
      mutationFn: (input: { pin: string; contribution_id?: number }) =>
        api<{ paid: { amount: string; round: number; reference: string | null }; ajo: AjoDetail }>(`/ajo/${walletId}/pay`, { method: 'POST', body: input }),
      ...done,
    }),
    autoPay: useMutation({ mutationFn: (on: boolean) => api<{ ajo: AjoDetail }>(`/ajo/${walletId}/me`, { method: 'PATCH', body: { auto_pay: on } }), ...done }),
    remind: useMutation({ mutationFn: () => api<{ sent: number }>(`/ajo/${walletId}/remind`, { method: 'POST' }), ...done }),
    swap: useMutation({ mutationFn: (memberId: number) => api<{ ajo: AjoDetail }>(`/ajo/${walletId}/swaps`, { method: 'POST', body: { member_id: memberId } }), ...done }),
    respondSwap: useMutation({
      mutationFn: (input: { swapId: number; accept: boolean }) => api<{ ajo: AjoDetail }>(`/ajo-swaps/${input.swapId}/respond`, { method: 'POST', body: { accept: input.accept } }),
      ...done,
    }),
    replace: useMutation({
      mutationFn: (input: { memberId: number } & AjoInvitee) => {
        const { memberId, ...who } = input;
        return api<{ ajo: AjoDetail }>(`/ajo/${walletId}/members/${memberId}/replace`, { method: 'POST', body: who });
      },
      ...done,
    }),
  };
}

/** TRS-03 "Join an ajo circle · With a code from the organiser". */
export function useAjoCode(code: string) {
  const c = code.trim().toUpperCase();
  return useQuery({
    queryKey: ['ajo-code', c],
    queryFn: () => api<{ ajo: AjoPreview }>(`/ajo-codes/${encodeURIComponent(c)}`),
    select: (d) => d.ajo,
    enabled: c.length >= 6,
    retry: false,
  });
}

export function useJoinAjoCode() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { code: string; auto_pay: boolean }) =>
      api<{ ajo: AjoDetail }>(`/ajo-codes/${encodeURIComponent(input.code.trim().toUpperCase())}/join`, { method: 'POST', body: { auto_pay: input.auto_pay } }),
    onSuccess: (d) => refresh(d.ajo.wallet_id),
  });
}
