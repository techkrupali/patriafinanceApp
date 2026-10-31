import React, { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { ChatBubble, ChatComposer } from '../projects/ProjectChatScreen';
import { useSendSupport, useSupportChat } from '../../api/account';
import { useAuth } from '../../store/auth';
import { useSystem } from '../../store/system';
import { clockTime } from '../../lib/projects';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-17 Chat with support: Patriai support replies, usually in about 5
 * minutes; the conversation is kept, and the team answers from the admin
 * panel. From ME-18 "Someone tricked me" it opens as fraud, urgently.
 */
export function SupportChatScreen({ navigation, route }: RootScreenProps<'SupportChat'>) {
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const q = useSupportChat();
  const send = useSendSupport();
  const scroll = useRef<ScrollView>(null);
  const fraud = route.params?.topic === 'fraud';
  const messages = q.data?.messages ?? [];
  const agent = messages.find((m) => m.from === 'support')?.name;

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: pt.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={{ paddingTop: insets.top + 4, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}>
        <PtBackButton onPress={() => (navigation.canGoBack() ? navigation.goBack() : useSystem.getState().leaveSupportOnly())} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 20, color: pt.ink }}>Patriai support</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{agent ? `${agent} · ` : ''}replies in about {q.data?.replies_in ?? '5 min'}</Text>
        </View>
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {q.isLoading ? (
          <LoadingBlock />
        ) : (
          <>
            <ChatBubble mine={false} name="Patriai" time="" body={fraud ? `Hi ${me?.first_name ?? ''}, tell us what happened: who you paid, how much and when. We'll try to stop the money and help.` : `Hi ${me?.first_name ?? ''}, how can we help?`} />
            {messages.map((m) => (
              <View key={m.id} style={{ gap: 6 }}>
                <ChatBubble mine={m.from === 'user'} name={m.from === 'support' ? m.name ?? 'Patriai support' : m.name ?? ''} time={m.created_at ? clockTime(m.created_at) : ''} body={m.body} />
                {m.reference ? <Text style={{ alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start', fontFamily: ptFont.medium, fontSize: 12, color: pt.inkMuted }}>Transaction {m.reference} shared</Text> : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <ChatComposer
        sending={send.isPending}
        placeholder="Message…"
        onSend={(body) => send.mutate({ body, category: fraud && messages.length === 0 ? 'fraud' : undefined }, { onError: (e) => showAlert('Not sent', e.message) })}
      />
    </KeyboardAvoidingView>
  );
}
