import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import type { User, WalletInvitation, WalletType } from './types';

/** FAM-06 / INV-02 / INV-K1 / INV-A1: an invite as the invitee sees it. */
export interface InvitePreview {
  id: number;
  code: string | null;
  link: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  /** Which screen shows it. */
  kind: 'member' | 'keyholder' | 'accountant' | 'ajo' | 'joint' | 'project' | 'savings';
  /** null when not signed in; false when it went to another number (INV-04). */
  for_you: boolean | null;
  /** "+234 ••• ••• 0011" */
  sent_to: string;
  inviter: { id: number; name: string; first_name: string } | null;
  wallet: { id: number; name: string; type: WalletType };
  role: string;
  /** "Contributor", "Co-owner", "Keyholder", "Accountant" */
  role_label: string;
  keyholder: boolean;
  progress: { balance: string; target: string; percent: number; due: string | null } | null;
  can: string[];
  cannot: string[];
  /** INV-01 the inviter's note. */
  note: string | null;
  pledge: string | null;
  expires_at: string | null;
  /** "In 7 days" */
  expires_label: string | null;
  accountant: { wallets: string[]; access_until: string | null; access_until_label: string | null } | null;
  keyholder_info: { required: number; of: number; hours: number; needs_tier: number; your_tier: number | null } | null;
}

/** FAM-05: one invite you sent. */
export interface SentInvite {
  id: number;
  wallet_id: number;
  code: string | null;
  link: string | null;
  name: string;
  identifier: string;
  role_label: string;
  wallet_name: string | null;
  sent_at: string | null;
  status: InvitePreview['status'];
  /** "Sent" · "Opened" · "Verifying" · "Accepted" · "Expired" · "Declined" */
  chip: { label: string; tone: 'neutral' | 'brand' | 'warning' | 'success' | 'danger' };
  decline_reason: string | null;
}

export type SentTab = 'waiting' | 'accepted' | 'expired';

/** The invite behind a link (patriai.app/i/K7Q2). */
export function useInvite(code: string | null | undefined) {
  return useQuery({
    queryKey: ['invite', code],
    queryFn: () => api<{ invitation: InvitePreview }>(`/invites/${code}`),
    select: (d) => d.invitation,
    enabled: Boolean(code),
    retry: false,
  });
}

/** INV-04 "Ask Ngozi for a new invite". */
export function useAskForNewInvite() {
  return useMutation({ mutationFn: (code: string) => api(`/invites/${code}/ask-again`, { method: 'POST' }) });
}

export function useSentInvites(tab: SentTab) {
  return useQuery({
    queryKey: ['invites-sent', tab],
    queryFn: () => api<{ invites: SentInvite[] }>(`/invitations/sent?tab=${tab}`),
    select: (d) => d.invites,
  });
}

function useRefreshInvites() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['invites-sent'] });
    void qc.invalidateQueries({ queryKey: keys.family });
    void qc.invalidateQueries({ queryKey: keys.myInvitations });
    void qc.invalidateQueries({ queryKey: keys.home });
    void qc.invalidateQueries({ queryKey: keys.notifications });
  };
}

/** FAM-05 "Resend all". */
export function useResendAllInvites() {
  const refresh = useRefreshInvites();
  return useMutation({ mutationFn: () => api<{ sent: number }>('/invitations/resend-all', { method: 'POST' }), onSuccess: refresh });
}

/** INV-03 "Decline invite", with a reason and "Block future invites from Ngozi". */
export function useDeclineInvite() {
  const refresh = useRefreshInvites();
  return useMutation({
    mutationFn: (input: { id: number; reason?: string; block?: boolean }) =>
      api(`/invitations/${input.id}/decline`, { method: 'POST', body: { reason: input.reason, block: input.block } }),
    onSuccess: refresh,
  });
}

/** INV-A1: an accountant, read-only, for several wallets until a date. */
export function useAccountantInvite() {
  const refresh = useRefreshInvites();
  return useMutation({
    mutationFn: (input: { wallet_ids: number[]; invitee_user_id?: number; identifier?: string; access_until: string; message?: string }) =>
      api<{ invitation: WalletInvitation; link: string | null; share_message: string }>('/accountant-invites', { method: 'POST', body: input }),
    onSuccess: refresh,
  });
}

// ------------------------------------------------------------ the child's phone

/** INV-CH2 "Link my phone": the parents are asked first (INV-CH3). */
export function useChildLinkStart() {
  return useMutation({
    mutationFn: (input: { code: string; device_name?: string }) =>
      api<{ request_id: number; secret: string; child: string; parents: string[] }>('/children/link/start', { method: 'POST', body: input }),
  });
}

/** The child's phone waits for "Yes, link Kamsi's phone". */
export function useChildLinkStatus(requestId: number | null, secret: string | null) {
  return useQuery({
    queryKey: ['child-link-status', requestId],
    queryFn: () => api<{ status: 'pending' | 'approved' | 'denied' | 'used' | 'expired' }>(`/children/link/${requestId}?secret=${encodeURIComponent(secret ?? '')}`),
    select: (d) => d.status,
    enabled: Boolean(requestId && secret),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false),
  });
}

/** INV-CH4: the PIN, once a parent said yes. */
export function useFinishChildLink() {
  return useMutation({
    mutationFn: (input: { code: string; pin: string; device_name?: string; request_id: number; secret: string }) =>
      api<{ token: string; user: User; wallet_id: number }>('/children/link', { method: 'POST', body: input }),
  });
}

export interface ChildLinkRequestInfo {
  id: number;
  wallet_id: number;
  child: string;
  child_name: string;
  device: string | null;
  asked_at: string | null;
  status: 'pending' | 'approved' | 'denied' | 'used' | 'expired';
  will_see: string;
}

/** INV-CH3 on the parent's phone. */
export function useChildLinkRequest(id: number) {
  return useQuery({
    queryKey: ['child-link-request', id],
    queryFn: () => api<{ request: ChildLinkRequestInfo }>(`/child-link-requests/${id}`),
    select: (d) => d.request,
    enabled: id > 0,
  });
}

export function useDecideChildLink(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (approve: boolean) => api<{ status: string }>(`/child-link-requests/${id}/${approve ? 'approve' : 'deny'}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['child-link-request', id] });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}
