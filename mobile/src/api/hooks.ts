import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { useAuth } from '../store/auth';
import { getDeviceMeta } from '../lib/device';
import type {
  SavingsInsights,
  AddMilestonePayload,
  ApplyLoanPayload,
  ApprovalDetailData,
  ApprovalsData,
  AssignVendorPayload,
  AssistantChatData,
  AssistantChatPayload,
  AuthSessionData,
  BanksData,
  CreateInvitationPayload,
  ApplyReferralPayload,
  AuditLogPageData,
  AutomationMutatedData,
  AutomationRunData,
  AutomationsData,
  HomeData,
  DisputeCreatedData,
  DisputesPageData,
  EmergencyDetailData,
  EmergencyDocumentType,
  EmergencyRequest,
  EmergencyRulesPayload,
  EmergencyWithdrawData,
  SavingsDetailData,
  SavingsFrequency,
  WalletDraft,
  WalletDraftData,
  WalletDraftsData,
  FamilyMemberDetailData,
  PendingApprovalData,
  RaiseDisputePayload,
  MyVendorProfileData,
  ReferralData,
  SpendRequestPayload,
  UpsertVendorPayload,
  VendorDetailData,
  VendorsPageData,
  CreateAutomationPayload,
  CreateProjectPayload,
  CreateSyncPayload,
  CreateWalletPayload,
  DashboardData,
  DevicesData,
  FamilyData,
  SetAccessSchedulePayload,
  UpdateAutomationPayload,
  FundingDetailsData,
  InvitationAcceptData,
  InvitationCreatedData,
  UsersSearchData,
  InvitationsData,
  KycState,
  KycSubmitData,
  LoanCancelData,
  LoanDetailData,
  LoanEligibility,
  LoanRepayResultData,
  LoansData,
  MeData,
  MemberUpdatedData,
  MilestoneApprovedData,
  MilestoneCreatedData,
  MilestoneData,
  NotificationReadData,
  NotificationsPageData,
  ProjectCreatedData,
  ProjectDetailData,
  ProjectMutatedData,
  ProjectsData,
  RepayLoanPayload,
  RespondApprovalPayload,
  SubmitKycPayload,
  SyncData,
  SyncMutatedData,
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
  OtpChannel,
  PhoneRegisterPayload,
  PhoneStartData,
  PhoneVerifyData,
  PinForgotData,
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
  // ---- Family Hub & Spousal Sync ----
  family: ['family'] as const,
  sync: ['sync'] as const,
  // ---- Automation & Audit ----
  automations: ['automations'] as const,
  home: ['home'] as const,
  automation: (id: number) => ['automations', id] as const,
  walletAuditLog: (id: number) => ['wallets', id, 'audit-log'] as const,
  // ---- Emergency wallets ----
  emergency: (id: number) => ['wallets', id, 'emergency'] as const,
  // ---- Savings goals + drafts ----
  savings: (id: number) => ['wallets', id, 'savings'] as const,
  walletDrafts: ['wallet-drafts'] as const,
  // ---- Disputes ----
  disputes: ['disputes'] as const,
  // ---- Referrals ----
  referrals: ['referrals'] as const,
  // ---- Vendors ----
  usersSearch: (q: string) => ['users', 'search', q] as const,
  vendors: (q: string, category: string) => ['vendors', q, category] as const,
  vendor: (id: number) => ['vendors', 'detail', id] as const,
  myVendorProfile: ['vendors', 'me'] as const,
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

export function useFundingDetails(id: number, enabled = true) {
  return useQuery({
    queryKey: keys.funding(id),
    queryFn: () => api<FundingDetailsData>(`/wallets/${id}/funding-details`),
    enabled,
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

export function usePhoneStart() {
  return useMutation({
    mutationFn: (input: { phone: string; channel: OtpChannel }) =>
      api<PhoneStartData>('/auth/phone/start', { method: 'POST', body: input }),
  });
}

export function usePhoneVerify() {
  return useMutation({
    mutationFn: (input: { phone: string; code: string }) =>
      api<PhoneVerifyData>('/auth/phone/verify', { method: 'POST', body: input }),
  });
}

/** Creates the account (phone already verified) and returns the first session. */
export function usePhoneRegister() {
  return useMutation({
    mutationFn: async (input: PhoneRegisterPayload) => {
      const device = await getDeviceMeta();
      return api<AuthSessionData>('/auth/phone/register', { method: 'POST', body: { ...input, ...device } });
    },
  });
}

export function usePinLogin() {
  return useMutation({
    mutationFn: async (input: { phone_token: string; pin: string }) => {
      const device = await getDeviceMeta();
      return api<AuthSessionData>('/auth/phone/login', { method: 'POST', body: { ...input, ...device } });
    },
  });
}

export function usePinForgot() {
  return useMutation({
    mutationFn: (input: { phone_token: string }) =>
      api<PinForgotData>('/auth/pin/forgot', { method: 'POST', body: input }),
  });
}

export function usePinReset() {
  return useMutation({
    mutationFn: async (input: { phone_token: string; code: string; pin: string }) => {
      const device = await getDeviceMeta();
      return api<AuthSessionData>('/auth/pin/reset', { method: 'POST', body: { ...input, ...device } });
    },
  });
}

/** ONB-09 answers; the server returns the updated user. */
export function useSaveOnboarding() {
  return useMutation({
    mutationFn: (input: { purposes: string[] }) =>
      api<MeData>('/profile/onboarding', { method: 'PUT', body: input }),
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
      void qc.invalidateQueries({ queryKey: keys.home });
      // The server deletes the draft a wallet was created from.
      void qc.invalidateQueries({ queryKey: keys.walletDrafts });
      void qc.invalidateQueries({ queryKey: keys.automations });
      // People invited during setup show on the Family tab.
      void qc.invalidateQueries({ queryKey: keys.family });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/**
 * AI Assistant chat. Sends the new message plus prior turns (text only — never a
 * PIN or secret) and returns the reply and an optional structured UI action.
 */
export function useAssistantChat() {
  return useMutation({
    mutationFn: (input: AssistantChatPayload) =>
      api<AssistantChatData>('/assistant/chat', { method: 'POST', body: input }),
  });
}

export function useVerifyAccount() {
  return useMutation({
    mutationFn: (input: { account_number: string; bank_code: string }) =>
      api<VerifyAccountData>('/banks/verify-account', { method: 'POST', body: input }),
  });
}

// ---------- Profile mutations ----------

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      first_name?: string;
      last_name?: string;
      username?: string;
      avatar_url?: string | null;
      language?: 'en' | 'pcm';
    }) => api<MeData>('/profile', { method: 'PUT', body: input }),
    onSuccess: async (d) => {
      void qc.invalidateQueries({ queryKey: keys.me });
      // The More tab reads the auth store's user — keep it (and SecureStore) fresh.
      const { token, setSession } = useAuth.getState();
      if (token) await setSession(d.user, token);
    },
  });
}

/** Upload a profile picture (multipart) and refresh the stored user. */
export function useUpdateAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
      const ext = asset.mimeType?.split('/')[1] || asset.uri.split('.').pop() || 'jpg';
      const form = new FormData();
      // React Native's FormData file part: { uri, name, type }.
      form.append('avatar', {
        uri: asset.uri,
        name: asset.fileName || `avatar.${ext}`,
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      return api<MeData>('/profile/avatar', { method: 'POST', body: form });
    },
    onSuccess: async (d) => {
      void qc.invalidateQueries({ queryKey: keys.me });
      const { token, setSession } = useAuth.getState();
      if (token) await setSession(d.user, token);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      api('/profile/change-password', { method: 'POST', body: input }),
  });
}

export function useChangePin() {
  return useMutation({
    mutationFn: (input: { current_pin?: string; new_pin: string; password?: string }) =>
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.family });
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
      void qc.invalidateQueries({ queryKey: keys.family });
    },
  });
}

// ---------- Invitations ----------

export function useWalletInvitations(walletId: number, enabled = true) {
  return useQuery({
    queryKey: keys.walletInvitations(walletId),
    queryFn: () => api<InvitationsData>(`/wallets/${walletId}/invitations`),
    select: (d) => d.invitations,
    enabled,
  });
}

/** Search registered users by @username/name to invite them in-app. */
export function useUserSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: keys.usersSearch(q),
    queryFn: () => api<UsersSearchData>(`/users/search?q=${encodeURIComponent(q)}`),
    select: (d) => d.users,
    enabled: q.replace(/^@/, '').length >= 2,
    staleTime: 30_000,
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
      void qc.invalidateQueries({ queryKey: keys.family });
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
      void qc.invalidateQueries({ queryKey: keys.family });
    },
  });
}

/** Family tab "Resend": a fresh week and the invite message again. */
export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { walletId: number; invitationId: number }) =>
      api(`/wallets/${input.walletId}/invitations/${input.invitationId}/resend`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.family }),
  });
}

export function useMyInvitations() {
  return useQuery({
    queryKey: keys.myInvitations,
    queryFn: () => api<InvitationsData>('/invitations'),
    select: (d) => d.invitations,
  });
}

/** Savings wallets: start your own auto-save as you join (all optional). */
export interface AcceptInvitationOptions {
  source_wallet_id?: number;
  amount?: string;
  frequency?: SavingsFrequency;
  day_of_week?: number;
  day_of_month?: number;
}

export function useAcceptInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: number | { invitationId: number; options: AcceptInvitationOptions }) =>
      typeof input === 'number'
        ? api<InvitationAcceptData>(`/invitations/${input}/accept`, { method: 'POST' })
        : api<InvitationAcceptData>(`/invitations/${input.invitationId}/accept`, { method: 'POST', body: input.options }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.myInvitations });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.home });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
      void qc.invalidateQueries({ queryKey: keys.family });
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
      void qc.invalidateQueries({ queryKey: keys.family });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
      void qc.invalidateQueries({ queryKey: keys.home });
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
  void qc.invalidateQueries({ queryKey: keys.home });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectPayload) =>
      api<ProjectCreatedData>('/projects', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.home });
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

/** Upload image/video evidence (multipart) to a milestone. */
export function useUploadMilestoneEvidence(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      milestoneId: number;
      asset: { uri: string; fileName?: string | null; mimeType?: string | null };
    }) => {
      const { asset } = input;
      const ext = asset.mimeType?.split('/')[1] || asset.uri.split('.').pop() || 'jpg';
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || `evidence.${ext}`,
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      return api<MilestoneData>(`/milestones/${input.milestoneId}/evidence`, {
        method: 'POST',
        body: form,
      });
    },
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
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

// ---------- Family Hub ----------

/** Aggregated people, pending invitations and stats across the user's wallets. */
export function useFamily() {
  return useQuery({
    queryKey: keys.family,
    queryFn: () => api<FamilyData>('/family'),
  });
}

// ---------- Spousal Sync (two-person financial-transparency link) ----------

export function useSync() {
  return useQuery({
    queryKey: keys.sync,
    queryFn: () => api<SyncData>('/sync'),
  });
}

export function useCreateSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSyncPayload) =>
      api<SyncMutatedData>('/sync', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.sync }),
  });
}

/** Accept or decline a pending sync request addressed to the current user. */
export function useRespondSync(syncId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accept: boolean) =>
      api<SyncMutatedData>(`/sync/${syncId}/respond`, { method: 'POST', body: { accept } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.sync });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

export function useUpdateSyncTransparency(syncId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { transparency: string; wallet_ids?: number[] }) =>
      api<SyncMutatedData>(`/sync/${syncId}`, { method: 'PATCH', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.sync }),
  });
}

/** Pause / resume / end a sync — each hits its own endpoint but invalidates the same query. */
export function useSyncLifecycle(syncId: number) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: keys.sync });
    void qc.invalidateQueries({ queryKey: keys.notifications });
  };
  const pause = useMutation({
    mutationFn: () => api<SyncMutatedData>(`/sync/${syncId}/pause`, { method: 'POST' }),
    onSuccess: done,
  });
  const resume = useMutation({
    mutationFn: () => api<SyncMutatedData>(`/sync/${syncId}/resume`, { method: 'POST' }),
    onSuccess: done,
  });
  const end = useMutation({
    mutationFn: () => api<SyncMutatedData>(`/sync/${syncId}/end`, { method: 'POST' }),
    onSuccess: done,
  });
  return { pause, resume, end };
}

// ---------- Automation / Smart Rules ----------

export function useAutomations() {
  return useQuery({
    queryKey: keys.automations,
    queryFn: () => api<AutomationsData>('/automations'),
    select: (d) => d.automations,
  });
}

/** Same request as useAutomations; the wallets whose spends need a yes. */
export function useApprovalRules() {
  return useQuery({
    queryKey: keys.automations,
    queryFn: () => api<AutomationsData>('/automations'),
    select: (d) => d.approval_rules ?? [],
  });
}

/** Home tab + Treasury header in one call. */
export function useHome() {
  return useQuery({
    queryKey: keys.home,
    queryFn: () => api<HomeData>('/home'),
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationPayload) =>
      api<AutomationMutatedData>('/automations', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.automations });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

export function useUpdateAutomation(ruleId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAutomationPayload) =>
      api<AutomationMutatedData>(`/automations/${ruleId}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.automations });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) => api(`/automations/${ruleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.automations });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

/** Manually run a rule now ("Run now"). Moves money → refresh wallets/dashboard too. */
export function useRunAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) =>
      api<AutomationRunData>(`/automations/${ruleId}/run`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.automations });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

// ---------- Wallet Audit Log ----------

export function useWalletAuditLog(walletId: number) {
  return useInfiniteQuery({
    queryKey: keys.walletAuditLog(walletId),
    queryFn: ({ pageParam }) =>
      api<AuditLogPageData>(`/wallets/${walletId}/audit-log?page=${pageParam}&per_page=20`),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined,
  });
}

// ---------- Wallet Lock / Scheduled Access ----------

/** Freeze / unfreeze / set-schedule for a wallet — all invalidate the wallet + list. */
export function useWalletLock(walletId: number) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: keys.walletAuditLog(walletId) });
  };
  const freeze = useMutation({
    mutationFn: () => api<WalletUpdatedData>(`/wallets/${walletId}/freeze`, { method: 'POST' }),
    onSuccess: done,
  });
  const unfreeze = useMutation({
    mutationFn: () => api<WalletUpdatedData>(`/wallets/${walletId}/unfreeze`, { method: 'POST' }),
    onSuccess: done,
  });
  const setSchedule = useMutation({
    mutationFn: (input: SetAccessSchedulePayload | null) =>
      api<WalletUpdatedData>(`/wallets/${walletId}/access-schedule`, {
        method: 'PATCH',
        body: input ?? {},
      }),
    onSuccess: done,
  });
  return { freeze, unfreeze, setSchedule };
}

/** Archive (reversible), restore, or permanently delete a wallet. */
export function useWalletDeletion(walletId: number) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    void qc.invalidateQueries({ queryKey: keys.home });
    void qc.invalidateQueries({ queryKey: keys.family });
  };
  const archive = useMutation({
    mutationFn: () => api<WalletUpdatedData>(`/wallets/${walletId}/archive`, { method: 'POST' }),
    onSuccess: done,
  });
  const unarchive = useMutation({
    mutationFn: () => api<WalletUpdatedData>(`/wallets/${walletId}/unarchive`, { method: 'POST' }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/wallets/${walletId}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  return { archive, unarchive, remove };
}

// ---------- Dispute Center ----------

export function useDisputes() {
  return useInfiniteQuery({
    queryKey: keys.disputes,
    queryFn: ({ pageParam }) =>
      api<DisputesPageData>(`/disputes?page=${pageParam}&per_page=20`),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined,
  });
}

export function useRaiseDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RaiseDisputePayload) =>
      api<DisputeCreatedData>('/disputes', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.disputes });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

// ---------- Referral & Rewards ----------

export function useReferrals() {
  return useQuery({
    queryKey: keys.referrals,
    queryFn: () => api<ReferralData>('/referrals'),
  });
}

/** Apply someone else's referral code post-signup. */
export function useApplyReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyReferralPayload) =>
      api<ReferralData>('/referrals/apply', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.referrals }),
  });
}

// ---------- Family member detail (Child Dashboard / Overview) ----------

export function useFamilyMember(memberId: number) {
  return useQuery({
    queryKey: ['family', 'member', memberId] as const,
    queryFn: () => api<FamilyMemberDetailData>(`/family/${memberId}`),
  });
}

// ---------- Vendor Discovery ----------

/** Paginated vendor directory with search + category filter. */
export function useVendors(q: string, category: string) {
  return useInfiniteQuery({
    queryKey: keys.vendors(q, category),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), per_page: '20' });
      if (q.trim()) params.set('q', q.trim());
      if (category && category !== 'all') params.set('category', category);
      return api<VendorsPageData>(`/vendors?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined,
  });
}

export function useVendor(profileId: number) {
  return useQuery({
    queryKey: keys.vendor(profileId),
    queryFn: () => api<VendorDetailData>(`/vendors/${profileId}`),
    select: (d) => d.vendor,
  });
}

export function useMyVendorProfile() {
  return useQuery({
    queryKey: keys.myVendorProfile,
    queryFn: () => api<MyVendorProfileData>('/vendors/me'),
  });
}

/** Create or update the user's own vendor profile ("Become a vendor"). */
export function useUpsertVendorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertVendorPayload) =>
      api<MyVendorProfileData>('/vendors/me', { method: 'PUT', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.myVendorProfile });
      void qc.invalidateQueries({ queryKey: ['vendors'] });
    },
  });
}

// ---------- Spend Requests (member requests a spend → owner approves → executes) ----------

export function useSpendRequest(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SpendRequestPayload) =>
      api<PendingApprovalData>(`/wallets/${walletId}/spend-requests`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      void qc.invalidateQueries({ queryKey: keys.unreadCount });
    },
  });
}

// ---------- Emergency wallets (unlock / re-lock / recipient payouts) ----------

export function useEmergency(walletId: number) {
  return useQuery({
    queryKey: keys.emergency(walletId),
    queryFn: () => api<EmergencyDetailData>(`/wallets/${walletId}/emergency`),
    select: (d) => d.emergency,
  });
}

/** Every emergency action changes the lock and/or balances — refresh it all. */
function invalidateEmergency(qc: ReturnType<typeof useQueryClient>, walletId: number) {
  void qc.invalidateQueries({ queryKey: keys.emergency(walletId) });
  void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
  void qc.invalidateQueries({ queryKey: keys.wallets });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
  void qc.invalidateQueries({ queryKey: keys.home });
  void qc.invalidateQueries({ queryKey: keys.notifications });
  void qc.invalidateQueries({ queryKey: keys.unreadCount });
}

export function useEmergencyActions(walletId: number) {
  const qc = useQueryClient();
  const onSuccess = () => invalidateEmergency(qc, walletId);
  const post = (path: string, body?: unknown) =>
    api<EmergencyDetailData>(path, { method: 'POST', body });

  return {
    /** Owner + the custom PIN set during setup, with a reason. */
    unlock: useMutation({
      mutationFn: (input: { pin: string; reason?: string }) => post(`/wallets/${walletId}/emergency/unlock`, input),
      onSuccess,
    }),
    /** Owner changes rules/beneficiaries/custom PIN — guarded by the transaction PIN. */
    updateRules: useMutation({
      mutationFn: (input: Omit<EmergencyRulesPayload, 'purpose'> & { purpose?: string; pin: string }) =>
        api<EmergencyDetailData>(`/wallets/${walletId}/emergency/rules`, { method: 'PUT', body: input }),
      onSuccess,
    }),
    /** Owner + transaction PIN while the balance is above the override threshold. */
    override: useMutation({
      mutationFn: (pin: string) => post(`/wallets/${walletId}/emergency/override`, { pin }),
      onSuccess,
    }),
    lock: useMutation({
      mutationFn: () => post(`/wallets/${walletId}/emergency/lock`),
      onSuccess,
    }),
    requestDual: useMutation({
      mutationFn: (note?: string) =>
        api<{ request: EmergencyRequest }>(`/wallets/${walletId}/emergency/requests`, {
          method: 'POST',
          body: { method: 'dual_approval', note },
        }),
      onSuccess,
    }),
    submitDocument: useMutation({
      mutationFn: (input: {
        documentType: EmergencyDocumentType;
        note?: string;
        asset: { uri: string; fileName?: string | null; mimeType?: string | null };
      }) => {
        const { asset } = input;
        const ext = asset.mimeType?.split('/')[1] || asset.uri.split('.').pop() || 'jpg';
        const form = new FormData();
        form.append('method', 'document');
        form.append('document_type', input.documentType);
        if (input.note) form.append('note', input.note);
        form.append('file', {
          uri: asset.uri,
          name: asset.fileName || `document.${ext}`,
          type: asset.mimeType || 'image/jpeg',
        } as unknown as Blob);
        return api<{ request: EmergencyRequest }>(`/wallets/${walletId}/emergency/requests`, {
          method: 'POST',
          body: form,
        });
      },
      onSuccess,
    }),
    decide: useMutation({
      mutationFn: (input: { requestId: number; action: 'approve' | 'reject' | 'cancel'; note?: string }) =>
        post(`/emergency-requests/${input.requestId}/${input.action}`, input.note ? { note: input.note } : undefined),
      onSuccess,
    }),
    /** EMG-04: a keyholder releases up to the limit at once, with a photo of the bill. */
    fastRelease: useMutation({
      mutationFn: (input: { amount: string; pin: string; note?: string; asset: { uri: string; fileName?: string | null; mimeType?: string | null } }) => {
        const { asset } = input;
        const ext = asset.mimeType?.split('/')[1] || asset.uri.split('.').pop() || 'jpg';
        const form = new FormData();
        form.append('amount', input.amount);
        form.append('pin', input.pin);
        if (input.note) form.append('note', input.note);
        form.append('proof', { uri: asset.uri, name: asset.fileName || `proof.${ext}`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
        return api<EmergencyWithdrawData>(`/wallets/${walletId}/emergency/fast-release`, { method: 'POST', body: form });
      },
      onSuccess,
    }),
    /** Recipient → their own main wallet, within limit and access delay. */
    withdraw: useMutation({
      mutationFn: (input: { amount: string; pin: string }) =>
        api<EmergencyWithdrawData>(`/wallets/${walletId}/emergency/withdraw`, { method: 'POST', body: input }),
      onSuccess,
    }),
  };
}

// ---------- Wallet drafts (auto-saved setup, resumable) ----------

export function useWalletDrafts() {
  return useQuery({
    queryKey: keys.walletDrafts,
    queryFn: () => api<WalletDraftsData>('/wallet-drafts'),
    select: (d) => d.drafts,
  });
}

export interface SaveDraftInput {
  /** null = create a new draft. */
  id: number | null;
  type: WalletDraft['type'];
  name: string | null;
  step: number;
  total_steps: number;
  data: Record<string, unknown>;
}

/** Upsert: creates the draft on first save, updates it afterwards. */
export function useSaveWalletDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: SaveDraftInput) =>
      id
        ? api<WalletDraftData>(`/wallet-drafts/${id}`, { method: 'PUT', body })
        : api<WalletDraftData>('/wallet-drafts', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.walletDrafts }),
  });
}

export function useDeleteWalletDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/wallet-drafts/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.walletDrafts }),
  });
}

// ---------- Savings goals (plan, milestones, my auto-save) ----------

/** SAV-03: the usual salary and round-up estimates from the last 3 months of Main. */
export function useSavingsInsights(enabled = true) {
  return useQuery({
    queryKey: ['savings', 'insights'] as const,
    queryFn: () => api<SavingsInsights>('/savings/insights'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSavings(walletId: number) {
  return useQuery({
    queryKey: keys.savings(walletId),
    queryFn: () => api<SavingsDetailData>(`/wallets/${walletId}/savings`),
    select: (d) => d.savings,
  });
}

export interface SavingsTermsInput {
  amount?: string;
  frequency?: SavingsFrequency;
  day_of_week?: number;
  day_of_month?: number;
}

export function useSavingsActions(walletId: number) {
  const qc = useQueryClient();
  const onSuccess = () => {
    void qc.invalidateQueries({ queryKey: keys.savings(walletId) });
    void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
    void qc.invalidateQueries({ queryKey: keys.wallets });
    void qc.invalidateQueries({ queryKey: keys.automations });
  };
  const send = (method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    api<SavingsDetailData>(`/wallets/${walletId}/savings${path}`, { method, body });

  return {
    /** Owner: plan for everyone + target. */
    updatePlan: useMutation({
      mutationFn: (input: SavingsTermsInput & {
        auto_save?: boolean;
        allow_contributor_edit?: boolean;
        target_amount?: string | null;
        target_date?: string | null;
      }) => send('PATCH', '', input),
      onSuccess,
    }),
    startAutoSave: useMutation({
      mutationFn: (input: SavingsTermsInput & { source_wallet_id: number }) => send('POST', '/contribution', input),
      onSuccess,
    }),
    updateAutoSave: useMutation({
      mutationFn: (input: SavingsTermsInput & { source_wallet_id?: number; enabled?: boolean }) =>
        send('PATCH', '/contribution', input),
      onSuccess,
    }),
    addMilestone: useMutation({
      mutationFn: (input: { title: string; amount: string; due_date?: string }) => send('POST', '/milestones', input),
      onSuccess,
    }),
    removeMilestone: useMutation({
      mutationFn: (milestoneId: number) => send('DELETE', `/milestones/${milestoneId}`),
      onSuccess,
    }),
  };
}
