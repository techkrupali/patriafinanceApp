import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { TransferDestination } from './types';

/** SND-15 one line: a repeat payment, a giving schedule or a goal's payout. */
export interface ScheduledItem {
  id: number;
  kind: 'payment' | 'giving' | 'goal';
  /** "Bisi · market money" */
  title: string;
  /** "Every Saturday" · "Monthly, 1st" · "6 Jan 2027, once" · "First Sunday · split 50/50 · you confirm" */
  when: string;
  from: { id: number | null; name: string | null };
  /** Naira decimal strings. */
  amount: string;
  next_on: string | null;
  paused: boolean;
  /** How much the wallet will be short on the day, if it will. */
  short: string | null;
  /** The wallet asks someone before it goes. */
  approval: boolean;
  /** Giving and goal lines open their wallet. */
  wallet_id: number | null;
  last_result: 'sent' | 'approval' | 'processing' | 'skipped' | 'failed' | null;
  last_reason: string | null;
}

export interface ScheduledOverview {
  next_30_days: string;
  short_count: number;
  items: ScheduledItem[];
}

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface ScheduledPayment {
  id: number;
  to_name: string;
  amount: string;
  note: string | null;
  from: { id: number; name: string | null };
  frequency: Frequency;
  when: string;
  starts_at: string;
  ends_after: number | null;
  runs: number;
  next_run_at: string | null;
  status: 'active' | 'paused' | 'done' | 'cancelled';
  name?: string | null;
  last_result?: string | null;
  last_reason?: string | null;
  confirm?: { user_ids: number[]; mode: 'any' | 'all' } | null;
  confirmed?: boolean;
  short_policy?: { check_days: number; remind_day_before: boolean; on_day: string } | null;
  warned_on?: string[];
}

/** RUL-07 "Not enough for Sunday's payment". */
export interface Shortfall {
  id: number;
  title: string;
  body: string;
  by_then: string;
  short: number;
  short_label: string;
  available: number;
  available_label: string;
  from_wallet_id: number;
  others: { id: number; name: string; available: string }[];
  policy_line: string | null;
  payment: ScheduledPayment;
}

export function useScheduledPayment(id: number) {
  return useQuery({ queryKey: ['scheduled-payment', id], queryFn: () => api<ScheduledPayment>(`/scheduled-payments/${id}`) });
}

export function useShortfall(id: number) {
  return useQuery({ queryKey: ['scheduled-shortfall', id], queryFn: () => api<Shortfall>(`/scheduled-payments/${id}/shortfall`) });
}

function useRefreshScheduled() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['scheduled-payment'] });
    void qc.invalidateQueries({ queryKey: ['scheduled-shortfall'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    void qc.invalidateQueries({ queryKey: ['wallets'] });
  };
}

export function useConfirmScheduled(id: number) {
  const refresh = useRefreshScheduled();
  return useMutation({ mutationFn: () => api<ScheduledPayment>(`/scheduled-payments/${id}/confirm`, { method: 'POST' }), onSuccess: refresh });
}

export function useSendScheduledNow(id: number) {
  const refresh = useRefreshScheduled();
  return useMutation({
    mutationFn: (body: { pin: string; amount?: string }) => api<{ result: string; reason: string | null }>(`/scheduled-payments/${id}/send-now`, { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useCancelNextScheduled(id: number) {
  const refresh = useRefreshScheduled();
  return useMutation({ mutationFn: () => api<ScheduledPayment>(`/scheduled-payments/${id}/cancel-next`, { method: 'POST' }), onSuccess: refresh });
}

const KEY = ['scheduled-payments'] as const;

export function useScheduledPayments() {
  return useQuery({ queryKey: KEY, queryFn: () => api<ScheduledOverview>('/scheduled-payments') });
}

export function useCreateScheduledPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      from_wallet_id: number;
      amount: string;
      note?: string;
      budget_category_id?: number;
      skip_if_over?: boolean;
      destination: Exclude<TransferDestination, { kind: 'wallet' } | { kind: 'request' }>;
      /** As they're saved ("Bisi", "Mama Okafor"). */
      to_name?: string;
      frequency: Frequency;
      starts_at: string;
      ends_after?: number;
      /** RUL-02…05 */
      name?: string;
      week_of_month?: number;
      weekday?: number;
      ends_on?: string;
      confirm?: { user_ids: number[]; mode: 'any' | 'all' };
      short_policy?: { check_days: number; remind_day_before: boolean; on_day: 'topup_main' | 'pay_what_there' | 'skip' | 'cancel' };
      pin: string;
      two_factor_code?: string;
    }) => api<ScheduledPayment>('/scheduled-payments', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

/** Pause or turn back on; or cancel (status: cancelled). */
export function useChangeScheduledPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'paused' | 'cancelled' }) =>
      status === 'cancelled'
        ? api<ScheduledPayment>(`/scheduled-payments/${id}`, { method: 'DELETE' })
        : api<ScheduledPayment>(`/scheduled-payments/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
