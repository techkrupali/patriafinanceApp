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
  AddMilestonePayload,
  ApplyLoanPayload,
  ApprovalDetailData,
  ApprovalsData,
  AssignVendorPayload,
  AuthSessionData,
  BanksData,
  CreateInvitationPayload,
  CreateProjectPayload,
  CreateWalletPayload,
  DashboardData,
  DevicesData,
  FundingDetailsData,
  InvitationAcceptData,
  InvitationCreatedData,
  InvitationsData,
  KycState,
  KycSubmitData,
  LoanCancelData,
  LoanDetailData,
  LoanEligibility,
  LoanRepayResultData,
  LoansData,
  LoginPayload,
  MeData,
  MemberUpdatedData,
  MilestoneApprovedData,
  MilestoneCreatedData,
  MilestoneData,
  NotificationReadData,
  NotificationsPageData,
  OtpRequestData,
  ProjectCreatedData,
  ProjectDetailData,
  ProjectMutatedData,
  ProjectsData,
  RegisterData,
  RegisterPayload,
  RepayLoanPayload,
  RespondApprovalPayload,
  SubmitKycPayload,
  Transaction,
  TransactionsPageData,
  TransferData,
  TransferPayload,
  UnreadCountData,
  UpdateMemberPayload,
  UpdateWalletPayload,
  VerifyAccountData,
  WalletCreatedData,
  WalletDetailData,
  WalletMembersData,
  WalletsData,
  WalletUpdatedData,
  WithdrawData,
  WithdrawPayload,
} from './types';

type ApprovalScope = 'to_me' | 'mine';

// ---------- Query keys ----------

export const keys = {
  dashboard: ['dashboard'] as const,
  wallets: ['wallets'] as const,
  wallet: (id: number) => ['wallets', id] as const,
  walletTransactions: (id: number) => ['wallets', id, 'transactions'] as const,
  walletMembers: (id: number) => ['wallets', id, 'members'] as const,
  walletInvitations: (id: number) => ['wallets', id, 'invitations'] as const,
  funding: (id: number) => ['wallets', id, 'funding'] as const,
  banks: ['banks'] as const,
  devices: ['devices'] as const,
  me: ['me'] as const,
  myInvitations: ['invitations'] as const,
  approvals: (scope: ApprovalScope, status?: string) =>
    ['approvals', scope, status ?? 'all'] as const,
  approval: (id: number) => ['approvals', 'detail', id] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  // ---- Loans (Milestone 4) ----
  loans: ['loans'] as const,
  loanEligibility: ['loans', 'eligibility'] as const,
  loan: (id: number) => ['loans', id] as const,
  // ---- Projects (Milestone 5) ----
  projects: ['projects'] as const,
  project: (id: number) => ['projects', id] as const,
  // ---- KYC (Milestone 6) ----
  kyc: ['kyc'] as const,
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
    mutationFn: (input: CreateWalletPayload) =>
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
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
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
      void qc.invalidateQueries({ queryKey: ['approvals'] });
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

// ---------- Wallet settings & members (Milestone 3) ----------

export function useUpdateWallet(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWalletPayload) =>
      api<WalletUpdatedData>(`/wallets/${walletId}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useWalletMembers(walletId: number, enabled = true) {
  return useQuery({
    queryKey: keys.walletMembers(walletId),
    queryFn: () => api<WalletMembersData>(`/wallets/${walletId}/members`),
    select: (d) => d.members,
    enabled,
  });
}

export function useUpdateMember(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: number; body: UpdateMemberPayload }) =>
      api<MemberUpdatedData>(`/wallets/${walletId}/members/${input.memberId}`, {
        method: 'PATCH',
        body: input.body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.walletMembers(walletId) });
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    },
  });
}

export function useRemoveMember(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) =>
      api(`/wallets/${walletId}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.walletMembers(walletId) });
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    },
  });
}

// ---------- Invitations ----------

export function useWalletInvitations(walletId: number) {
  return useQuery({
    queryKey: keys.walletInvitations(walletId),
    queryFn: () => api<InvitationsData>(`/wallets/${walletId}/invitations`),
    select: (d) => d.invitations,
  });
}

export function useCreateInvitation(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitationPayload) =>
      api<InvitationCreatedData>(`/wallets/${walletId}/invitations`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.walletInvitations(walletId) });
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    },
  });
}

export function useCancelInvitation(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: number) =>
      api(`/wallets/${walletId}/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.walletInvitations(walletId) });
    },
  });
}

export function useMyInvitations() {
  return useQuery({
    queryKey: keys.myInvitations,
    queryFn: () => api<InvitationsData>('/invitations'),
    select: (d) => d.invitations,
  });
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: number) =>
      api<InvitationAcceptData>(`/invitations/${invitationId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.myInvitations });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

export function useDeclineInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: number) =>
      api(`/invitations/${invitationId}/decline`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.myInvitations });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

// ---------- Approvals ----------

export function useApprovals(scope: ApprovalScope, status?: string) {
  return useQuery({
    queryKey: keys.approvals(scope, status),
    queryFn: () =>
      api<ApprovalsData>(
        `/approvals?scope=${scope}${status ? `&status=${status}` : ''}`,
      ),
    select: (d) => d.approvals,
  });
}

export function useApproval(id: number) {
  return useQuery({
    queryKey: keys.approval(id),
    queryFn: () => api<ApprovalDetailData>(`/approvals/${id}`),
    select: (d) => d.approval,
  });
}

export function useRespondApproval(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RespondApprovalPayload) =>
      api<ApprovalDetailData>(`/approvals/${id}/respond`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.approval(id) });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

export function useCancelApproval(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ApprovalDetailData>(`/approvals/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.approval(id) });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

// ---------- Notifications ----------

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) =>
      api<NotificationsPageData>(`/notifications?page=${pageParam}&per_page=20`),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => api<UnreadCountData>('/notifications/unread-count'),
    select: (d) => d.count,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<NotificationReadData>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

// ---------- Loans (Milestone 4 — Patria Lending) ----------

export function useLoans() {
  return useQuery({
    queryKey: keys.loans,
    queryFn: () => api<LoansData>('/loans'),
  });
}

export function useLoanEligibility() {
  return useQuery({
    queryKey: keys.loanEligibility,
    queryFn: () => api<LoanEligibility>('/loans/eligibility'),
  });
}

export function useLoan(id: number) {
  return useQuery({
    queryKey: keys.loan(id),
    queryFn: () => api<LoanDetailData>(`/loans/${id}`),
  });
}

/**
 * Loan mutations all move money and change eligibility, so they invalidate the
 * loans list (which, by prefix, also refreshes eligibility + any loan detail),
 * the dashboard, the wallets list and the affected wallet.
 */
export function useApplyLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyLoanPayload) =>
      api<LoanDetailData>('/loans', { method: 'POST', body: input }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: keys.loans });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      if (data.loan.disbursed_wallet_id != null) {
        void qc.invalidateQueries({ queryKey: keys.wallet(data.loan.disbursed_wallet_id) });
      }
    },
  });
}

export function useRepayLoan(loanId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RepayLoanPayload) =>
      api<LoanRepayResultData>(`/loans/${loanId}/repay`, { method: 'POST', body: input }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: keys.loans });
      void qc.invalidateQueries({ queryKey: keys.loan(loanId) });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.wallet(data.transaction.wallet_id) });
    },
  });
}

export function useCancelLoan(loanId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<LoanCancelData>(`/loans/${loanId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.loans });
      void qc.invalidateQueries({ queryKey: keys.loan(loanId) });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.wallets });
    },
  });
}

// ---------- Projects & milestones (Milestone 5 — Vendor & Project System) ----------

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => api<ProjectsData>('/projects'),
    select: (d) => d.projects,
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: () => api<ProjectDetailData>(`/projects/${id}`),
  });
}

/**
 * Project mutations invalidate the affected project detail, the projects list
 * and the dashboard (whose project counters move). Milestone approve/release
 * also moves money, so it additionally invalidates every wallet query (the
 * escrow wallet + the vendor's paid wallet) plus the wallets list.
 */
function invalidateProject(qc: ReturnType<typeof useQueryClient>, projectId: number) {
  void qc.invalidateQueries({ queryKey: keys.project(projectId) });
  void qc.invalidateQueries({ queryKey: keys.projects });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectPayload) =>
      api<ProjectCreatedData>('/projects', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      // A dedicated escrow wallet was created.
      void qc.invalidateQueries({ queryKey: keys.wallets });
    },
  });
}

export function useCancelProject(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ProjectMutatedData>(`/projects/${projectId}/cancel`, { method: 'POST' }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useAssignVendor(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignVendorPayload) =>
      api<ProjectMutatedData>(`/projects/${projectId}/vendor`, { method: 'POST', body: input }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useRemoveVendor(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ProjectMutatedData>(`/projects/${projectId}/vendor`, { method: 'DELETE' }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useAddMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMilestonePayload) =>
      api<MilestoneCreatedData>(`/projects/${projectId}/milestones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useRemoveMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: number) =>
      api(`/milestones/${milestoneId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useSubmitMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { milestoneId: number; proof: string }) =>
      api<MilestoneData>(`/milestones/${input.milestoneId}/submit`, {
        method: 'POST',
        body: { proof: input.proof },
      }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useApproveMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: number) =>
      api<MilestoneApprovedData>(`/milestones/${milestoneId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      invalidateProject(qc, projectId);
      // Escrow → vendor: balances moved, refresh every wallet query + the list.
      void qc.invalidateQueries({ queryKey: keys.wallets });
    },
  });
}

export function useRejectMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { milestoneId: number; note?: string }) =>
      api<MilestoneData>(`/milestones/${input.milestoneId}/reject`, {
        method: 'POST',
        body: { note: input.note },
      }),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

// ---------- KYC & compliance (Milestone 6 — progressive identity tiers) ----------

export function useKyc() {
  return useQuery({
    queryKey: keys.kyc,
    queryFn: () => api<KycState>('/kyc'),
  });
}

/**
 * Submitting a tier for review changes the KYC state and the dashboard's KYC
 * snapshot (status flips to "pending", can_upgrade to false), so invalidate both.
 */
export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitKycPayload) =>
      api<KycSubmitData>('/kyc/submit', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.kyc });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}
