import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import { accountKeys } from './account';

/**
 * Free and Pro (client prototype PLN-01…04). Plans, prices, the trial and the
 * comparison rows all come from admin. One subscription covers the family.
 */

export type PlanInterval = 'monthly' | 'yearly';

export interface Plan {
  slug: string;
  name: string;
  /** "whole family" */
  covers: string | null;
  monthly_price: string;
  yearly_price: string;
  /** "Yearly · 2 months free" */
  yearly_saves_months: number;
  trial_days: number;
  is_free: boolean;
  active: boolean;
  limits: Record<string, number | null>;
}

export interface Subscription {
  id: number;
  plan: Plan;
  interval: PlanInterval;
  next_interval: PlanInterval | null;
  status: 'trialing' | 'active' | 'past_due' | 'expired';
  price: string;
  next_price: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  /** Why the last payment failed (in the grace days). */
  failure: string | null;
  /** This person pays (else someone in the family does). */
  mine: boolean;
  payer: string;
  pay_wallet: { id: number; name: string; balance: string } | null;
  family: { name: string | null; count: number };
  receipts_to: string | null;
  payments: { reference: string; amount: string; interval: PlanInterval; status: 'paid' | 'failed'; failure: string | null; at: string | null }[];
}

export interface PlansData {
  plans: Plan[];
  features: { label: string; values: Record<string, string> }[];
  current: string;
  subscription: Subscription | null;
  trial_available: boolean;
  family: { name: string | null; count: number };
  wallets: { id: number; name: string; type: string; balance: string }[];
  email: string | null;
}

const KEY = ['plans'] as const;

export function usePlans() {
  return useQuery({ queryKey: KEY, queryFn: () => api<PlansData>('/plans') });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: accountKeys.limits });
    void qc.invalidateQueries({ queryKey: keys.wallets });
  };
}

/** PLN-02 "Start free trial" (or pay now when the trial was used). */
export function useStartSubscription() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { plan: string; interval: PlanInterval; wallet_id: number; pin: string }) =>
      api<{ subscription: Subscription }>('/subscription', { method: 'POST', body: input }).then((d) => d.subscription),
    onSuccess: refresh,
  });
}

/** PLN-03 "Switch to monthly", "Paid from · Edit". */
export function useUpdateSubscription() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { interval?: PlanInterval; wallet_id?: number }) =>
      api<{ subscription: Subscription }>('/subscription', { method: 'PATCH', body: input }).then((d) => d.subscription),
    onSuccess: refresh,
  });
}

/** PLN-03 "Cancel Pro" / keep it after all. */
export function useCancelSubscription(resume = false) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => api<{ subscription: Subscription }>(`/subscription/${resume ? 'resume' : 'cancel'}`, { method: 'POST' }).then((d) => d.subscription),
    onSuccess: refresh,
  });
}
