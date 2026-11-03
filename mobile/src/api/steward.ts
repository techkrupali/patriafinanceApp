import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** AIS-05 what Steward may do. */
export interface StewardSettings {
  mode: 'suggest' | 'prepare' | 'act';
  /** Kobo. */
  limit: number;
  limit_label: string;
  answer_vendors: boolean;
  tell_after: boolean;
  auto_actions: { id: number; name: string; enabled: boolean }[];
}

/** AIS-06 one thing Steward did. */
export interface StewardAction {
  id: number;
  kind: 'move' | 'auto_rule' | 'answer' | 'suggest';
  summary: string;
  amount: string | null;
  reference: string | null;
  at: string | null;
  undone: boolean;
}

export function useStewardSettings() {
  return useQuery({ queryKey: ['steward-settings'], queryFn: () => api<StewardSettings>('/steward/settings') });
}

export function useSaveStewardSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ mode: StewardSettings['mode']; limit: number; answer_vendors: boolean; tell_after: boolean }>) => api<StewardSettings>('/steward/settings', { method: 'PUT', body }),
    onSuccess: (d) => qc.setQueryData(['steward-settings'], d),
  });
}

export function useStewardAutoAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { when: string; will: string; limit?: number; tell?: boolean; percent?: number }) => api<{ line: string; rule_id: number | null }>('/steward/auto-actions', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['steward-settings'] });
      void qc.invalidateQueries({ queryKey: ['automations'] });
    },
  });
}

export function useStewardActions() {
  return useQuery({ queryKey: ['steward-actions'], queryFn: () => api<{ actions: StewardAction[] }>('/steward/actions'), select: (d) => d.actions });
}
