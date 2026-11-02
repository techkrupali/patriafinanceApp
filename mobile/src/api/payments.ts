import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { SavedAccount, SavedAccountGroup } from './types';

/** SND-01 "Recent": someone paid lately. */
export interface RecentPayee {
  key: string;
  kind: 'user' | 'bank';
  name: string;
  username?: string | null;
  identifier?: string;
  bank_code?: string | null;
  bank_name?: string | null;
  account_number?: string;
}

export interface SendOptions {
  /** Naira decimal string: the fee on a payment to a bank account. */
  bank_fee: string;
  saved_count: number;
  group_count: number;
  recent: RecentPayee[];
}

/** TXN-01 one line. */
export interface TxnRow {
  id: number;
  reference: string;
  wallet_id: number;
  type: string;
  direction: 'credit' | 'debit';
  amount: string;
  fee: string;
  status: string;
  description: string | null;
  counterparty: Record<string, unknown> | null;
  created_at: string | null;
  title: string;
  counterparty_name: string | null;
  wallet: { id: number; name: string; type: string } | null;
  category: string | null;
  by_me: boolean;
}

export interface TxnWeek {
  out: string;
  change_percent: number | null;
  days: { day: string; out: string }[];
}

/** TXN-01 "Tolu: school trip · Needs Emeka · Waiting". */
export interface TxnWaiting {
  approval_id: number;
  title: string;
  amount: string;
  wallet: { id: number; name: string; type: string } | null;
  waiting_on: string[];
  by: string | null;
  created_at: string | null;
}

export interface TxnDetail extends TxnRow {
  balance_after: string | null;
  by: string | null;
  approval: { by: string[] } | null;
  reported: boolean;
  /** TXN-04 the open dispute the report started. */
  dispute_id?: number | null;
  problems: { key: string; label: string }[];
}

export interface SavedAccountDetail {
  account: SavedAccount;
  paid_this_year: string;
  payments_this_year: number;
  next_payment: { on: string; amount: string; label: string } | null;
  rules: { id: number; label: string; amount: string; when: string; enabled: boolean; wallet: string | null }[];
}

export const paymentKeys = {
  options: ['send-options'] as const,
  transactions: (filters: Record<string, string | number | undefined>) => ['transactions', filters] as const,
  transaction: (id: number) => ['transaction', id] as const,
  saved: (id: number) => ['saved-account', id] as const,
  group: (id: number) => ['saved-group', id] as const,
};

export function useSendOptions() {
  return useQuery({ queryKey: paymentKeys.options, queryFn: () => api<SendOptions>('/send/options') });
}

export function useTransactions(filters: { wallet_id?: number; from?: string; to?: string; direction?: 'credit' | 'debit'; page?: number }) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return useQuery({
    queryKey: paymentKeys.transactions(filters),
    queryFn: () => api<{ waiting: TxnWaiting[]; transactions: TxnRow[]; week: TxnWeek; pagination: { page: number; last_page: number; total: number } }>(`/transactions${query ? `?${query}` : ''}`),
  });
}

export function useTransaction(id: number) {
  return useQuery({ queryKey: paymentKeys.transaction(id), queryFn: () => api<{ transaction: TxnDetail }>(`/transactions/${id}`), select: (d) => d.transaction });
}

export function useReportTransaction(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { problem: string; details?: string }) => api<{ support_request_id: number; dispute_id: number; frozen: boolean }>(`/transactions/${id}/report`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: paymentKeys.transaction(id) });
      void qc.invalidateQueries({ queryKey: ['disputes'] });
    },
  });
}

/** Save a Patriai user ("@emeka") as a payee. */
export function useSavePayee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { identifier: string; nickname?: string; category?: string }) => api<{ account: SavedAccount }>('/saved-accounts', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-accounts'] });
      void qc.invalidateQueries({ queryKey: paymentKeys.options });
    },
  });
}

export function useSavedAccountDetail(id: number) {
  return useQuery({ queryKey: paymentKeys.saved(id), queryFn: () => api<SavedAccountDetail>(`/saved-accounts/${id}`) });
}

export function useUpdateSavedAccount(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { nickname?: string; category?: string }) => api<{ account: SavedAccount }>(`/saved-accounts/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-accounts'] });
      void qc.invalidateQueries({ queryKey: paymentKeys.saved(id) });
    },
  });
}

export function useRemoveSavedAccount(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rules?: 'pause' | 'delete' }) => api<{ rules: number }>(`/saved-accounts/${id}`, { method: 'DELETE', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-accounts'] });
      void qc.invalidateQueries({ queryKey: paymentKeys.options });
    },
  });
}

export function useSavedGroup(id: number) {
  return useQuery({ queryKey: paymentKeys.group(id), queryFn: () => api<{ group: SavedAccountGroup }>(`/saved-account-groups/${id}`), select: (d) => d.group });
}

export function useUpdateSavedGroup(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; split?: 'even' | 'percent' | 'fixed'; shares?: Record<number, number>; saved_account_ids?: number[] }) =>
      api<{ group: SavedAccountGroup }>(`/saved-account-groups/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['saved-accounts'] });
      void qc.invalidateQueries({ queryKey: paymentKeys.group(id) });
    },
  });
}

/** SND-10 "Remind Emeka" (once an hour). */
export function useRemindApproval(id: number) {
  return useMutation({ mutationFn: () => api<{ reminded: number }>(`/approvals/${id}/remind`, { method: 'POST' }) });
}

/** TXN-03 "Download PDF": a 10-minute link that opens in the browser. */
export function useReceiptLink(id: number) {
  return useMutation({ mutationFn: () => api<{ url: string }>(`/transactions/${id}/receipt-link`, { method: 'POST' }) });
}
