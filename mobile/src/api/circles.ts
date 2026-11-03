import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import type { CircleInfo, WalletType } from './types';

/** HOM-06 "Your circles": one row. An ajo group has no circle id; it opens the ajo. */
export interface CircleRow {
  id: number | null;
  ajo_wallet_id: number | null;
  name: string;
  kind: string;
  is_home: boolean;
  my_role: string;
  role_label: string;
  members: number;
  wallets: number;
  /** "Owner · 5 members · 6 wallets" */
  subtitle: string;
  /** Payments waiting for your yes. */
  waiting: number;
}

/** FAM-02 "Who is in which wallet". */
export interface CircleView {
  circle: CircleInfo;
  people: { id: number; name: string; short: string; initials: string }[];
  wallets: { id: number; name: string; type: WalletType; balance: string | null; in: number[] }[];
}

/** FAM-10 one line of the family's activity. */
export interface ActivityItem {
  id: string;
  kind: 'money' | 'approvals' | 'people' | 'rules';
  at: string;
  actor: { id: number; name: string; initials: string } | null;
  text: string;
  /** "+₦40,000" for money. */
  amount: string | null;
  direction: 'credit' | 'debit' | null;
  wallet_id: number;
  request_id?: number;
}

export type CirclePerm = 'approve' | 'send' | 'invite' | 'rules' | 'balances';
export type CircleRole = 'co_owner' | 'admin' | 'contributor';

/** FAM-07 a member's profile. */
export interface CircleMemberDetail {
  person: { id: number; name: string; first_name: string; initials: string; avatar_url: string | null; is_child: boolean };
  role: string;
  role_label: string;
  /** "12 Mar 2026" */
  joined: string;
  /** "Verified · Tier 3 · 0805 •••• 318" */
  identity: string;
  tier: number;
  wallets: { wallet_id: number; wallet_name: string; wallet_type: WalletType; role: string; line: string; put_in: string | null; member_row_id: number | null }[];
  permissions: Record<CirclePerm, boolean>;
  circle_role_set: boolean;
  recent: ActivityItem[];
  can_manage: boolean;
  can_edit_role: boolean;
  is_circle_owner: boolean;
}

/** FAM-09 what removing someone means. */
export interface RemovePreview {
  name: string;
  first_name: string;
  circle: string;
  contributions: { total: string; detail: string } | null;
  wallets: string[];
  keyholder: { wallets: string[]; days: number } | null;
  kept: { wallet: string; reason: string }[];
}

const cid = (id: number | null | undefined) => id ?? 0;

export function useCircles() {
  return useQuery({ queryKey: ['circles'], queryFn: () => api<{ circles: CircleRow[] }>('/circles'), select: (d) => d.circles });
}

export function useCircleView(circleId: number | null) {
  return useQuery({ queryKey: ['circle-view', cid(circleId)], queryFn: () => api<CircleView>(`/circles/${cid(circleId)}/view`) });
}

export function useCircleActivity(circleId: number | null, filter: 'everyone' | 'money' | 'approvals' | 'people') {
  return useQuery({
    queryKey: ['circle-activity', cid(circleId), filter],
    queryFn: () => api<{ items: ActivityItem[] }>(`/circles/${cid(circleId)}/activity?filter=${filter}`),
    select: (d) => d.items,
  });
}

export function useCircleMember(circleId: number | null, userId: number) {
  return useQuery({ queryKey: ['circle-member', cid(circleId), userId], queryFn: () => api<CircleMemberDetail>(`/circles/${cid(circleId)}/members/${userId}`) });
}

function useRefreshCircles() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.family });
    void qc.invalidateQueries({ queryKey: ['circles'] });
    void qc.invalidateQueries({ queryKey: ['circle-view'] });
    void qc.invalidateQueries({ queryKey: ['circle-member'] });
    void qc.invalidateQueries({ queryKey: ['circle-activity'] });
    void qc.invalidateQueries({ queryKey: keys.wallets });
  };
}

export function useSetCircleRole(circleId: number | null, userId: number) {
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: (body: { role: CircleRole; permissions: Record<CirclePerm, boolean> }) =>
      api<{ updated: string[]; skipped: { wallet: string; reason: string }[]; member: CircleMemberDetail }>(`/circles/${cid(circleId)}/members/${userId}/role`, { method: 'PUT', body }),
    onSuccess: refresh,
  });
}

export function useRemovePreview(circleId: number | null, userId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['circle-remove', cid(circleId), userId],
    queryFn: () => api<RemovePreview>(`/circles/${cid(circleId)}/members/${userId}/remove`),
    enabled,
  });
}

export function useRemoveMember(circleId: number | null, userId: number) {
  const qc = useQueryClient();
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: () => api<{ removed: string[]; kept: { wallet: string; reason: string }[] }>(`/circles/${cid(circleId)}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      // They're not in the circle any more: drop their page rather than asking for it again.
      qc.removeQueries({ queryKey: ['circle-member', cid(circleId), userId] });
      qc.removeQueries({ queryKey: ['circle-remove', cid(circleId), userId] });
      refresh();
    },
  });
}

export function useCreateCircle() {
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: (body: { name: string; kind: string; purpose?: string }) => api<{ circle: CircleInfo }>('/circles', { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useMoveWalletToCircle() {
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: ({ walletId, circleId }: { walletId: number; circleId: number | null }) => api(`/wallets/${walletId}/circle`, { method: 'PATCH', body: { circle_id: circleId } }),
    onSuccess: refresh,
  });
}

export interface TransferInfo {
  circle: CircleInfo;
  candidates: { id: number; name: string; line: string; eligible: boolean }[];
  accept_days: number;
  effect_hours: number;
}

export function useTransferInfo(circleId: number | null) {
  return useQuery({ queryKey: ['circle-transfer', cid(circleId)], queryFn: () => api<TransferInfo>(`/circles/${cid(circleId)}/transfer`) });
}

export function useRequestTransfer(circleId: number | null) {
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: (body: { to_user_id: number; pin: string }) => api<{ circle: CircleInfo }>(`/circles/${cid(circleId)}/transfer`, { method: 'POST', body }),
    onSuccess: refresh,
  });
}

export function useAnswerTransfer(circleId: number | null) {
  const refresh = useRefreshCircles();
  return useMutation({
    mutationFn: (answer: 'accept' | 'cancel') => api<{ circle: CircleInfo }>(`/circles/${cid(circleId)}/transfer/${answer}`, { method: 'POST' }),
    onSuccess: refresh,
  });
}
