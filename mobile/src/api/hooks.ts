import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { getDeviceMeta } from '../lib/device';
import type {
  AuthSessionData,
  BanksData,
  DashboardData,
  DevicesData,
  FundingDetailsData,
  LoginPayload,
  MeData,
  OtpRequestData,
  RegisterData,
  RegisterPayload,
  Transaction,
  TransactionsPageData,
  TransferData,
  TransferPayload,
  VerifyAccountData,
  WalletCreatedData,
  WalletDetailData,
  WalletsData,
  WithdrawData,
  WithdrawPayload,
} from './types';

// ---------- Query keys ----------

export const keys = {
  dashboard: ['dashboard'] as const,
  wallets: ['wallets'] as const,
  wallet: (id: number) => ['wallets', id] as const,
  walletTransactions: (id: number) => ['wallets', id, 'transactions'] as const,
  funding: (id: number) => ['wallets', id, 'funding'] as const,
  banks: ['banks'] as const,
  devices: ['devices'] as const,
  me: ['me'] as const,
};

// ---------- Queries ----------

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api<DashboardData>('/dashboard'),
  });
}

export function useWallets() {
  return useQuery({
    queryKey: keys.wallets,
    queryFn: () => api<WalletsData>('/wallets'),
    select: (d) => d.wallets,
  });
}

export function useWallet(id: number) {
  return useQuery({
    queryKey: keys.wallet(id),
    queryFn: () => api<WalletDetailData>(`/wallets/${id}`),
  });
}

export function useWalletTransactions(id: number) {
  return useInfiniteQuery({
    queryKey: keys.walletTransactions(id),
    queryFn: ({ pageParam }) =>
      api<TransactionsPageData>(`/wallets/${id}/transactions?page=${pageParam}&per_page=20`),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined,
  });
}

export function useFundingDetails(id: number) {
  return useQuery({
    queryKey: keys.funding(id),
    queryFn: () => api<FundingDetailsData>(`/wallets/${id}/funding-details`),
  });
}

export function useBanks() {
  return useQuery({
    queryKey: keys.banks,
    queryFn: () => api<BanksData>('/banks'),
    select: (d) => d.banks,
    staleTime: 1000 * 60 * 30,
  });
}

export function useDevices() {
  return useQuery({
    queryKey: keys.devices,
    queryFn: () => api<DevicesData>('/devices'),
    select: (d) => d.devices,
  });
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<MeData>('/auth/me'),
    select: (d) => d.user,
  });
}

/**
 * Aggregated activity across all accessible wallets: first page of each
 * wallet's transactions, merged and sorted newest-first.
 */
export function useActivity() {
  const walletsQuery = useWallets();
  const wallets = walletsQuery.data ?? [];

  const txQueries = useQueries({
    queries: wallets.map((w) => ({
      queryKey: [...keys.walletTransactions(w.id), 'first-page'] as const,
      queryFn: () =>
        api<TransactionsPageData>(`/wallets/${w.id}/transactions?page=1&per_page=50`),
      enabled: wallets.length > 0,
    })),
  });

  const isLoading = walletsQuery.isLoading || txQueries.some((q) => q.isLoading);
  const error = walletsQuery.error ?? txQueries.find((q) => q.error)?.error ?? null;

  const seen = new Set<number>();
  const transactions: Transaction[] = [];
  for (const q of txQueries) {
    for (const t of q.data?.transactions ?? []) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        transactions.push(t);
      }
    }
  }
  transactions.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  const walletNames = new Map<number, string>(wallets.map((w) => [w.id, w.name]));

  const refetch = () => {
    void walletsQuery.refetch();
    txQueries.forEach((q) => void q.refetch());
  };
  const isRefetching = walletsQuery.isRefetching || txQueries.some((q) => q.isRefetching);

  return { transactions, walletNames, isLoading, error, refetch, isRefetching };
}

// ---------- Auth mutations ----------

export function useLogin() {
  return useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      const device = await getDeviceMeta();
      const payload: LoginPayload = { ...input, ...device };
      return api<AuthSessionData>('/auth/login', { method: 'POST', body: payload });
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: async (
      input: Omit<RegisterPayload, 'device_id' | 'device_name' | 'platform'>,
    ) => {
      const device = await getDeviceMeta();
      const payload: RegisterPayload = { ...input, ...device };
      return api<RegisterData>('/auth/register', { method: 'POST', body: payload });
    },
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (input: { identifier: string; purpose: 'login' | 'verify' | 'reset' }) =>
      api<OtpRequestData>('/auth/otp/request', { method: 'POST', body: input }),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: { identifier: string; purpose: 'login' | 'verify'; code: string }) => {
      const device = await getDeviceMeta();
      return api<AuthSessionData>('/auth/otp/verify', {
        method: 'POST',
        body: { ...input, ...device },
      });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: { identifier: string }) =>
      api<OtpRequestData>('/auth/forgot-password', { method: 'POST', body: input }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { identifier: string; code: string; password: string }) =>
      api('/auth/reset-password', { method: 'POST', body: input }),
  });
}

export function useLogoutApi() {
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
  });
}

// ---------- Wallet / money mutations ----------

export function useCreateWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: 'shared' | 'project'; name: string }) =>
      api<WalletCreatedData>('/wallets', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useWithdraw(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WithdrawPayload) =>
      api<WithdrawData>(`/wallets/${walletId}/withdraw`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferPayload) =>
      api<TransferData>('/transfers', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useVerifyAccount() {
  return useMutation({
    mutationFn: (input: { account_number: string; bank_code: string }) =>
      api<VerifyAccountData>('/banks/verify-account', { method: 'POST', body: input }),
  });
}

// ---------- Profile mutations ----------

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      api('/profile/change-password', { method: 'POST', body: input }),
  });
}

export function useChangePin() {
  return useMutation({
    mutationFn: (input: { current_pin?: string; new_pin: string; password: string }) =>
      api('/profile/change-pin', { method: 'POST', body: input }),
  });
}
