import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';

/**
 * Insights (client prototype INS-01…06) and statements for several wallets
 * (INS-07, STM-01/02). Money in and out counts only what crossed the edge of
 * the wallets you can see: moving money between them is neither. Amounts are
 * naira strings ("615000.00").
 */

export type InsightsRange = 'month' | '6m' | 'year';

export interface InsightsOverview {
  scope: string;
  range: InsightsRange;
  /** "this month", "last 6 months", "in 2026" */
  period: string;
  in: string;
  /** "Salaries and gifts from family" */
  in_note: string;
  out: string;
  /** in − out; negative when more went out. */
  left: string;
  bars: { key: string; label: string; in: string; out: string }[];
  lines: {
    categories: string;
    budget: string | null;
    forecast: string;
    contributions: string | null;
  };
  wallets: number;
}

export type CategoryKey = 'food' | 'school' | 'transport' | 'bills' | 'home' | 'health' | 'giving' | 'family' | 'ajo' | 'other';

export interface CategoriesData {
  scope: string;
  month: string;
  label: string;
  year: number;
  total: string;
  previous: string | null;
  next: string | null;
  categories: { key: CategoryKey; name: string; amount: string; percent: number; change: number | null }[];
}

export interface WalletReport {
  wallet: { id: number; name: string; type: string };
  since: string;
  since_label: string;
  balance: string;
  balance_note: string;
  put_in: string;
  put_in_count: number;
  months: number;
  paid_out: string;
  paid_out_count: number;
  biggest_out: { description: string; amount: string } | null;
  biggest_contributor: { name: string; percent: number } | null;
  approvals: { count: number; approved: number; declined: number; waiting: number; avg_hours: number | null } | null;
}

export interface BudgetActual {
  wallet_id: number;
  name: string;
  period: 'weekly' | 'monthly' | 'one_off';
  days_gone: number | null;
  days_total: number | null;
  amount: string;
  spent: string;
  percent: number;
  time_percent: number | null;
  pace: string;
  categories: { id: number; name: string; limit: string; spent: string; state: 'within' | 'close' | 'used' }[];
}

export interface ForecastGoal {
  wallet_id: number;
  name: string;
  target: string;
  target_date: string | null;
  balance: string;
  per_month: string;
  projected: string | null;
  reach_date: string | null;
  status: 'reached' | 'on_track' | 'short' | 'no_date' | 'stalled';
  short: string | null;
  per_month_more: string | null;
  /** "₦850,000 by 8 Jan · Reach it 2 Jan" */
  line: string;
}

export interface ForecastData {
  goals: ForecastGoal[];
  tip: string | null;
  short_wallet_id: number | null;
}

export interface ContributionsData {
  year: number;
  wallets: number;
  total: string;
  people_count: number;
  on_time: { done: number; of: number; percent: number | null };
  people: { user_id: number; name: string; full_name: string | null; amount: string; on_time: number; due: number; note: string; is_me: boolean }[];
  others: string | null;
  owner_view: boolean;
}

export interface StatementWallet {
  id: number;
  name: string;
  type: string;
  balance: string;
  status: string;
  mine: boolean;
}

export interface StatementMonth {
  key: string;
  label: string;
  from: string;
  to: string;
  count: number;
  in_progress?: boolean;
  ready_on?: string | null;
}

export type BatchPeriod = 'last_month' | 'last_3_months' | 'this_year' | 'custom';
export type BatchFormat = 'pdf' | 'xlsx' | 'csv';

export interface BatchOptions {
  wallet_ids: number[];
  period: BatchPeriod;
  from?: string | null;
  to?: string | null;
  combined: boolean;
}

export interface BatchFiles {
  from: string;
  to: string;
  combined: boolean;
  files: { key: string; name: string; wallet_ids: number[]; label: string; count: number }[];
  email: string | null;
}

export function useInsights(range: InsightsRange) {
  return useQuery({
    queryKey: ['insights', 'overview', range] as const,
    queryFn: () => api<InsightsOverview>(`/insights?range=${range}`),
  });
}

export function useInsightCategories(month: string | null) {
  return useQuery({
    queryKey: ['insights', 'categories', month ?? 'now'] as const,
    queryFn: () => api<CategoriesData>(`/insights/categories${month ? `?month=${month}` : ''}`),
  });
}

export function useWalletReport(walletId: number | null) {
  return useQuery({
    queryKey: ['insights', 'wallet', walletId] as const,
    queryFn: () => api<WalletReport>(`/insights/wallets/${walletId}`),
    enabled: walletId !== null,
  });
}

export function useBudgetActual() {
  return useQuery({
    queryKey: ['insights', 'budget'] as const,
    queryFn: () => api<{ budgets: BudgetActual[] }>('/insights/budget'),
  });
}

export function useForecast() {
  return useQuery({
    queryKey: ['insights', 'forecast'] as const,
    queryFn: () => api<ForecastData>('/insights/forecast'),
  });
}

export function useContributions(year?: number) {
  return useQuery({
    queryKey: ['insights', 'contributions', year ?? 'now'] as const,
    queryFn: () => api<ContributionsData>(`/insights/contributions${year ? `?year=${year}` : ''}`),
  });
}

export function useStatementWallets() {
  return useQuery({
    queryKey: ['statements', 'wallets'] as const,
    queryFn: () => api<{ wallets: StatementWallet[]; email: string | null }>('/statements'),
  });
}

export function useStatementMonths(wallet: number | 'all') {
  return useQuery({
    queryKey: ['statements', 'months', wallet] as const,
    queryFn: () => api<{ months: StatementMonth[]; years: StatementMonth[] }>(`/statements/months?wallet=${wallet}`),
  });
}

export function useStatementBatch(o: BatchOptions | null) {
  return useQuery({
    queryKey: ['statements', 'batch', o] as const,
    queryFn: () => api<BatchFiles>('/statements/batch', { method: 'POST', body: o }),
    enabled: o !== null && o.wallet_ids.length > 0,
  });
}

/** A 10-minute link: one wallet's file (wallet_id), or everything (combined file or a zip). */
export function useStatementBatchLink() {
  return useMutation({
    mutationFn: (o: BatchOptions & { format: BatchFormat; wallet_id?: number | null }) =>
      api<{ url: string }>('/statements/batch/link', { method: 'POST', body: o }),
  });
}

export function useEmailStatements() {
  return useMutation({
    mutationFn: (o: BatchOptions & { format: BatchFormat }) => api<{ sent_to: string }>('/statements/batch/email', { method: 'POST', body: o }),
  });
}

/** INS-02 colours, the same for a category everywhere. */
export const CATEGORY_COLOURS: Record<CategoryKey, string> = {
  food: '#0B5D4B',
  school: '#1FA07A',
  transport: '#F2A93B',
  bills: '#5FD3A5',
  home: '#8F5400',
  health: '#B3311A',
  giving: '#1D5FA8',
  family: '#6B4FA0',
  ajo: '#08392F',
  other: '#6F8A7E',
};
