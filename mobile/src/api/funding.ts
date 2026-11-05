import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';

/**
 * Adding money besides a bank transfer (client prototype ADD-01…09): by card
 * through the payment partner, by the bank's USSD code to the wallet's own
 * account, or with cash at an agent. Amounts are naira strings.
 */

export interface SavedCard {
  id: number;
  brand: string;
  last4: string;
  /** "Verve •••• 2231" */
  label: string;
  /** "08/28" */
  expiry: string | null;
  bank: string | null;
}

export interface FundingOptions {
  wallet: { id: number; name: string; type: string };
  card: { enabled: boolean; fee_percent: number; fee_cap: string; min: string; max: string; test_mode: boolean };
  saved_cards: SavedCard[];
  /** The wallet's own account: what USSD and agents send to. */
  account: { number: string; bank: string; name: string } | null;
  /** "*737*2*{amount}*{account}#" per bank. */
  ussd: { bank: string; code: string }[];
}

export type CardPaymentStatus = 'pending' | 'otp' | 'success' | 'failed';

export interface CardPayment {
  reference: string;
  status: CardPaymentStatus;
  amount: string;
  fee: string;
  total: string;
  card: string | null;
  /** The bank's reason, or "Enter the code sent to…". */
  message: string | null;
  /** The partner's page for a new card, while it's open. */
  checkout_url: string | null;
  wallet: { id: number; name: string; balance: string };
  transaction_reference: string | null;
  created_at: string | null;
}

export interface Agent {
  id: number;
  name: string;
  address: string | null;
  area: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  hours: string | null;
  phone: string | null;
  cash_in: boolean;
  cash_out: boolean;
  distance_m: number | null;
}

export function useFundingOptions(walletId: number | null) {
  return useQuery({
    queryKey: ['funding', 'options', walletId] as const,
    queryFn: () => api<FundingOptions>(`/funding/options?wallet_id=${walletId}`),
    enabled: walletId !== null,
  });
}

/** What a card top-up changes: the wallet, home, activity. */
function useAfterMoneyIn() {
  const qc = useQueryClient();
  return (p: CardPayment) => {
    if (p.status !== 'success') return;
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: keys.wallet(p.wallet.id) });
    void qc.invalidateQueries({ queryKey: keys.home });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    // Saved cards (a new one may have been kept); never this payment's own query.
    void qc.invalidateQueries({ queryKey: ['funding', 'options'] });
  };
}

/** ADD-03 "Pay ₦50,750": a saved card (card_id), or the partner's checkout. */
export function useStartCardPayment() {
  const after = useAfterMoneyIn();
  return useMutation({
    mutationFn: (input: { wallet_id: number; amount: string; card_id?: number | null }) =>
      api<{ payment: CardPayment }>('/funding/card', { method: 'POST', body: input }).then((d) => d.payment),
    onSuccess: after,
  });
}

/** ADD-08/09: how it went. Asks again every few seconds while the bank is still deciding. */
export function useCardPayment(reference: string, poll: boolean) {
  const qc = useQueryClient();
  const after = useAfterMoneyIn();
  return useQuery({
    queryKey: ['funding', 'card', reference] as const,
    queryFn: async () => {
      const before = qc.getQueryData<CardPayment>(['funding', 'card', reference]);
      const p = (await api<{ payment: CardPayment }>(`/funding/card/${reference}`)).payment;
      // Refresh balances once, when it turns into "Money added".
      if (before?.status !== 'success') after(p);
      return p;
    },
    refetchInterval: (q) => (poll && (!q.state.data || q.state.data.status === 'pending') ? 3000 : false),
  });
}

/** ADD-04 "Confirm": the bank's code. */
export function useSubmitCardOtp(reference: string) {
  const qc = useQueryClient();
  const after = useAfterMoneyIn();
  return useMutation({
    mutationFn: (otp: string) => api<{ payment: CardPayment }>(`/funding/card/${reference}/otp`, { method: 'POST', body: { otp } }).then((d) => d.payment),
    onSuccess: (p) => {
      qc.setQueryData(['funding', 'card', reference], p);
      after(p);
    },
  });
}

export function useRemoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/cards/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['funding', 'options'] }),
  });
}

/** ADD-06: agents nearest first when we know where you are. */
export function useAgents(at: { lat: number; lng: number } | null, enabled: boolean) {
  return useQuery({
    queryKey: ['funding', 'agents', at?.lat ?? null, at?.lng ?? null] as const,
    queryFn: () => api<{ located: boolean; agents: Agent[] }>(at ? `/funding/agents?lat=${at.lat}&lng=${at.lng}` : '/funding/agents'),
    enabled,
  });
}

/** "*737*2*50000*8034127790#" */
export function ussdCode(template: string, account: string, amount: string): string {
  const whole = String(Math.round(parseFloat(amount) || 0));
  return template.replace('{account}', account).replace('{amount}', whole !== '0' ? whole : 'Amount');
}

/** 350 → "350 m", 1240 → "1.2 km" */
export function distanceLabel(m: number | null): string | null {
  if (m === null) return null;
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(Math.round(m / 100) / 10).toLocaleString('en-NG')} km`;
}
