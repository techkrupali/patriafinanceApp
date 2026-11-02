import React, { useState } from 'react';
import { View } from 'react-native';
import { useAddChatPeople, useChatContacts, useConversation, useLeaveChat, useMuteProjectChat, useProjectChatInfo, useUpdateChat } from '../../api/chats';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { AVATAR_CYCLE } from '../../components/pt/PtAvatar';
import { LoadingBlock, PersonRow } from '../../components/project/ProjectUi';
import { initials } from '../../lib/format';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * CHT-05 Chat info: who's in it and their role, photos, files and proof,
 * Steward in this chat, Mute, Add people, Leave chat ("Project records stay").
 */
export function ChatInfoScreen({ navigation, route }: RootScreenProps<'ChatInfo'>) {
  const { projectId, conversationId } = route.params;
  const me = useAuth((s) => s.user);
  const project = useProjectChatInfo(projectId ?? 0);
  const conv = useConversation(conversationId ?? 0);
  const mute = useMuteProjectChat(projectId ?? 0);
  const update = useUpdateChat(conversationId ?? 0);
  const add = useAddChatPeople(conversationId ?? 0);
  const leave = useLeaveChat(conversationId ?? 0);
  const contacts = useChatContacts();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const isProject = Boolean(projectId);
  const data = isProject ? project.data : conv.data?.chat;

  if (!data) {
    return (
      <PtPageScreen title="Chat info" onBack={() => navigation.goBack()}>
        <LoadingBlock error={(isProject ? project.error : conv.error) ? ((isProject ? project.error : conv.error) as Error).message : null} />
      </PtPageScreen>
    );
  }

  const people = data.people;
  const muted = data.muted;
  const group = !isProject && conv.data?.chat.kind === 'group';
  const outside = (contacts.data?.people ?? []).filter((p) => !people.some((x) => x.id === p.id));

  return (
    <PtPageScreen title={data.title} subtitle={isProject ? 'Project chat' : group ? 'Group' : 'Chat'} onBack={() => navigation.goBack()}>
      <PtPanel>
        {people.map((p, i) => (
          <PersonRow key={p.id} initials={initials(p.name)} tone={p.vendor ? 'gold' : i === 0 ? 'brand' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]} name={p.id === me?.id ? `${p.first_name} (you)` : p.name} sub={p.label} last={i === people.length - 1} />
        ))}
      </PtPanel>
      <PtPanel>
        {isProject ? (
          <PtReviewRow label="Photos, files and proof" value={`${project.data!.files} item${project.data!.files === 1 ? '' : 's'}`} onEdit={() => navigation.navigate('ProjectDocuments', { projectId: projectId! })} />
        ) : null}
        {isProject ? (
          <PtReviewRow label="Steward in this chat" value="Answers questions from the project's records" sub='Type "Steward" in a message to ask' />
        ) : conv.data?.chat.project ? (
          <PtSwitchRow
            title="Steward in this chat"
            subtitle={`Answers from ${conv.data.chat.project.title}'s records`}
            value={Boolean(conv.data.chat.steward)}
            onChange={(v) => update.mutate({ steward: v }, { onError: (e) => showAlert('Not changed', (e as Error).message) })}
          />
        ) : null}
        <PtSwitchRow
          title="Mute"
          subtitle="No notifications from this chat"
          value={muted}
          onChange={(v) => (isProject ? mute.mutate(v) : update.mutate({ muted: v }))}
        />
      </PtPanel>
      {group ? (
        <View style={{ gap: 8 }}>
          <PtButton title="Add people" variant="secondary" disabled={!outside.length} onPress={() => setAdding(true)} />
          <PtButton
            title="Leave chat"
            variant="ghost"
            loading={leave.isPending}
            onPress={() =>
              showAlert('Leave this chat?', "You won't see new messages.", [
                { text: 'Stay', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => leave.mutate(undefined, { onSuccess: () => navigation.navigate('Chats') }) },
              ])
            }
          />
        </View>
      ) : null}
      {isProject ? <PtNote tone="info" icon="lock">Project records stay. Messages about money are kept with the project.</PtNote> : null}

      <PtSheet
        visible={adding}
        title="Add people"
        onClose={() => setAdding(false)}
        footer={
          <PtButton
            title="Add"
            disabled={!picked.length}
            loading={add.isPending}
            onPress={() => add.mutate(picked, { onSuccess: () => { setAdding(false); setPicked([]); }, onError: (e) => showAlert('Not added', (e as Error).message) })}
          />
        }
      >
        {outside.map((p) => (
          <PtChoiceCard key={p.id} kind="check" title={p.name} subtitle={p.label} selected={picked.includes(p.id)} onPress={() => setPicked((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))} />
        ))}
      </PtSheet>
    </PtPageScreen>
  );
}
