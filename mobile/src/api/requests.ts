import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** REQ-01…03 one money request, as the requester or the person asked sees it. */
export interface MoneyRequest {
  code: string;
  /** https://…/r/N3V8 — anyone can pay with it. */
  link: string;
  /** You asked; otherwise you were asked. */
  mine: boolean;
  status: 'pending' | 'paid' | 'declined' | 'cancelled';
  /** Naira decimal strings. */
  amount: string;
  paid_amount: string;
  left: string;
  note: string | null;
  due_on: string | null;
  decline_reason: string | null;
  requester: { id: number; name: string; first_name: string };
  payer: { id: number | null; name: string | null; on_patriai: boolean; contact: string | null };
  wallet: { id: number; name: string; type: string };
  /** REQ-03 "You're a contributor": the wallet it goes to is one you're in. */
  payer_is_member: boolean;
  split: { key: string; title: string } | null;
  reminded_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

/** SPL-01 a bill shared out as requests. */
export interface BillSplit {
  key: string;
  title: string;
  /** "Paid by you at Yellow Chilli". */
  place: string | null;
  method: 'equal' | 'amount' | 'share';
  total: string;
  my_part: string;
  asked: string;
  /** "Back to you so far". */
  back: string;
  wallet: { id: number; name: string };
  created_at: string | null;
  people: MoneyRequest[];
  /** First names still to pay. */
  waiting: string[];
}

/** Who to ask: someone on Patriai (an @tag, phone or email) or someone not on it yet. */
export type Asked = { identifier: string } | { name: string; contact: string };

export const requestKeys = {
  all: ['money-requests'] as const,
  one: (code: string) => ['money-request', code] as const,
  split: (key: string) => ['bill-split', key] as const,
};

export function useMoneyRequests() {
  return useQuery({ queryKey: requestKeys.all, queryFn: () => api<{ to_me: MoneyRequest[]; sent: MoneyRequest[] }>('/money-requests') });
}

export function useMoneyRequest(code: string) {
  return useQuery({ queryKey: requestKeys.one(code), queryFn: () => api<MoneyRequest>(`/money-requests/${code}`), enabled: code.length > 0 });
}

export function useCreateMoneyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Asked & { amount: string; note?: string; wallet_id: number; due_on?: string }) => api<MoneyRequest>('/money-requests', { method: 'POST', body: input }),
    onSuccess: (r) => {
      qc.setQueryData(requestKeys.one(r.code), r);
      void qc.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

/** Decline, cancel or remind: each answers with the request as it is now. */
export function useMoneyRequestAction(code: string, action: 'decline' | 'cancel' | 'remind') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input?: { reason?: string }) => api<MoneyRequest>(`/money-requests/${code}/${action}`, { method: 'POST', body: input ?? {} }),
    onSuccess: (r) => {
      qc.setQueryData(requestKeys.one(code), r);
      void qc.invalidateQueries({ queryKey: requestKeys.all });
      if (r.split) void qc.invalidateQueries({ queryKey: requestKeys.split(r.split.key) });
    },
  });
}

export function useCreateSplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      place?: string;
      total: string;
      method: 'equal' | 'amount' | 'share';
      wallet_id: number;
      note?: string;
      people: (Asked & { amount?: string; shares?: number })[];
      my_shares?: number;
    }) => api<BillSplit>('/bill-splits', { method: 'POST', body: input }),
    onSuccess: (s) => {
      qc.setQueryData(requestKeys.split(s.key), s);
      void qc.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

export function useBillSplit(key: string) {
  return useQuery({ queryKey: requestKeys.split(key), queryFn: () => api<BillSplit>(`/bill-splits/${key}`), enabled: key.length > 0 });
}

export function useRemindSplit(key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<BillSplit>(`/bill-splits/${key}/remind`, { method: 'POST' }),
    onSuccess: (s) => qc.setQueryData(requestKeys.split(key), s),
  });
}
