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
