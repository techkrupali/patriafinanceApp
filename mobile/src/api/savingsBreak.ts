import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Organisation } from './types';

/** BRK-03 a charity's profile. */
export interface OrganisationProfile extends Organisation {
  since: number | null;
  /** "From Patriai users ₦1,240,000 this year" (naira decimal). */
  given_this_year: string;
}

/** BRK-05 a break that went through. */
export interface EarlyBreak {
  reference: string;
  wallet: { id: number; name: string; balance: string; locked: boolean };
  to: string | null;
  taken_out: string;
  received: string;
  fee: string;
  charity: { donation_id: number; name: string | null; amount: string; receipt_no: string } | null;
  approved_by: { name: string; at: string | null } | null;
  at: string | null;
}

export function useOrganisation(id: number | null) {
  return useQuery({ queryKey: ['organisation', id], queryFn: () => api<OrganisationProfile>(`/organisations/${id}`), enabled: Boolean(id) });
}

export function useEarlyBreak(reference: string) {
  return useQuery({ queryKey: ['early-break', reference], queryFn: () => api<EarlyBreak>(`/early-breaks/${reference}`), enabled: reference.length > 0 });
}

/** BRK-05 "Download donation receipt": a 10-minute link that opens in the browser. */
export function useDonationReceiptLink() {
  return useMutation({ mutationFn: (donationId: number) => api<{ url: string }>(`/donations/${donationId}/receipt-link`, { method: 'POST' }) });
}

/** WPV-09 "Ask Ngozi for more access", once a day. */
export function useAskForAccess(walletId: number) {
  return useMutation({ mutationFn: (message?: string) => api<{ owner: string }>(`/wallets/${walletId}/access-request`, { method: 'POST', body: { message } }) });
}
