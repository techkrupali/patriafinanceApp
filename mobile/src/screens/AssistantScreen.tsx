import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Header } from '../components/Header';
import { SecureTransferCard } from '../components/SecureTransferCard';
import { TransactionListCard } from '../components/TransactionListCard';
import { TransactionGroupCard } from '../components/TransactionGroupCard';
import { SupportRequestCard } from '../components/SupportRequestCard';
import { colors } from '../theme';
import { useAssistantChat } from '../api/hooks';
import type { AssistantAction } from '../api/types';
import type { RootScreenProps } from '../navigation/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: AssistantAction | null;
}

let seq = 0;
const nextId = () => `m${Date.now()}_${seq++}`;

/**
 * Minimal AI Assistant chat. Renders the conversation and, when a reply carries a
 * `secure_transfer` action, shows the SecureTransferCard (in-chat PIN authorize)
 * beneath that reply. The PIN never flows through this screen's chat state or the
 * assistant — SecureTransferCard sends it straight to /transfers.
 */
export function AssistantScreen(_props: RootScreenProps<'Assistant'>) {
  const chat = useAssistantChat();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: nextId(), role: 'assistant', text: 'Hi! I can help with your wallets, transactions, rules and transfers. What would you like to do?' },
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  // Send explicit text (used by the composer and by in-chat actions like "Show more").
  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending) return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    // History = the running transcript (text only — never a PIN/secret).
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, userMsg]);
    scrollToEnd();

    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: data.reply, action: data.action },
          ]);
          scrollToEnd();
        },
        onError: (e) => {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: e.message || 'Sorry, something went wrong.' },
          ]);
          scrollToEnd();
        },
      },
    );
  };

  const send = () => {
    submit(input);
    setInput('');
  };

  const addAssistantLine = (text: string) =>
    setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text }]);

  return (
    <Screen>
      <Header title="Assistant" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m) => {
            const mine = m.role === 'user';
            return (
              <View key={m.id} className={`mb-3 ${mine ? 'items-end' : 'items-start'}`}>
                <View
                  className={`max-w-[85%] rounded px-4 py-2.5 ${mine ? 'bg-navy' : 'bg-white'}`}
                  style={!mine ? { borderWidth: 1, borderColor: colors.lavFaint } : undefined}
                >
                  <Text className={`text-[15px] leading-5 ${mine ? 'text-white' : 'text-ink'}`}>
                    {m.text}
                  </Text>
                </View>
                {m.action?.type === 'secure_transfer' ? (
                  <View className="w-[85%]">
                    <SecureTransferCard action={m.action} onResult={addAssistantLine} />
                  </View>
                ) : null}
                {m.action?.type === 'transaction_list' ? (
                  <View className="w-full">
                    <TransactionListCard action={m.action} onShowMore={() => submit('Show more')} />
                  </View>
                ) : null}
                {m.action?.type === 'transaction_group' ? (
                  <View className="w-full">
                    <TransactionGroupCard action={m.action} onShowMore={() => submit('Show more')} />
                  </View>
                ) : null}
                {m.action?.type === 'support_request' ? (
                  <View className="w-[85%]">
                    <SupportRequestCard action={m.action} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {chat.isPending ? (
            <View className="mb-3 items-start">
              <View className="rounded bg-white px-4 py-3" style={{ borderWidth: 1, borderColor: colors.lavFaint }}>
                <ActivityIndicator color={colors.navy} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View className="flex-row items-end px-3 pb-2 pt-1" style={{ gap: 8 }}>
          <View className="flex-1 rounded bg-white px-4 py-1" style={{ borderWidth: 1, borderColor: colors.lav }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Message the assistant…"
              placeholderTextColor={colors.muted}
              multiline
              className="max-h-28 py-2 text-[15px] text-ink"
              onSubmitEditing={send}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={!input.trim() || chat.isPending}
            className={`h-11 w-11 items-center justify-center rounded-full ${input.trim() && !chat.isPending ? 'bg-navy' : 'bg-lav'}`}
          >
            <Ionicons name="arrow-up" size={20} color={input.trim() && !chat.isPending ? colors.white : colors.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
