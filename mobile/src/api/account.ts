import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import { useAuth } from '../store/auth';
import { appendFile, type PickedFile } from '../lib/upload';
import type { User } from './types';

/**
 * The client sheet "Settings, log in, system states" (ME-02…24, SYS-02/03):
 * security, limits, settings, two-step, devices, logins, freezing and
 * closing, personal details, own bank accounts, support chat, legal and the
 * app's status. Amounts are naira strings.
 */

export const accountKeys = {
  security: ['security'] as const,
  limits: ['limits'] as const,
  devices: ['security', 'devices'] as const,
  logins: ['security', 'logins'] as const,
  details: ['profile', 'details'] as const,
  banks: ['bank-accounts'] as const,
  close: ['account', 'close'] as const,
  chat: ['support', 'chat'] as const,
  legal: ['legal'] as const,
  status: ['app', 'status'] as const,
};

export interface AccountSettings {
  face_id: boolean;
  app_lock: boolean;
  lock_after: 0 | 1 | 5 | 15;
  pin_over: string;
  hide_balances: boolean;
  steward_reads_transactions: boolean;
  product_research: boolean;
  partner_offers: boolean;
  appearance: 'light' | 'dark' | 'system';
  bigger_text: boolean;
  reduce_motion: boolean;
  steward_matches_language: boolean;
}

export interface SecuritySummary {
  score: { done: number; total: number; label: string; next: string | null; checks: Record<string, boolean> };
  pin_changed_at: string | null;
  settings: AccountSettings;
  two_factor: { on: boolean; method: 'authenticator' | 'sms' | 'email' | null };
  devices: number;
  last_login_at: string | null;
  tier: number;
  daily_limit: string;
  frozen_at: string | null;
  pin_reset_hold_until: string | null;
  pin_locked_until: string | null;
}

export interface TierRow {
  tier: number;
  needs: string;
  daily: string;
  max_balance: string | null;
  max_wallets: number;
  shared_wallets: boolean;
}

export interface LimitsSummary {
  tier: number;
  daily: string;
  left_today: string;
  sent_today: string;
  single: string;
  max_balance: string | null;
  main_balance: string;
  max_wallets: number;
  wallets: number;
  shared_wallets: boolean;
  next: { tier: number; daily: string; max_balance: string | null; needs: string } | null;
  tiers: TierRow[];
  pending_tier: number | null;
  plan: 'free' | 'pro';
}

export interface DeviceRow {
  id: number;
  name: string;
  platform: string | null;
  this_device: boolean;
  last_active_at: string | null;
  trusted_at: string | null;
  send_after: string | null;
}

export interface LoginRow {
  id: number;
  at: string;
  device: string;
  platform: string | null;
  status: 'ok' | 'failed' | 'blocked';
  reason: string | null;
  new_device: boolean;
  ip: string | null;
}

export interface CloseItem {
  key: 'main' | 'wallets' | 'joint' | 'subscription';
  title: string;
  value: string;
  sub: string;
  done: boolean;
}

export interface ChatMessage {
  id: number;
  from: 'user' | 'support';
  name: string | null;
  body: string;
  reference: string | null;
  created_at: string | null;
}

export interface LinkedBank {
  id: number;
  bank_name: string;
  bank_code: string;
  account_number: string;
  masked: string;
  account_name: string;
  nickname: string;
  default: boolean;
}

export interface LegalDocument {
  key: string;
  title: string;
  sub: string;
  updated: string | null;
  body?: string;
}

export interface AppStatus {
  min_version: string;
  latest_version: string;
  update_required: boolean;
  maintenance: { on: boolean; until: string | null; message: string | null };
  support_phone: string | null;
  server_time: string;
}

function useRefreshMe() {
  const setUser = useAuth((s) => s.setUser);
  return (user?: User) => {
    if (user) void setUser(user);
  };
}

export function useSecurity() {
  return useQuery({ queryKey: accountKeys.security, queryFn: () => api<SecuritySummary>('/security') });
}

export function useLimits() {
  return useQuery({ queryKey: accountKeys.limits, queryFn: () => api<LimitsSummary>('/limits') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Omit<AccountSettings, 'pin_over'>> & { pin_over?: string | null }) =>
      api<{ settings: AccountSettings }>('/settings', { method: 'PUT', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.security }),
  });
}

/** ME-06: current PIN, new PIN, and the two-step code when it's on. */
export function useChangePinSecure() {
  const qc = useQueryClient();
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: (input: { current_pin: string; new_pin: string; two_factor_code?: string }) =>
      api<{ user: User }>('/security/pin', { method: 'POST', body: input }),
    onSuccess: (d) => {
      refresh(d.user);
      void qc.invalidateQueries({ queryKey: accountKeys.security });
    },
  });
}

export function useStartTwoStep() {
  return useMutation({
    mutationFn: (method: 'authenticator' | 'sms' | 'email') =>
      api<{ method: string; secret?: string; otpauth?: string; sent_to?: string }>('/security/two-factor', { method: 'POST', body: { method } }),
  });
}

export function useConfirmTwoStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<{ method: string }>('/security/two-factor/confirm', { method: 'POST', body: { code } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.security }),
  });
}

export function useDisableTwoStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => api('/security/two-factor', { method: 'DELETE', body: { pin } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.security }),
  });
}

export function useSecurityDevices() {
  return useQuery({ queryKey: accountKeys.devices, queryFn: () => api<{ devices: DeviceRow[] }>('/security/devices'), select: (d) => d.devices });
}

export function useLogoutDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; forget: boolean }) =>
      api<{ ended_sessions: number }>(`/security/devices/${input.id}/logout`, { method: 'POST', body: { forget: input.forget } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.devices });
      void qc.invalidateQueries({ queryKey: accountKeys.security });
    },
  });
}

export function useLogoutOthers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ended_sessions: number }>('/security/devices/logout-others', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.devices }),
  });
}

export function useLoginHistory() {
  return useQuery({
    queryKey: accountKeys.logins,
    queryFn: () => api<{ logins: LoginRow[]; warning: { at: string; reason: string | null; device: string } | null }>('/security/logins'),
  });
}

export function useFreezeAccount() {
  const qc = useQueryClient();
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: () => api<{ user: User }>('/account/freeze', { method: 'POST' }),
    onSuccess: (d) => {
      refresh(d.user);
      void qc.invalidateQueries();
    },
  });
}

export function useUnfreezeAccount() {
  const qc = useQueryClient();
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: async (input: { pin: string; selfie: PickedFile }) => {
      const form = new FormData();
      form.append('pin', input.pin);
      await appendFile(form, 'selfie', input.selfie, 'selfie');
      return api<{ user: User }>('/account/unfreeze', { method: 'POST', body: form });
    },
    onSuccess: (d) => {
      refresh(d.user);
      void qc.invalidateQueries();
    },
  });
}

export function useCloseChecklist() {
  return useQuery({ queryKey: accountKeys.close, queryFn: () => api<{ ready: boolean; items: CloseItem[] }>('/account/close') });
}

export function useCloseAccount() {
  return useMutation({ mutationFn: (pin: string) => api('/account/close', { method: 'POST', body: { pin } }) });
}

export function useExportData() {
  return useMutation({ mutationFn: () => api<{ sent_to: string }>('/account/export', { method: 'POST' }) });
}

export function usePersonalDetails() {
  return useQuery({
    queryKey: accountKeys.details,
    queryFn: () =>
      api<{ date_of_birth: string | null; bvn: string | null; nin: string | null; bvn_pending?: boolean; nin_pending?: boolean; address: string | null; city: string | null; state: string | null; name_locked: boolean }>('/profile/details'),
  });
}

export function useUpdateDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { address: string | null; city: string | null; state: string | null }) => api('/profile/details', { method: 'PUT', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.details }),
  });
}

export function useStartEmailChange() {
  return useMutation({ mutationFn: (email: string) => api<{ sent_to: string; debug_otp?: string }>('/profile/email', { method: 'POST', body: { email } }) });
}

export function useConfirmEmailChange() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: (input: { email: string; code: string }) => api<{ user: User }>('/profile/email/confirm', { method: 'POST', body: input }),
    onSuccess: (d) => refresh(d.user),
  });
}

export function useStartPhoneChange() {
  return useMutation({ mutationFn: (phone: string) => api<{ sent_to: string; debug_otp?: string }>('/profile/phone', { method: 'POST', body: { phone } }) });
}

export function useConfirmPhoneChange() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: async (input: { phone: string; code: string; selfie: PickedFile }) => {
      const form = new FormData();
      form.append('phone', input.phone);
      form.append('code', input.code);
      await appendFile(form, 'selfie', input.selfie, 'selfie');
      return api<{ user: User }>('/profile/phone/confirm', { method: 'POST', body: form });
    },
    onSuccess: (d) => refresh(d.user),
  });
}

export function useLinkedBanks() {
  return useQuery({ queryKey: accountKeys.banks, queryFn: () => api<{ accounts: LinkedBank[] }>('/bank-accounts'), select: (d) => d.accounts });
}

export function useLinkBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bank_code: string; account_number: string; nickname?: string }) => api<{ id: number }>('/bank-accounts', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.banks }),
  });
}

export function useBankActions() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: accountKeys.banks });
  return {
    makeDefault: useMutation({ mutationFn: (id: number) => api(`/bank-accounts/${id}/default`, { method: 'PATCH' }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => api(`/bank-accounts/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}

export function useSupportChat() {
  return useQuery({
    queryKey: accountKeys.chat,
    queryFn: () => api<{ request: { id: number; subject: string; status: string } | null; messages: ChatMessage[]; replies_in: string; phone: string | null }>('/support/chat'),
    refetchInterval: 15000,
  });
}

export function useSendSupport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; reference?: string; category?: 'fraud' | 'other' }) => api<{ message: ChatMessage }>('/support/chat', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: accountKeys.chat }),
  });
}

export function useLegal() {
  return useQuery({ queryKey: accountKeys.legal, queryFn: () => api<{ documents: LegalDocument[]; company: string }>('/legal') });
}

export function useLegalDocument(key: string) {
  return useQuery({ queryKey: [...accountKeys.legal, key] as const, queryFn: () => api<LegalDocument>(`/legal/${key}`) });
}

export function useAppStatus(version: string) {
  return useQuery({ queryKey: [...accountKeys.status, version] as const, queryFn: () => api<AppStatus>(`/app/status?version=${encodeURIComponent(version)}`), staleTime: 60_000 });
}

export { keys };

/** Check the PIN (ME-07 Face ID enrolment, SYS-05 unlock). */
export function useCheckPin() {
  return useMutation({ mutationFn: (input: { pin: string }) => api('/profile/verify-pin', { method: 'POST', body: input }) });
}

/** KYC-02/03/05/07/08: a tier's details and photos, sent for review. */
export function useSubmitTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target_tier: number; fields: Record<string, string>; files: Record<string, PickedFile | null> }) => {
      const form = new FormData();
      form.append('target_tier', String(input.target_tier));
      for (const [k, v] of Object.entries(input.fields)) form.append(k, v);
      for (const [k, f] of Object.entries(input.files)) if (f) await appendFile(form, k, f, k);
      return api<{ submission: { id: number; target_tier: number; status: string } }>('/kyc/submit', { method: 'POST', body: form });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.kyc });
      void qc.invalidateQueries({ queryKey: accountKeys.limits });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}
