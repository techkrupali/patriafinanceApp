import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** CHT-01 one row of the inbox: a project's chat, a direct chat or a group. */
export interface ChatRow {
  type: 'project' | 'conversation';
  id: number;
  title: string;
  tag: 'projects' | 'vendors' | 'family';
  initials: string | null;
  last: string;
  at: string | null;
  unread: number;
  muted: boolean;
}

export interface ChatPerson {
  id: number;
  name: string;
  first_name: string;
  label: string;
  vendor?: boolean;
}

export interface ChatDetail {
  id: number;
  kind: 'direct' | 'group';
  title: string;
  /** CHT-04 "Adeyemi Builders · verified", or "6 people · Steward". */
  sub: string;
  other: { id: number; name: string; vendor_profile_id: number | null } | null;
  vendor: boolean;
  project: { id: number; title: string } | null;
  steward: boolean;
  muted: boolean;
  people: ChatPerson[];
}

export interface ChatMessage {
  id: number;
  kind: 'message' | 'proposal' | 'system' | 'steward';
  body: string | null;
  /** A proposal card (VPJ-05): what the builder sent. */
  payload: { proposal_id: number; title: string; total: string; phases: number } | null;
  name: string | null;
  initials: string | null;
  mine: boolean;
  created_at: string | null;
}

export interface ProjectChatInfo {
  title: string;
  kind: 'project';
  people: ChatPerson[];
  files: number;
  steward: boolean;
  muted: boolean;
}

const K = {
  inbox: (f: string) => ['chats', f] as const,
  chat: (id: number) => ['chat', id] as const,
  contacts: ['chat-contacts'] as const,
  projectInfo: (id: number) => ['project-chat-info', id] as const,
};

function refresh(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['chats'] });
}

export function useChats(filter: 'all' | 'projects' | 'vendors' | 'family') {
  return useQuery({ queryKey: K.inbox(filter), queryFn: () => api<{ chats: ChatRow[] }>(`/chats?filter=${filter}`), select: (d) => d.chats, refetchInterval: 20_000 });
}

export function useChatContacts() {
  return useQuery({ queryKey: K.contacts, queryFn: () => api<{ people: (ChatPerson & { side: 'family' | 'vendor' })[]; projects: { id: number; title: string }[] }>('/chat-contacts') });
}

/** CHT-04 open (or start) the direct chat with someone. */
export function useStartDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api<{ chat: ChatDetail }>('/chats/direct', { method: 'POST', body: { user_id: userId } }),
    onSuccess: () => refresh(qc),
  });
}

/** CHT-02 "Create group". */
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; member_ids: number[]; project_id?: number | null; steward?: boolean }) => api<{ chat: ChatDetail }>('/chats/groups', { method: 'POST', body }),
    onSuccess: () => refresh(qc),
  });
}

export function useConversation(id: number) {
  return useQuery({ queryKey: K.chat(id), queryFn: () => api<{ chat: ChatDetail; messages: ChatMessage[] }>(`/chats/${id}`), refetchInterval: 8_000, enabled: id > 0 });
}

export function useSendChat(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api(`/chats/${id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.chat(id) });
      refresh(qc);
    },
  });
}

/** CHT-05 mute, Steward. */
export function useUpdateChat(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { muted?: boolean; steward?: boolean }) => api(`/chats/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.chat(id) });
      refresh(qc);
    },
  });
}

export function useAddChatPeople(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userIds: number[]) => api(`/chats/${id}/members`, { method: 'POST', body: { user_ids: userIds } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: K.chat(id) }),
  });
}

export function useLeaveChat(id: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => api(`/chats/${id}/members/me`, { method: 'DELETE' }), onSuccess: () => refresh(qc) });
}

export function useProjectChatInfo(projectId: number) {
  return useQuery({ queryKey: K.projectInfo(projectId), queryFn: () => api<ProjectChatInfo>(`/projects/${projectId}/chat-info`) });
}

export function useMuteProjectChat(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => api(`/projects/${projectId}/chat`, { method: 'PATCH', body: { muted } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: K.projectInfo(projectId) });
      refresh(qc);
    },
  });
}
