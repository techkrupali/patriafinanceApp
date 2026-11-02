import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import { appendFile, type PickedFile } from '../lib/upload';
import type { Project } from './types';

/** VPJ-01…06 a builder's proposal to a family. Naira decimal strings. */
export interface Proposal {
  id: number;
  title: string;
  kind: 'building' | 'extension' | 'renovation' | 'event' | 'other';
  location: string | null;
  vendor: { id: number; name: string | null; business: string | null; profile_id: number | null; verified: boolean };
  family: { id: number; name: string; first_name: string } | null;
  invite_phone: string | null;
  lines: { label: string; amount: string }[];
  total: string;
  scope: string | null;
  documents: { name: string; url: string; kind: 'quote' | 'drawing' | 'other' }[];
  phases: { title: string; percent: number; amount: string; proof: string | null }[];
  terms: { upfront: boolean; retention_percent: number; retention_months: number; start_within_days: number; show_on_profile: boolean };
  /** VPJ-05 "₦960,000 upfront · 5% held back". */
  upfront: string | null;
  held_back: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  project_id: number | null;
  family_note: string | null;
  sent_at: string | null;
  mine: boolean;
  can_answer: boolean;
}

export interface ProposalDraft {
  family_user_id?: number | null;
  invite_phone?: string | null;
  title: string;
  kind: Proposal['kind'];
  location?: string;
  lines: { label: string; amount: string }[];
  scope?: string;
  phases: { title: string; percent: number; proof?: string }[];
  terms: Proposal['terms'];
}

/** VLS-01 a finished project the builder could show. */
export interface FinishedProject {
  id: number;
  title: string;
  family: string | null;
  milestones: number;
  all_approved: boolean;
  months: number;
  location: string | null;
  total: string;
  photos: { url: string; caption: string | null }[];
}

/** VLS-02 a finished project on the builder's profile. */
export interface Listing {
  id: number;
  title: string;
  business: string | null;
  vendor_profile_id: number;
  vendor_user_id: number | null;
  photos: { url: string; caption?: string | null }[];
  milestones: number | null;
  months: number | null;
  cost_min: string | null;
  cost_max: string | null;
  location: string | null;
  status: 'asking' | 'published' | 'declined';
  review: { body: string; rating: number; by: string } | null;
  mine: boolean;
  can_answer: boolean;
}

const K = {
  one: (id: number) => ['proposal', id] as const,
  list: ['proposals'] as const,
  candidates: ['listing-candidates'] as const,
  listings: (profileId: number) => ['listings', profileId] as const,
  listing: (id: number) => ['listing', id] as const,
};

/**
 * VPJ-04 "Send proposal": save it, attach the quote and drawings, then send.
 * Returns the sent proposal.
 */
export function useSendProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, files }: { draft: ProposalDraft; files: { file: PickedFile; kind: 'quote' | 'drawing' }[] }) => {
      const saved = await api<{ proposal: Proposal }>('/vendor/proposals', { method: 'POST', body: draft });
      for (const f of files) {
        const form = new FormData();
        form.append('kind', f.kind);
        await appendFile(form, 'file', f.file, f.kind === 'quote' ? 'quote' : 'drawing');
        await api(`/vendor/proposals/${saved.proposal.id}/documents`, { method: 'POST', body: form });
      }
      return api<{ proposal: Proposal }>(`/vendor/proposals/${saved.proposal.id}/send`, { method: 'POST' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.list });
      void qc.invalidateQueries({ queryKey: ['chats'] });
    },
  });
}

export function useProposal(id: number) {
  return useQuery({ queryKey: K.one(id), queryFn: () => api<{ proposal: Proposal }>(`/proposals/${id}`), select: (d) => d.proposal, enabled: id > 0 });
}

export function useProposals() {
  return useQuery({ queryKey: K.list, queryFn: () => api<{ proposals: Proposal[] }>('/proposals'), select: (d) => d.proposals });
}

/** VPJ-06 "Fund ₦960,000 and start". */
export function useAcceptProposal(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pin: string; approvers: 'me' | 'both' | 'per_phase'; co_approver_id?: number; source_wallet_id: number; monthly?: string; monthly_wallet_id?: number }) =>
      api<{ project: Project }>(`/proposals/${id}/accept`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.one(id) });
      void qc.invalidateQueries({ queryKey: keys.projects });
      void qc.invalidateQueries({ queryKey: keys.wallets });
      void qc.invalidateQueries({ queryKey: keys.home });
    },
  });
}

export function useDeclineProposal(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) => api<{ proposal: Proposal }>(`/proposals/${id}/decline`, { method: 'POST', body: { note } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.one(id) }),
  });
}

export function useListingCandidates() {
  return useQuery({ queryKey: K.candidates, queryFn: () => api<{ projects: FinishedProject[] }>('/vendor/listing-candidates'), select: (d) => d.projects });
}

/** VLS-01 "Ask the Eze family and publish". */
export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { project_id: number; title: string; photos: { url: string; caption?: string | null }[]; cost_min?: string; cost_max?: string }) =>
      api<{ listing: Listing }>('/vendor/listings', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.candidates });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}

export function useVendorListings(profileId: number) {
  return useQuery({ queryKey: K.listings(profileId), queryFn: () => api<{ listings: Listing[] }>(`/vendors/${profileId}/listings`), select: (d) => d.listings, enabled: profileId > 0 });
}

export function useListing(id: number) {
  return useQuery({ queryKey: K.listing(id), queryFn: () => api<{ listing: Listing }>(`/listings/${id}`), select: (d) => d.listing, enabled: id > 0 });
}

/** The family agrees to show it, or keeps it private. */
export function useAnswerListing(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agree: boolean) => api<{ listing: Listing }>(`/listings/${id}/answer`, { method: 'POST', body: { agree } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.listing(id) });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
}
