import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProject } from '../../api/hooks';
import { useProjectMessages, useSendProjectMessage } from '../../api/projectFlow';
import { useProjectChatInfo } from '../../api/chats';
import { MessageItem, MilestoneCard, dayHeader } from '../../components/chat/ChatUi';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { clockTime } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ProjectMessage } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** One bubble: yours on the right in brand green, everyone else's on the left with a name and time. */
export function ChatBubble({ mine, name, time, body }: { mine: boolean; name: string; time: string; body: string }) {
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      <Text style={{ fontFamily: ptFont.medium, fontSize: 11, color: pt.inkSubtle }}>{[mine ? 'You' : name, time].filter(Boolean).join(' · ')}</Text>
      <View
        style={{
          maxWidth: '82%',
          borderRadius: ptRadius.md,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: mine ? pt.brand : pt.raised,
          borderTopRightRadius: mine ? 4 : ptRadius.md,
          borderTopLeftRadius: mine ? ptRadius.md : 4,
        }}
      >
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: mine ? '#FFFFFF' : pt.ink }}>{body}</Text>
      </View>
    </View>
  );
}

/** The bar at the bottom of a chat: a message box and a send button (and Steward, CHT-03). */
export function ChatComposer({ onSend, sending, placeholder = 'Message…', steward = false }: { onSend: (text: string) => void; sending: boolean; placeholder?: string; steward?: boolean }) {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  const send = () => {
    const t = text.trim();
    if (!t || sending) return;
    onSend(t);
    setText('');
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 6, borderTopWidth: 1, borderTopColor: pt.line, backgroundColor: pt.surface }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={pt.inkSubtle}
        accessibilityLabel="Message"
        multiline
        maxLength={2000}
        style={{ flex: 1, minWidth: 0, maxHeight: 120, minHeight: 44, borderRadius: 22, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }}
      />
      {steward ? (
        <Pressable
          onPress={() => { selection(); setText((t) => (/^steward\b/i.test(t) ? t : `Steward, ${t}`)); }}
          accessibilityRole="button"
          accessibilityLabel="Ask Steward"
          style={{ borderRadius: 22 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: pt.emerald900, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="shield" size={18} color={pt.emerald300} />
          </View>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => { selection(); send(); }}
        disabled={!text.trim() || sending}
        accessibilityRole="button"
        accessibilityLabel="Send"
        style={{ borderRadius: 22 }}
      >
        {/* Fill on a View so it shows on every Android phone. */}
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? pt.brand : pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="send" size={18} color={text.trim() ? '#FFFFFF' : pt.inkSubtle} />}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * CHT-03 Project group chat: everyone on the project and Steward, with the
 * builder's submissions as cards ("Review and approve"), approvals and payments
 * as lines, and Steward answering from the project's records.
 */
export function ProjectChatScreen({ navigation, route }: RootScreenProps<'ProjectChat'>) {
  const { projectId } = route.params;
  const insets = useSafeAreaInsets();
  const project = useProject(projectId);
  const info = useProjectChatInfo(projectId);
  const messages = useProjectMessages(projectId);
  const send = useSendProjectMessage(projectId);
  const scroll = useRef<ScrollView>(null);
  const list = messages.data?.messages ?? [];
  const canChat = project.data?.can.chat !== false;
  const vendorSide = new Map((project.data?.people.vendor ?? []).map((v) => [v.first_name, (v.business ?? '').split(' ')[0]]));

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [list.length]);

  const people = info.data?.people.length ?? 0;
  const last = { day: '' };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: pt.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: pt.line }}>
        <PtBackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: pt.ink }} numberOfLines={1} accessibilityRole="header">
            {project.data?.project.title ?? 'Chat'}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{people ? `${people} people · Steward` : 'Project chat'}</Text>
        </View>
        <Pressable onPress={() => { selection(); navigation.navigate('ChatInfo', { projectId }); }} accessibilityRole="button" accessibilityLabel="Chat info" hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="info" size={22} color={pt.ink} />
        </Pressable>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {messages.isLoading || messages.error ? (
          <LoadingBlock error={messages.error ? (messages.error as Error).message : null} onRetry={() => void messages.refetch()} />
        ) : list.length === 0 ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 40 }}>
            No messages yet. Ask the builder a question, or agree a date. Type "Steward" to ask about the money.
          </Text>
        ) : (
          list.map((m: ProjectMessage) => {
            const header = dayHeader(m.created_at, last);
            const ms = m.kind === 'milestone' && m.payload ? project.data?.milestones.find((x) => x.id === m.payload!.milestone_id) : undefined;
            const reviewable = ms && (ms.status === 'submitted' || ms.status === 'approved') && project.data?.can.approve;
            return (
              <View key={m.id} style={{ gap: 10 }}>
                {header ? <Text style={{ alignSelf: 'center', fontFamily: ptFont.semibold, fontSize: 12, color: pt.inkSubtle }}>{header}</Text> : null}
                <MessageItem kind={m.kind ?? 'message'} mine={m.mine} name={m.name} initials={m.initials} label={vendorSide.get(m.name) || null} at={m.created_at} body={m.body}>
                  {m.kind === 'milestone' && m.payload ? (
                    <MilestoneCard
                      title={m.payload.title}
                      amount={m.payload.amount}
                      photos={m.payload.photos}
                      more={m.payload.more}
                      approvals={ms?.status === 'released' ? 'Paid' : ms?.approval ? `${ms.approval.yes} of ${ms.approval.required}` : null}
                      onReview={reviewable ? () => navigation.navigate('ReviewMilestone', { projectId, milestoneId: ms!.id }) : undefined}
                    />
                  ) : null}
                </MessageItem>
              </View>
            );
          })
        )}
        <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkSubtle, textAlign: 'center', marginTop: 8 }}>
          Pay through Patriai milestones, not by transfer in chat. That keeps your money protected.
        </Text>
      </ScrollView>
      {canChat ? (
        <ChatComposer
          steward
          placeholder="Message the project"
          sending={send.isPending}
          onSend={(t) => send.mutate(t, { onError: (e) => showAlert('Not sent', (e as Error).message) })}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}
