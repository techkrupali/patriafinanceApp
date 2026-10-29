import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import { appendFile, type PickedFile } from '../lib/upload';
import type {
  ApprovalRequest,
  ApprovalsData,
  AuditLogPageData,
  TransactionsPageData,
  Wallet,
  WalletMembersData,
} from './types';

/**
 * The client sheet "Wallets · Manage" (WAL-03…15): activity with totals, who
 * put in what, the lock and asking to unlock, closing or archiving, statements
 * and the audit log. Amounts are naira strings.
 */

export type ActivityFilter = 'all' | 'in' | 'out' | 'requests' | 'rules';
export type AuditCategory = 'all' | 'rules' | 'members' | 'approvals';
export type StatementPeriod = 'this_month' | 'last_3_months' | 'since_start' | 'custom';

export interface ClosePreview {
  balance: string;
  goal_reached: boolean;
  paid_to: string | null;
  each: { user_id: number; name: string; amount: string }[];
  wallets: { id: number; name: string; type: string }[];
  main: { id: number; name: string } | null;
  needs: string[];
  blocked: string | null;
}

export interface StatementSummary {
  from: string;
  to: string;
  count: number;
  in: string;
  out: string;
  opening: string;
  closing: string;
  email: string | null;
  can_include_audit: boolean;
}

export interface StatementOptions {
  period: StatementPeriod;
  from?: string | null;
  to?: string | null;
  format?: 'pdf' | 'csv';
  contributions?: boolean;
  audit?: boolean;
}

/** What changes when the wallet's rules or state change. */
function useWalletRefresh(walletId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: ['approvals'] });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    void qc.invalidateQueries({ queryKey: keys.home });
  };
}

/** WAL-03 money in or out, 20 at a time, with the month's and all-time totals. */
export function useWalletActivity(walletId: number, direction: 'credit' | 'debit' | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...keys.walletTransactions(walletId), direction ?? 'all'] as const,
    queryFn: ({ pageParam }) =>
      api<TransactionsPageData>(`/wallets/${walletId}/transactions?page=${pageParam}&per_page=20${direction ? `&direction=${direction}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined),
    enabled,
  });
}

/** WAL-03 "Requests": every approval request on the wallet. */
export function useWalletRequests(walletId: number, enabled = true) {
  return useQuery({
    queryKey: ['approvals', 'wallet', walletId] as const,
    queryFn: () => api<ApprovalsData>(`/approvals?scope=wallet&wallet_id=${walletId}`),
    select: (d) => d.approvals,
    enabled,
  });
}

/** WAL-04 members with what each put in. */
export function useWalletPeople(walletId: number, enabled = true) {
  return useQuery({
    queryKey: keys.walletMembers(walletId),
    queryFn: () => api<WalletMembersData>(`/wallets/${walletId}/members`),
    enabled,
  });
}

/** WAL-14 "Everything · Rules · Members · Approvals". */
export function useAuditLog(walletId: number, category: AuditCategory, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...keys.walletAuditLog(walletId), category] as const,
    queryFn: ({ pageParam }) =>
      api<AuditLogPageData>(`/wallets/${walletId}/audit-log?page=${pageParam}&per_page=20${category !== 'all' ? `&category=${category}` : ''}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined),
    enabled,
  });
}

/** WAL-10 "Lock wallet". */
export function useLockWallet(walletId: number) {
  const refresh = useWalletRefresh(walletId);
  return useMutation({
    mutationFn: (input: { mode: 'date' | 'target' | 'agree'; until?: string | null; pay_payee?: boolean }) =>
      api<{ wallet: Wallet }>(`/wallets/${walletId}/lock`, { method: 'POST', body: input }),
    onSuccess: refresh,
  });
}

/** WAL-10 "Until we both agree": asks the other owners; alone, an expired lock just goes. */
export function useRemoveLock(walletId: number) {
  const refresh = useWalletRefresh(walletId);
  return useMutation({
    mutationFn: () => api<{ wallet: Wallet; approval: ApprovalRequest | null }>(`/wallets/${walletId}/unlock`, { method: 'POST' }),
    onSuccess: refresh,
  });
}

/** WAL-11 "Send to Emeka": take an amount out of a locked wallet, with proof. */
export function useAskToUnlock(walletId: number) {
  const refresh = useWalletRefresh(walletId);
  return useMutation({
    mutationFn: async (input: { amount: string; purpose: string; pay_to: 'payee' | 'main' | 'saved'; saved_account_id?: number | null; proof?: PickedFile | null }) => {
      const form = new FormData();
      form.append('amount', input.amount);
      form.append('purpose', input.purpose);
      form.append('pay_to', input.pay_to);
      if (input.saved_account_id) form.append('saved_account_id', String(input.saved_account_id));
      if (input.proof) await appendFile(form, 'proof', input.proof, 'proof');
      return api<{ approval: ApprovalRequest }>(`/wallets/${walletId}/unlock-requests`, { method: 'POST', body: form });
    },
    onSuccess: refresh,
  });
}

/** WAL-13 what's left, how it splits and who confirms. */
export function useClosePreview(walletId: number, enabled = true) {
  return useQuery({
    queryKey: [...keys.wallet(walletId), 'close'] as const,
    queryFn: () => api<ClosePreview>(`/wallets/${walletId}/close`),
    enabled,
  });
}

export function useCloseWallet(walletId: number) {
  const qc = useQueryClient();
  const refresh = useWalletRefresh(walletId);
  return useMutation({
    mutationFn: (input: { mode: 'archive' | 'close'; move_to: 'each' | 'wallet' | 'main' | null; wallet_id?: number | null }) =>
      api<{ done: boolean; wallet: Wallet; approval: ApprovalRequest | null }>(`/wallets/${walletId}/close`, { method: 'POST', body: input }),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: keys.family });
    },
  });
}

function statementQuery(o: StatementOptions): string {
  const q = new URLSearchParams({ period: o.period });
  if (o.period === 'custom') {
    if (o.from) q.set('from', o.from);
    if (o.to) q.set('to', o.to);
  }
  return q.toString();
}

/** WAL-15 card: "24 Aug 2026 to 24 Oct 2026 · 7 transactions · ₦680,000 in". */
export function useStatementSummary(walletId: number, options: StatementOptions, enabled = true) {
  return useQuery({
    queryKey: [...keys.wallet(walletId), 'statement', options.period, options.from ?? null, options.to ?? null] as const,
    queryFn: () => api<StatementSummary>(`/wallets/${walletId}/statement?${statementQuery(options)}`),
    enabled,
  });
}

/** A 10-minute download link the browser or phone opens. */
export function useStatementLink(walletId: number) {
  return useMutation({
    mutationFn: (o: StatementOptions) => api<{ url: string }>(`/wallets/${walletId}/statement/link`, { method: 'POST', body: o }),
  });
}

export function useEmailStatement(walletId: number) {
  return useMutation({
    mutationFn: (o: StatementOptions) => api<{ sent_to: string }>(`/wallets/${walletId}/statement/email`, { method: 'POST', body: o }),
  });
}
