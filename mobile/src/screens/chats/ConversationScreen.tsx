import React, { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { useConversation, useSendChat } from '../../api/chats';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { MessageItem, ProposalCard, dayHeader } from '../../components/chat/ChatUi';
import { ChatComposer } from '../projects/ProjectChatScreen';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * CHT-04 Direct chat with a vendor (their business, verified, Profile), a
 * proposal card ("View proposal"), and "Pay vendors through Patriai, not by
 * transfer in chat"; the same screen shows a group.
 */
export function ConversationScreen({ navigation, route }: RootScreenProps<'Conversation'>) {
  const { conversationId } = route.params;
  const insets = useSafeAreaInsets();
  const q = useConversation(conversationId);
  const send = useSendChat(conversationId);
  const scroll = useRef<ScrollView>(null);
  const chat = q.data?.chat;
  const list = q.data?.messages ?? [];

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [list.length]);

  const last = { day: '' };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: pt.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: pt.line }}>
        <PtBackButton onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: pt.ink }} numberOfLines={1} accessibilityRole="header">
            {chat?.title ?? 'Chat'}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>{chat?.sub ?? ''}</Text>
        </View>
        {chat?.kind === 'direct' && chat.other?.vendor_profile_id ? (
          <Pressable onPress={() => { selection(); navigation.navigate('VendorProfile', { profileId: chat.other!.vendor_profile_id! }); }} accessibilityRole="button" hitSlop={8} style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Profile</Text>
          </Pressable>
        ) : chat?.kind === 'group' ? (
          <Pressable onPress={() => { selection(); navigation.navigate('ChatInfo', { conversationId }); }} accessibilityRole="button" accessibilityLabel="Chat info" hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="info" size={22} color={pt.ink} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {!q.data ? (
          <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
        ) : list.length === 0 ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center', paddingVertical: 40 }}>Say hello.</Text>
        ) : (
          list.map((m) => {
            const header = dayHeader(m.created_at, last);
            return (
              <View key={m.id} style={{ gap: 10 }}>
                {header ? <Text style={{ alignSelf: 'center', fontFamily: ptFont.semibold, fontSize: 12, color: pt.inkSubtle }}>{header}</Text> : null}
                <MessageItem kind={m.kind} mine={m.mine} name={m.name} initials={m.initials} at={m.created_at} body={m.body}>
                  {m.kind === 'proposal' && m.payload ? (
                    <ProposalCard
                      title={m.payload.title}
                      total={m.payload.total}
                      phases={m.payload.phases}
                      onOpen={() => navigation.navigate('ProposalReview', { proposalId: m.payload!.proposal_id })}
                    />
                  ) : null}
                </MessageItem>
              </View>
            );
          })
        )}
        {chat?.vendor ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 17, color: pt.inkSubtle, textAlign: 'center', marginTop: 8 }}>
            Pay vendors through Patriai, not by transfer in chat. That keeps your money protected by milestones.
          </Text>
        ) : null}
      </ScrollView>
      <ChatComposer
        steward={Boolean(chat?.steward)}
        placeholder={chat?.kind === 'direct' ? `Message ${chat.title.split(' ')[0]}` : 'Message the group'}
        sending={send.isPending}
        onSend={(t) => send.mutate(t, { onError: (e) => showAlert('Not sent', (e as Error).message) })}
      />
    </KeyboardAvoidingView>
  );
}
