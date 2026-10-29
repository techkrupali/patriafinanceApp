import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont } from '../../theme';
import { PtRing } from '../../components/pt/PtRing';
import { PtChip } from '../../components/pt/PtChip';
import { PtButton } from '../../components/pt/PtButton';
import { SecureTransferCard } from '../../components/SecureTransferCard';
import { TransactionListCard } from '../../components/TransactionListCard';
import { TransactionGroupCard } from '../../components/TransactionGroupCard';
import { SupportRequestCard } from '../../components/SupportRequestCard';
import { ApiError } from '../../api/client';
import {
  useApprovals,
  useAssistantChat,
  useAutomations,
  useDashboard,
  useFamily,
  useHome,
  useWallets,
} from '../../api/hooks';
import { formatNaira, formatYmd } from '../../lib/format';
import { localAnswer } from '../../lib/stewardLocal';
import { selection } from '../../lib/haptics';
import type { AssistantAction, HomeGoal } from '../../api/types';
import type { TabScreenProps } from '../../navigation/types';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: AssistantAction | null;
}

let seq = 0;
const nextId = () => `s${Date.now()}_${seq++}`;

const CHIPS = ['Where did our money go this month?', 'How are our goals doing?', 'Anything waiting for me?', 'What rules are running?'];

/** Months from now until a YYYY-MM-DD date (at least 1). */
function monthsUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(1, months);
}

function UserBubble({ text }: { text: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: 280,
        backgroundColor: pt.brand,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.onBrand }}>{text}</Text>
    </View>
  );
}

function StewardCard({ children, tone = 'raised' }: { children: React.ReactNode; tone?: 'raised' | 'info' }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        maxWidth: 320,
        backgroundColor: tone === 'info' ? pt.infoSoft : pt.raised,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomRightRadius: 18,
        borderBottomLeftRadius: tone === 'info' ? 18 : 4,
        padding: 14,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}

/**
 * Steward tab (prototype AIS-01). Opens with where the family stands on its
 * nearest goal and one suggestion it can set up, then chats. Answers come from
 * the AI assistant when the server has it configured; otherwise from Steward's
 * own reading of the family's live numbers. Steward never moves money itself:
 * transfers it prepares still need your PIN.
 */
export function StewardScreen({ navigation, route }: TabScreenProps<'Steward'>) {
  const insets = useSafeAreaInsets();
  const home = useHome();
  const wallets = useWallets();
  const dashboard = useDashboard();
  const family = useFamily();
  const automations = useAutomations();
  const approvals = useApprovals('to_me', 'pending');
  const chat = useAssistantChat();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [offline, setOffline] = useState(false);
  const [kb, setKb] = useState(0);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const s = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, chat.isPending, kb]);

  // The goal furthest from done that is still open, else the first one.
  const focusGoal: HomeGoal | undefined = useMemo(() => {
    const goals = home.data?.goals ?? [];
    return goals.filter((g) => g.percent < 100).sort((a, b) => b.percent - a.percent)[0] ?? goals[0];
  }, [home.data]);

  const main = (wallets.data ?? []).find((w) => w.type === 'main');

  const suggestion = useMemo(() => {
    if (!focusGoal) {
      return {
        text: 'Pick something to save for, like school fees or rent, and I will keep everyone on track.',
        cta: 'Start a goal',
        go: () => navigation.navigate('GoalWalletSetup'),
      };
    }
    const hasRule = (automations.data ?? []).some((r) => r.enabled && r.to_wallet.id === focusGoal.wallet_id);
    if (hasRule || !main) return null;
    const left = Math.max(0, (parseFloat(focusGoal.target) || 0) - (parseFloat(focusGoal.balance) || 0));
    const months = monthsUntil(focusGoal.target_date) ?? 6;
    const monthly = Math.max(1000, Math.ceil(left / months / 1000) * 1000);
    return {
      text: `I can move ${formatNaira(monthly)} from ${main.name} to ${focusGoal.name} every month${
        focusGoal.target_date ? `, so it's ready by ${formatYmd(focusGoal.target_date)}` : ''
      }.`,
      cta: 'Set it up',
      go: () => navigation.navigate('CreateAutomation', { fromWalletId: main.id, toWalletId: focusGoal.wallet_id }),
    };
  }, [focusGoal, automations.data, main, navigation]);

  const reply = (text: string, action: AssistantAction | null = null) =>
    setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text, action }]);

  // VND-03 "Ask Steward" from the vendor directory arrives with its question.
  const asked = route.params?.ask;
  useEffect(() => {
    if (!asked) return;
    navigation.setParams({ ask: undefined });
    ask(asked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const ask = (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending) return;
    selection();
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }]);
    setInput('');

    const answerLocally = () =>
      reply(
        localAnswer(text, {
          dashboard: dashboard.data,
          family: family.data,
          automations: automations.data,
          pending: approvals.data,
        }),
      );

    if (offline) {
      answerLocally();
      return;
    }
    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => reply(data.reply, data.action),
        onError: (e) => {
          // No AI configured (503) or unreachable: Steward still answers from your data.
          if (e instanceof ApiError && (e.statusCode === 503 || e.statusCode === 0)) {
            setOffline(true);
            answerLocally();
          } else {
            reply(e.message || 'Sorry, something went wrong.');
          }
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 12, paddingBottom: kb }}>
      <StatusBar style="dark" />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: pt.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="shield-account-outline" size={24} color={pt.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.33, color: pt.ink }} accessibilityRole="header">
            Steward
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }}>
            Suggests and prepares. Acts only with your OK.
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {home.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
        ) : focusGoal ? (
          <>
            <UserBubble text={`How far are we on ${focusGoal.name}?`} />
            <StewardCard>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>
                You've saved <Text style={{ fontFamily: ptFont.bold }}>{formatNaira(focusGoal.balance)}</Text> of{' '}
                {formatNaira(focusGoal.target)} for {focusGoal.name}.
                {focusGoal.target_date ? ` It's due ${formatYmd(focusGoal.target_date)}.` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <PtRing percent={focusGoal.percent} />
                <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                  {formatNaira(Math.max(0, (parseFloat(focusGoal.target) || 0) - (parseFloat(focusGoal.balance) || 0)))} to go
                </Text>
              </View>
            </StewardCard>
          </>
        ) : (
          <StewardCard>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>
              Hi{home.data?.first_name ? ` ${home.data.first_name}` : ''}. I watch your wallets, rules and approvals, and I can answer
              questions about your family's money.
            </Text>
          </StewardCard>
        )}

        {suggestion ? (
          <StewardCard tone="info">
            <PtChip label="Suggestion" tone="info" icon="star" />
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{suggestion.text}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PtButton title={suggestion.cta} size="sm" onPress={suggestion.go} />
              <PtButton title="More ideas" variant="ghost" size="sm" onPress={() => ask('What else can I do to save more?')} />
            </View>
          </StewardCard>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text} />
          ) : (
            <View key={m.id} style={{ gap: 8 }}>
              <StewardCard>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{m.text}</Text>
              </StewardCard>
              {m.action?.type === 'secure_transfer' ? <SecureTransferCard action={m.action} onResult={(t) => reply(t)} /> : null}
              {m.action?.type === 'transaction_list' ? <TransactionListCard action={m.action} onShowMore={() => ask('Show more')} /> : null}
              {m.action?.type === 'transaction_group' ? <TransactionGroupCard action={m.action} onShowMore={() => ask('Show more')} /> : null}
              {m.action?.type === 'support_request' ? <SupportRequestCard action={m.action} /> : null}
            </View>
          ),
        )}
        {chat.isPending ? (
          <StewardCard>
            <ActivityIndicator color={pt.brand} />
          </StewardCard>
        ) : null}
      </ScrollView>

      {/* Ask */}
      <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 10, backgroundColor: pt.surface }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
          {CHIPS.map((c) => (
            <Pressable
              key={c}
              onPress={() => ask(c)}
              accessibilityRole="button"
              style={{
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 18,
                borderWidth: 1.5,
                borderColor: pt.line,
                backgroundColor: pt.raised,
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: pt.ink }}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Steward or tell it what to do"
            placeholderTextColor={pt.inkSubtle}
            selectionColor={pt.brand}
            cursorColor={pt.brand}
            returnKeyType="send"
            onSubmitEditing={() => ask(input)}
            accessibilityLabel="Ask Steward"
            style={{
              flex: 1,
              height: 48,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: pt.lineStrong,
              backgroundColor: pt.raised,
              paddingHorizontal: 18,
              fontFamily: ptFont.regular,
              fontSize: 15,
              color: pt.ink,
            }}
          />
          <Pressable
            onPress={() => ask(input)}
            disabled={!input.trim() || chat.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: input.trim() ? pt.brand : pt.lineStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="arrow-up" size={22} color={pt.onBrand} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
