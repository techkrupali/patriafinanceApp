import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useChatContacts, useCreateGroup, useStartDirect } from '../../api/chats';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LoadingBlock, PersonRow } from '../../components/project/ProjectUi';
import { pt, ptFont } from '../../theme';
import { initials } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * CHT-02 New chat: a direct chat with one person, or a group — its name, the
 * people (family, and the builder's side of your projects), a project to link,
 * and Steward answering from that project's records.
 */
export function NewChatScreen({ navigation }: RootScreenProps<'NewChat'>) {
  const q = useChatContacts();
  const direct = useStartDirect();
  const group = useCreateGroup();
  const [kind, setKind] = useState<'direct' | 'group'>('group');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [project, setProject] = useState<number | null>(null);
  const [steward, setSteward] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const people = q.data?.people ?? [];
  const projects = q.data?.projects ?? [];

  if (!q.data) {
    return (
      <PtPageScreen title="New chat" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const startDirect = (id: number) =>
    direct.mutate(id, {
      onSuccess: (r) => navigation.replace('Conversation', { conversationId: r.chat.id }),
      onError: (e) => showAlert('Not started', (e as Error).message),
    });

  const create = () => {
    setError(null);
    if (!title.trim()) return setError('Give the group a name.');
    if (!picked.length) return setError('Add at least one person.');
    group.mutate(
      { title: title.trim(), member_ids: picked, project_id: project, steward: steward && project !== null },
      { onSuccess: (r) => navigation.replace('Conversation', { conversationId: r.chat.id }), onError: (e) => setError((e as Error).message) },
    );
  };

  return (
    <PtPageScreen
      title="New chat"
      onBack={() => navigation.goBack()}
      footer={kind === 'group' ? <PtButton title="Create group" loading={group.isPending} onPress={create} /> : null}
    >
      <PtSegmented options={[{ value: 'direct', label: 'Direct' }, { value: 'group', label: 'Group' }]} value={kind} onChange={(v) => setKind(v as 'direct' | 'group')} />
      {kind === 'group' ? <PtField label="Group name" value={title} onChangeText={setTitle} placeholder="Boys' quarters" maxLength={80} /> : null}
      <View style={{ gap: 10 }}>
        <PtGroupLabel>{kind === 'group' ? 'Add people' : 'Who do you want to talk to?'}</PtGroupLabel>
        {people.length ? (
          <PtPanel>
            {people.map((p, i) => {
              const on = picked.includes(p.id);
              return (
                <PersonRow
                  key={p.id}
                  initials={initials(p.name)}
                  tone={p.side === 'vendor' ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                  name={p.name}
                  sub={p.label}
                  chip={kind === 'group' ? (on ? { label: 'Added', tone: 'success', icon: 'check' } : { label: 'Add', tone: 'neutral', icon: 'plus' }) : null}
                  onPress={() => (kind === 'direct' ? startDirect(p.id) : setPicked((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id])))}
                  last={i === people.length - 1}
                />
              );
            })}
          </PtPanel>
        ) : (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>People you share a wallet or a project with show here.</Text>
        )}
      </View>
      {kind === 'group' && projects.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Link to a project</PtGroupLabel>
          <PtPills options={[{ value: 0, label: 'None' }, ...projects.map((p) => ({ value: p.id, label: p.title }))]} value={project ?? 0} onChange={(v) => setProject(Number(v) || null)} />
          {project ? (
            <PtPanel>
              <PtSwitchRow title="Steward can answer questions here" subtitle="Uses only this project's records" value={steward} onChange={setSteward} />
            </PtPanel>
          ) : null}
        </View>
      ) : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
