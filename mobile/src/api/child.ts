import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { appendFile, type PickedFile } from '../lib/upload';
import type { User } from './types';

/** CHD-06 the child's goal. Naira decimal strings. */
export interface ChildGoal {
  wallet_id: number;
  name: string;
  target: string;
  saved: string;
  percent: number;
  to_go: string;
  you_saved: string;
  others_added: string;
  save_percent: number;
  match_percent: number;
  per_allowance: string;
  reach_on: string | null;
}

/** CHD-05 one ask. */
export interface ChildRequest {
  id: number;
  amount: string;
  title: string;
  category: string | null;
  status: 'pending' | 'yes' | 'no' | 'closed';
  auto: boolean;
  by: string | null;
  said: string | null;
  reason: string | null;
  created_at: string | null;
}

/** CHD-03 the child's home. */
export interface ChildHome {
  first_name: string;
  last_name: string | null;
  wallet: { id: number; name: string; balance: string; paused: boolean };
  spend_today: string;
  daily_limit: string;
  auto_limit: string;
  controls: { daily_limit: number; shops: boolean; friends: boolean; online: boolean; cash: boolean };
  reason_required: boolean;
  goal: ChildGoal | null;
  tasks_open: number;
  waiting: ChildRequest[];
  notes: { from: string; message: string; at: string }[];
  parents: string[];
}

export interface ChildTask {
  id: number;
  title: string;
  reward: string;
  due_on: string | null;
  repeat_weekly: boolean;
  needs_photo: boolean;
  status: 'todo' | 'submitted' | 'paid';
  note: string | null;
  has_photo: boolean;
  paid_at: string | null;
  by: string | null;
  /** Parents only: the child's photo, from a short signed link. */
  photo_url?: string | null;
}

export interface ChildTasks {
  streak: number;
  tasks: ChildTask[];
}

/** CHD-09 a parent, WPV-04 a co-parent, WPV-05 a relative (no balance or spending). */
export interface ChildView {
  first_name: string;
  age_band: string;
  role: 'parent' | 'coparent' | 'relative';
  parents: { id: number; first_name: string }[];
  goal: ChildGoal | null;
  gifts: boolean;
  balance?: string;
  allowance?: { amount: string; frequency: 'weekly' | 'biweekly' | 'monthly'; starts_on: string };
  daily_limit?: string;
  controls?: { shops: boolean; friends: boolean; online: boolean; cash: boolean };
  requests?: { auto_limit: string; auto_per_week: number; reason_required: boolean };
  spent_this_week?: string;
  asks?: { id: number; amount: string; title: string; category: string | null; by: string | null; needs: string; created_at: string | null }[];
  tasks_waiting?: number;
  linked?: boolean;
  can_change?: boolean;
  can_approve?: boolean;
  paused?: boolean;
}

const K = {
  home: ['child-home'] as const,
  requests: ['child-requests'] as const,
  myTasks: ['child-tasks'] as const,
  view: (id: number) => ['child-view', id] as const,
  tasks: (id: number) => ['wallet-tasks', id] as const,
};

/** CHW-06 "I have a code": the child's phone becomes their own sign-in. */
export function useLinkChild() {
  return useMutation({
    mutationFn: (input: { code: string; pin: string; device_name?: string }) => api<{ token: string; user: User; wallet_id: number }>('/children/link', { method: 'POST', body: input }),
  });
}

export function useChildHome() {
  return useQuery({ queryKey: K.home, queryFn: () => api<ChildHome>('/child/home') });
}

export function useChildRequests() {
  return useQuery({ queryKey: K.requests, queryFn: () => api<{ requests: ChildRequest[] }>('/child/requests'), select: (d) => d.requests });
}

export function useChildTasks() {
  return useQuery({ queryKey: K.myTasks, queryFn: () => api<ChildTasks>('/child/tasks') });
}

/** CHD-04 "Send request": a spend from the child's wallet, approved on its own when small. */
export function useChildAsk(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; pin: string; description?: string; category: string; destination: { kind: 'bank'; bank_code: string; account_number: string; account_name: string; bank_name: string } | { kind: 'user'; identifier: string } }) =>
      api<{ pending_approval: boolean }>(`/wallets/${walletId}/spend-requests`, { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.home });
      void qc.invalidateQueries({ queryKey: K.requests });
    },
  });
}

/** CHD-06 "Add to my goal". */
export function useAddToGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; pin: string }) => api<{ reference: string; goal: ChildGoal }>('/child/goal', { method: 'POST', body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.home }),
  });
}

/** CHD-07 "Done": with a photo when the task asks for one. */
export function useTaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, photo }: { id: number; photo?: PickedFile | null }) => {
      const form = new FormData();
      if (photo) await appendFile(form, 'photo', photo, 'task');
      return api<ChildTasks>(`/tasks/${id}/done`, { method: 'POST', body: form });
    },
    onSuccess: (d) => {
      qc.setQueryData(K.myTasks, d);
      void qc.invalidateQueries({ queryKey: K.home });
    },
  });
}

export function useChildView(walletId: number, enabled = true) {
  return useQuery({ queryKey: K.view(walletId), queryFn: () => api<ChildView>(`/wallets/${walletId}/child`), enabled: enabled && walletId > 0 });
}

/** WPV-04 "Change limits". */
export function useUpdateChild(walletId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<{ allowance: string; daily_limit: string; auto_limit: string; auto_per_week: number; reason_required: boolean; shops: boolean; friends: boolean; online: boolean; cash: boolean }>) =>
      api<ChildView>(`/wallets/${walletId}/child`, { method: 'PATCH', body: input }),
    onSuccess: (d) => qc.setQueryData(K.view(walletId), d),
  });
}

/** WPV-05 "Send a note". */
export function useChildNote(walletId: number) {
  return useMutation({ mutationFn: (message: string) => api(`/wallets/${walletId}/child/note`, { method: 'POST', body: { message } }) });
}

export function useWalletTasks(walletId: number, enabled = true) {
  return useQuery({ queryKey: K.tasks(walletId), queryFn: () => api<ChildTasks>(`/wallets/${walletId}/tasks`), enabled: enabled && walletId > 0 });
}

/** CHD-12 "Send to Tolu" and checking a task done. */
export function useTaskActions(walletId: number) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: K.tasks(walletId) });
    void qc.invalidateQueries({ queryKey: K.view(walletId) });
  };
  return {
    add: useMutation({
      mutationFn: (input: { title: string; reward: string; due_on?: string; repeat_weekly: boolean; needs_photo: boolean; coparent_can_approve: boolean }) =>
        api<{ id: number }>(`/wallets/${walletId}/tasks`, { method: 'POST', body: input }),
      onSuccess: done,
    }),
    approve: useMutation({ mutationFn: (input: { id: number; from_wallet_id?: number }) => api(`/tasks/${input.id}/approve`, { method: 'POST', body: { from_wallet_id: input.from_wallet_id } }), onSuccess: done }),
    sendBack: useMutation({ mutationFn: (input: { id: number; note?: string }) => api(`/tasks/${input.id}/send-back`, { method: 'POST', body: { note: input.note } }), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => api(`/tasks/${id}`, { method: 'DELETE' }), onSuccess: done }),
  };
}
