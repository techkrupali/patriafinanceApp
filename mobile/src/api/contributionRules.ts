import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { WalletType } from './types';

/** AUT-11 "Contribution rules" for a shared savings or goal wallet. */
export interface ContributionRules {
  wallet: { id: number; name: string; type: WalletType };
  remind: 'day' | 'before_and_day' | 'off';
  remind_label: string;
  reminder_day: number | null;
  late_fee_on: boolean;
  late_fee: number;
  late_fee_label: string;
  tell_owners_after: number | null;
  tell_label: string;
  share_by: 'contributions' | 'equal';
  /** "Ngozi 44% · Emeka 41% · Aunty Ada 15%" */
  shares: string | null;
  streak_bonus: boolean;
  /** Not available until there's a partner bank. */
  interest: null;
  can_edit: boolean;
}

export function useContributionRules(walletId: number | null) {
  return useQuery({
    queryKey: ['contribution-rules', walletId],
    queryFn: () => api<ContributionRules>(`/wallets/${walletId}/contribution-rules`),
    enabled: Boolean(walletId),
  });
}

export function useSaveContributionRules(walletId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{ remind: string; late_fee_on: boolean; late_fee: number; tell_owners_after: number | null; share_by: string; streak_bonus: boolean }>) =>
      api<ContributionRules>(`/wallets/${walletId}/contribution-rules`, { method: 'PUT', body }),
    onSuccess: (d) => qc.setQueryData(['contribution-rules', walletId], d),
  });
}
