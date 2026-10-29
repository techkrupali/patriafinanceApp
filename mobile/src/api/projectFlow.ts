import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys } from './hooks';
import { appendFile, type PickedFile } from '../lib/upload';
import type {
  AddMilestonePayload,
  DisputeData,
  DisputeReason,
  DisputesPageData,
  DisputeSummary,
  Milestone,
  MyVendorProfileData,
  OpenDisputePayload,
  Project,
  ProjectDocument,
  ProjectMessage,
  SubmitMilestonePayload,
  TeamMember,
  TeamRole,
  UpsertVendorPayload,
  VendorDeclined,
  VendorDetailData,
  VendorHomeData,
  VendorPayouts,
  VendorsPageData,
  VendorTeamData,
} from './types';

/**
 * The client sheet "Projects, vendors, disputes": the family and the builder
 * on a project, a business account and its verification, vendor mode (home,
 * payouts, team) and disputes. Amounts are naira strings.
 */

export const flowKeys = {
  vendorHome: ['vendor', 'home'] as const,
  vendorPayouts: ['vendor', 'payouts'] as const,
  vendorDisputes: ['vendor', 'disputes'] as const,
  team: ['vendors', 'me', 'team'] as const,
  teamInvites: ['team-invites'] as const,
  disputes: (status: 'open' | 'closed') => ['disputes', status] as const,
  dispute: (id: number) => ['disputes', 'detail', id] as const,
  messages: (projectId: number) => ['projects', projectId, 'messages'] as const,
  directory: (q: string, category: string, near: string, verified: boolean) => ['vendors', 'directory', q, category, near, verified] as const,
};

type QC = ReturnType<typeof useQueryClient>;

/** Anything on a project moves its detail, the lists, the builder's home and the family's home. */
function refreshProjects(qc: QC) {
  void qc.invalidateQueries({ queryKey: keys.projects });
  void qc.invalidateQueries({ queryKey: ['vendor'] });
  void qc.invalidateQueries({ queryKey: keys.home });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
  void qc.invalidateQueries({ queryKey: keys.wallets });
}

function refreshDisputes(qc: QC) {
  void qc.invalidateQueries({ queryKey: ['disputes'] });
  void qc.invalidateQueries({ queryKey: flowKeys.vendorDisputes });
  refreshProjects(qc);
}

function refreshBusiness(qc: QC) {
  void qc.invalidateQueries({ queryKey: keys.myVendorProfile });
  void qc.invalidateQueries({ queryKey: ['vendor'] });
}

// ---------------------------------------------------------------- the family on a project

/** PRJ-05 add (family) a milestone with what must be done. */
export function useAddProjectMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMilestonePayload) => api<{ milestone: Milestone }>(`/projects/${projectId}/milestones`, { method: 'POST', body: input }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** PRJ-05 "Save and send to builder". */
export function useEditMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, ...body }: { milestoneId: number; title?: string; amount?: string; due_date?: string | null; deliverables?: string[]; proof_needed?: string | null }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}`, { method: 'PATCH', body }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** PRJ-07 "Approve with PIN". */
export function useApproveRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, pin }: { milestoneId: number; pin: string }) =>
      api<{ milestone: Milestone; reference?: string; approval_request_id?: number }>(`/milestones/${milestoneId}/approve`, { method: 'POST', body: { pin } }),
    onSuccess: () => {
      refreshProjects(qc);
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** PRJ-06 "Ask for changes" on a submission. */
export function useSendBack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, note }: { milestoneId: number; note: string }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/reject`, { method: 'POST', body: { note } }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** PRJ-11 "Approve milestone" / "Ask for changes". */
export function useAnswerProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, approve, note }: { milestoneId: number; approve: boolean; note?: string }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/proposal/answer`, { method: 'POST', body: { approve, note } }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** The family agrees to the builder's changes, or keeps the original milestones. */
export function useAnswerVendorChanges(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agree: boolean) => api<{ project: Project }>(`/projects/${projectId}/changes/answer`, { method: 'POST', body: { agree } }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** PRJ-12 "Remind me to re-invite Adeyemi in March". */
export function useRemindReinvite(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ remind_on: string }>(`/projects/${projectId}/reinvite-reminder`, { method: 'POST' }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** VND-02 "Add to a project" / PRJ-12 "Find a builder": invite a builder from the directory. */
export function useInviteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, vendorProfileId }: { projectId: number; vendorProfileId: number }) =>
      api<{ project: Project }>(`/projects/${projectId}/vendor`, { method: 'POST', body: { vendor_profile_id: vendorProfileId } }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** VND-04 "Post review". */
export function usePostReview(profileId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; tags: string[]; body?: string; first_name_only: boolean; milestone_id?: number; project_id?: number }) =>
      api(`/vendors/${profileId}/reviews`, { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      refreshProjects(qc);
    },
  });
}

// ---------------------------------------------------------------- documents and chat

/** PRJ-09 a contract or bill of quantities (photo or PDF). */
export function useUploadProjectDocument(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ asset, kind, name }: { asset: PickedFile; kind: ProjectDocument['kind']; name?: string }) => {
      const form = new FormData();
      form.append('kind', kind);
      if (name) form.append('name', name);
      await appendFile(form, 'file', asset, kind);
      return api<{ document: ProjectDocument }>(`/projects/${projectId}/documents`, { method: 'POST', body: form });
    },
    onSuccess: () => refreshProjects(qc),
  });
}

export function useDeleteProjectDocument(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) => api(`/projects/${projectId}/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => refreshProjects(qc),
  });
}

export function useProjectMessages(projectId: number) {
  return useQuery({
    queryKey: flowKeys.messages(projectId),
    queryFn: () => api<{ messages: ProjectMessage[] }>(`/projects/${projectId}/messages`),
    refetchInterval: 15_000,
  });
}

export function useSendProjectMessage(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api<{ message: ProjectMessage }>(`/projects/${projectId}/messages`, { method: 'POST', body: { body } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: flowKeys.messages(projectId) }),
  });
}

// ---------------------------------------------------------------- the builder on a project

/** INV-V2 "Accept them all". */
export function useAcceptProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => api<{ project: Project }>(`/projects/${projectId}/accept`, { method: 'POST' }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** INV-V5 "Decline invite". */
export function useDeclineProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...body }: { projectId: number; reason: VendorDeclined['reason']; message?: string; start_month?: string }) =>
      api(`/projects/${projectId}/decline`, { method: 'POST', body }),
    // The builder can't see the project any more, so it isn't fetched again.
    onSuccess: (_d, { projectId }) => {
      qc.removeQueries({ queryKey: keys.project(projectId) });
      refreshProjects(qc);
    },
  });
}

/** INV-V3 "Save change" (naira amount, dates, why, a quote already uploaded as a document). */
export function useAskChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, ...body }: { milestoneId: number; amount?: string; starts_on?: string; due_date?: string; why?: string; attachment_id?: number }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/change`, { method: 'POST', body }),
    onSuccess: () => refreshProjects(qc),
  });
}

export function useClearChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: number) => api<{ milestone: Milestone }>(`/milestones/${milestoneId}/change`, { method: 'DELETE' }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** INV-V2 "Send back with 1 change". */
export function useSendChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: number) => api<{ project: Project }>(`/projects/${projectId}/send-changes`, { method: 'POST' }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** VDM-09 "Send to the family". */
export function useProposeMilestone(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; amount: string; due_date?: string; deliverables: string[]; reason: 'family_asked' | 'found_on_site' | 'price_change' | 'other'; why?: string }) =>
      api<{ milestone: Milestone }>(`/projects/${projectId}/milestones/propose`, { method: 'POST', body }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** The builder changes a proposed milestone after the family asked. */
export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, ...body }: { milestoneId: number; title?: string; amount?: string; due_date?: string; deliverables?: string[] }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/proposal`, { method: 'PATCH', body }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** The builder accepts the family's new amount or date, or keeps it. */
export function useAnswerFamilyChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, agree }: { milestoneId: number; agree: boolean }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/family-change/answer`, { method: 'POST', body: { agree } }),
    onSuccess: () => refreshProjects(qc),
  });
}

export function useTickDeliverables() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, done }: { milestoneId: number; done: boolean[] }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/deliverables`, { method: 'PATCH', body: { done } }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** VDM-05 a photo, a video, or a receipt. */
export function useAddEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ milestoneId, asset, receipt, caption }: { milestoneId: number; asset: PickedFile; receipt?: boolean; caption?: string }) => {
      const form = new FormData();
      if (receipt) form.append('kind', 'receipt');
      if (caption) form.append('caption', caption.slice(0, 60));
      await appendFile(form, 'file', asset, receipt ? 'receipt' : 'photo');
      return api<{ milestone: Milestone }>(`/milestones/${milestoneId}/evidence`, { method: 'POST', body: form });
    },
    onSuccess: () => refreshProjects(qc),
  });
}

export function useRemoveEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, evidenceId }: { milestoneId: number; evidenceId: number }) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/evidence/${evidenceId}`, { method: 'DELETE' }),
    onSuccess: () => refreshProjects(qc),
  });
}

/** VDM-05 "Submit for ₦1,900,000". */
export function useSubmitWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, ...body }: { milestoneId: number } & SubmitMilestonePayload) =>
      api<{ milestone: Milestone }>(`/milestones/${milestoneId}/submit`, { method: 'POST', body }),
    onSuccess: () => refreshProjects(qc),
  });
}

// ---------------------------------------------------------------- vendor mode

export function useVendorHome(enabled = true) {
  return useQuery({ queryKey: flowKeys.vendorHome, queryFn: () => api<VendorHomeData>('/vendor/home'), enabled });
}

export function useVendorPayouts() {
  return useQuery({ queryKey: flowKeys.vendorPayouts, queryFn: async () => (await api<{ payouts: VendorPayouts }>('/vendor/payouts')).payouts });
}

export function useSetAutoWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (auto_withdraw: boolean) => api<{ payouts: VendorPayouts }>('/vendors/me/payouts', { method: 'PATCH', body: { auto_withdraw } }),
    onSuccess: (data) => {
      qc.setQueryData(flowKeys.vendorPayouts, data.payouts);
      refreshBusiness(qc);
    },
  });
}

export function useVendorDisputes() {
  return useQuery({ queryKey: flowKeys.vendorDisputes, queryFn: async () => (await api<{ disputes: DisputeSummary[] }>('/vendor/disputes')).disputes });
}

// ---------------------------------------------------------------- the business account (VDM-01, VON-01…10)

export function useSaveBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertVendorPayload) => api<MyVendorProfileData>('/vendors/me', { method: 'PUT', body }),
    onSuccess: (data) => {
      qc.setQueryData(keys.myVendorProfile, data);
      refreshBusiness(qc);
    },
  });
}

/** POST a step of the business account and keep the cached profile in step. */
function useBusinessStep<I>(build: (input: I) => Promise<MyVendorProfileData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: build,
    onSuccess: (data) => {
      qc.setQueryData(keys.myVendorProfile, data);
      refreshBusiness(qc);
    },
  });
}

export const useSaveOwner = () =>
  useBusinessStep((body: { bvn?: string; nin?: string; id_type?: string; share_percent?: number | null }) => api<MyVendorProfileData>('/vendors/me/owner', { method: 'POST', body }));

export const useUploadBusinessDocument = () =>
  useBusinessStep(async ({ item, asset }: { item: string; asset: PickedFile }) => {
    const form = new FormData();
    form.append('item', item);
    await appendFile(form, 'file', asset, item);
    return api<MyVendorProfileData>('/vendors/me/documents', { method: 'POST', body: form });
  });

export const useAddDirector = () =>
  useBusinessStep((body: { name: string; phone: string; share_percent?: number | null }) => api<MyVendorProfileData>('/vendors/me/directors', { method: 'POST', body }));

export const useRemoveDirector = () => useBusinessStep((id: number) => api<MyVendorProfileData>(`/vendors/me/directors/${id}`, { method: 'DELETE' }));

export const useSaveBusinessAddress = () => useBusinessStep((address: string) => api<MyVendorProfileData>('/vendors/me/address', { method: 'POST', body: { address } }));

export const useSaveBusinessBank = () =>
  useBusinessStep((body: { account_number: string; bank_code: string; tin?: string | null }) => api<MyVendorProfileData>('/vendors/me/bank', { method: 'POST', body }));

export const useUploadLogo = () =>
  useBusinessStep(async (asset: PickedFile) => {
    const form = new FormData();
    await appendFile(form, 'file', asset, 'logo');
    return api<MyVendorProfileData>('/vendors/me/logo', { method: 'POST', body: form });
  });

export const useAddPastWork = () =>
  useBusinessStep(async ({ asset, caption }: { asset: PickedFile; caption?: string }) => {
    const form = new FormData();
    if (caption) form.append('caption', caption.slice(0, 40));
    await appendFile(form, 'file', asset, 'work');
    return api<MyVendorProfileData>('/vendors/me/past-work', { method: 'POST', body: form });
  });

export const useRemovePastWork = () => useBusinessStep((index: number) => api<MyVendorProfileData>(`/vendors/me/past-work/${index}`, { method: 'DELETE' }));

export const useSubmitBusiness = () => useBusinessStep(() => api<MyVendorProfileData>('/vendors/me/submit', { method: 'POST' }));

// ---------------------------------------------------------------- the team (VDM-10/11, INV-VT1)

export function useVendorTeam() {
  return useQuery({ queryKey: flowKeys.team, queryFn: () => api<VendorTeamData>('/vendors/me/team') });
}

export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; role: TeamRole; project_ids: number[] }) => api<{ member: TeamMember }>('/vendors/me/team', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: flowKeys.team }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: number) => api(`/vendors/me/team/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: flowKeys.team }),
  });
}

export function useTeamInvites() {
  return useQuery({ queryKey: flowKeys.teamInvites, queryFn: async () => (await api<{ invites: TeamMember[] }>('/team-invites')).invites });
}

export function useAnswerTeamInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, join }: { memberId: number; join: boolean }) => api<{ member: TeamMember }>(`/team-invites/${memberId}/answer`, { method: 'POST', body: { join } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: flowKeys.teamInvites });
      refreshProjects(qc);
    },
  });
}

// ---------------------------------------------------------------- the directory (VND-01/02)

export function useDirectory(q: string, category: string, near: string, verified: boolean) {
  return useInfiniteQuery({
    queryKey: flowKeys.directory(q, category, near, verified),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), per_page: '20' });
      if (q.trim()) params.set('q', q.trim());
      if (category) params.set('category', category);
      if (near.trim()) params.set('near', near.trim());
      if (verified) params.set('verified', '1');
      return api<VendorsPageData>(`/vendors?${params.toString()}`);
    },
    getNextPageParam: (last) => (last.pagination.page < last.pagination.last_page ? last.pagination.page + 1 : undefined),
  });
}

export function useVendorProfile(profileId: number) {
  return useQuery({ queryKey: keys.vendor(profileId), queryFn: () => api<VendorDetailData>(`/vendors/${profileId}`), enabled: profileId > 0 });
}

// ---------------------------------------------------------------- disputes (DSP-01…09)

export function useDisputeList(status: 'open' | 'closed') {
  return useQuery({
    queryKey: flowKeys.disputes(status),
    queryFn: async () => (await api<DisputesPageData>(`/disputes?status=${status}&per_page=50`)).disputes,
  });
}

export function useDispute(id: number) {
  return useQuery({
    queryKey: flowKeys.dispute(id),
    queryFn: async () => (await api<DisputeData>(`/disputes/${id}`)).dispute,
    refetchInterval: 20_000,
  });
}

/** DSP-04 "Open dispute", with the photos picked on the way. */
export function useOpenDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, ...input }: OpenDisputePayload & { files: PickedFile[] }) => {
      const form = new FormData();
      Object.entries(input).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
      });
      for (const [i, f] of files.entries()) await appendFile(form, `files[${i}]`, f, `evidence-${i + 1}`);
      return (await api<DisputeData>('/disputes', { method: 'POST', body: form })).dispute;
    },
    onSuccess: () => refreshDisputes(qc),
  });
}

/** Keeps the cached dispute in step with what a dispute action returns. */
function useDisputeAction<I>(id: number, run: (input: I) => Promise<DisputeData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => (await run(input)).dispute,
    onSuccess: (dispute) => {
      qc.setQueryData(flowKeys.dispute(id), dispute);
      refreshDisputes(qc);
    },
  });
}

export const useDisputeFile = (id: number) =>
  useDisputeAction(id, async (asset: PickedFile) => {
    const form = new FormData();
    await appendFile(form, 'file', asset, 'evidence');
    return api<DisputeData>(`/disputes/${id}/files`, { method: 'POST', body: form });
  });

export const useDisputeMessage = (id: number) => useDisputeAction(id, (body: string) => api<DisputeData>(`/disputes/${id}/messages`, { method: 'POST', body: { body } }));

/** DSP-07 the builder's answer. */
export const useRespondToDispute = (id: number) =>
  useDisputeAction(id, (body: { type: 'fix' | 'partial_refund' | 'disagree'; fix_by?: string; amount?: string; body?: string }) =>
    api<DisputeData>(`/disputes/${id}/respond`, { method: 'POST', body }));

/** DSP-06 "Accept offer" / "Not yet". */
export const useAnswerOffer = (id: number) =>
  useDisputeAction(id, ({ offerId, accept }: { offerId: number; accept: boolean }) =>
    api<DisputeData>(`/disputes/${id}/offers/${offerId}/answer`, { method: 'POST', body: { accept } }));

/** DSP-08 "Send to Patriai". */
export const useEscalateDispute = (id: number) => useDisputeAction(id, (note: string) => api<DisputeData>(`/disputes/${id}/escalate`, { method: 'POST', body: { note: note || undefined } }));

export type { DisputeReason };
