import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { colors, gradients, shadow } from '../../theme';
import { useApprovals, useAutomations, useDashboard, useFamily } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { DashboardData, FamilyData, AutomationRule, ApprovalRequest } from '../../api/types';
import type { TabScreenProps } from '../../navigation/types';

interface Msg {
  id: number;
  from: 'user' | 'steward';
  text: string;
}

interface Ctx {
  dashboard?: DashboardData;
  family?: FamilyData;
  automations?: AutomationRule[];
  pending?: ApprovalRequest[];
}

const GOAL_TYPES = ['savings', 'goal', 'emergency', 'giving'];

/** Steward's grounded, data-backed answers — no guessing, only live numbers. */
function answer(q: string, ctx: Ctx): string {
  const t = q.toLowerCase();
  const d = ctx.dashboard;

  if (/balance|total|kitna|how much.*(have|money)/.test(t)) {
    if (!d) return "I'm still loading your balances — try again in a second.";
    return `Your family treasury holds ${formatMoney(d.total_balance)} across ${d.wallets.length} wallets. The largest is ${[...d.wallets].sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance))[0]?.name ?? '—'}.`;
  }
  if (/spend|outflow|spent|expense/.test(t)) {
    if (!d) return 'One moment — your spending data is still loading.';
    return `In the last 30 days ${formatMoney(d.outflow_30d)} went out and ${formatMoney(d.inflow_30d)} came in. ${parseFloat(d.inflow_30d) >= parseFloat(d.outflow_30d) ? 'You saved more than you spent — strong month.' : 'Spending outpaced income this month — worth a look at Recent Activity.'}`;
  }
  if (/goal/.test(t)) {
    const goals = (d?.wallets ?? []).filter((w) => GOAL_TYPES.includes(w.type) && w.target_amount);
    if (goals.length === 0) return 'No savings goals with targets yet. Create one from Home → Goals and I’ll track it for you.';
    return goals
      .map((g) => {
        const pct = Math.min(100, Math.round((parseFloat(g.balance) / parseFloat(g.target_amount!)) * 100));
        return `${g.name}: ${formatMoney(g.balance)} of ${formatMoney(g.target_amount!)} (${pct}%)`;
      })
      .join('\n');
  }
  if (/family|member|who/.test(t)) {
    const m = ctx.family?.members ?? [];
    if (m.length === 0) return 'No family members yet — invite someone from the Family tab.';
    return `Your family has ${m.length} member${m.length === 1 ? '' : 's'}: ${m.map((x) => `${x.name} (${x.role.replace('_', '-')})`).join(', ')}.`;
  }
  if (/pending|request|approv/.test(t)) {
    const p = ctx.pending ?? [];
    if (p.length === 0) return 'Nothing is waiting on your approval right now. All clear ✅';
    return `You have ${p.length} pending request${p.length === 1 ? '' : 's'}:\n${p.map((r) => `• ${r.initiator.name}: ${formatMoney(r.amount)} — ${r.description || r.action}`).join('\n')}\nApprove them from Home or the Approvals screen.`;
  }
  if (/rule|automat/.test(t)) {
    const a = ctx.automations ?? [];
    if (a.length === 0) return 'No rules yet. Open the Rules tab to automate allowances and savings — I can move money for you on a schedule.';
    return `You have ${a.length} active rule${a.length === 1 ? '' : 's'}:\n${a.map((r) => `• ${r.name}: ${formatMoney(r.amount)} ${r.from_wallet.name} → ${r.to_wallet.name}, ${r.next_run_hint.toLowerCase()}`).join('\n')}`;
  }
  if (/hello|hi|hey|help|what can/.test(t)) {
    return "I'm Steward — your family's financial guide. Ask me about your balance, spending, goals, family members, pending requests or rules. To automate money moves, set them up in the Rules tab and I'll run them on schedule.";
  }
  return "I track your family's live numbers — try asking “What's our balance?”, “How are our goals?”, “Any pending requests?” or “What rules are running?”";
}

/** Proactive insights, Ledger-style — computed from live data. */
function buildInsights(ctx: Ctx): { icon: string; text: string }[] {
  const out: { icon: string; text: string }[] = [];
  const d = ctx.dashboard;
  const goals = (d?.wallets ?? []).filter((w) => GOAL_TYPES.includes(w.type) && w.target_amount);
  for (const g of goals) {
    const pct = Math.round((parseFloat(g.balance) / parseFloat(g.target_amount!)) * 100);
    if (pct >= 100) out.push({ icon: 'trophy', text: `“${g.name}” has reached its target — consider moving the surplus to the Treasury.` });
    else if (pct >= 60) out.push({ icon: 'trending-up', text: `“${g.name}” is ${pct}% funded and ahead of pace. Keep the auto-save running.` });
  }
  const p = ctx.pending ?? [];
  if (p.length > 0) out.push({ icon: 'gesture-tap-button', text: `${p[0].initiator.name} is waiting on ${formatMoney(p[0].amount)} — review it on Home.` });
  if (d && parseFloat(d.inflow_30d) > parseFloat(d.outflow_30d)) {
    out.push({ icon: 'shield-check', text: 'Inflow beat outflow this month — your family savings rate is healthy.' });
  }
  const frozen = (d?.wallets ?? []).filter((w) => w.status === 'frozen');
  if (frozen.length > 0) out.push({ icon: 'lock', text: `${frozen.map((w) => w.name).join(', ')} ${frozen.length === 1 ? 'is' : 'are'} frozen — spending is blocked there.` });
  if (out.length === 0) out.push({ icon: 'creation', text: 'All quiet. Set a savings goal or a rule and I’ll keep it on track for you.' });
  return out.slice(0, 3);
}

const CHIPS = ['Our balance?', 'Spending this month', 'Goals progress', 'Pending requests', 'Active rules'];

export function StewardScreen(_props: TabScreenProps<'Steward'>) {
  const dashboard = useDashboard();
  const family = useFamily();
  const automations = useAutomations();
  const approvals = useApprovals('to_me', 'pending');

  const ctx: Ctx = useMemo(
    () => ({
      dashboard: dashboard.data,
      family: family.data,
      automations: automations.data,
      pending: approvals.data,
    }),
    [dashboard.data, family.data, automations.data, approvals.data],
  );

  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 1, from: 'steward', text: "Good day — I'm Steward, your family's financial guide. Ask me anything about your money." },
  ]);
  const [input, setInput] = useState('');
  const [kbHeight, setKbHeight] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const nextId = useRef(2);

  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [msgs, kbHeight]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    selection();
    const userMsg: Msg = { id: nextId.current++, from: 'user', text: q };
    setMsgs((prev) => [...prev, userMsg]);
    setInput('');
    // Steward "thinks" briefly, then answers from live data.
    setTimeout(() => {
      setMsgs((prev) => [...prev, { id: nextId.current++, from: 'steward', text: answer(q, ctx) }]);
    }, 350);
  };

  const insights = useMemo(() => buildInsights(ctx), [ctx]);

  return (
    <Screen>
      {/* Steward header */}
      <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[{ height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, shadow.gold]}
        >
          <MaterialCommunityIcons name="creation" size={20} color="#3D2F00" />
        </LinearGradient>
        <View className="ml-3 flex-1">
          <Text className="text-lg font-extrabold text-ink">Steward</Text>
          <View className="flex-row items-center">
            <View className="mr-1.5 h-2 w-2 rounded-full bg-brand" />
            <Text className="text-[11px] font-semibold text-muted">Watching over your family's money</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scroller}
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Insights */}
        <View style={{ gap: 10 }}>
          {insights.map((ins) => (
            <LinearGradient
              key={ins.text}
              colors={['#FFCC00', '#F1C100']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 16, padding: 16 }, shadow.soft]}
            >
              <View className="flex-row items-start">
                <MaterialCommunityIcons
                  name={ins.icon as never}
                  size={18}
                  color="#3D2F00"
                  style={{ marginRight: 10, marginTop: 1 }}
                />
                <Text className="flex-1 text-[14px] font-bold leading-5 text-[#3D2F00]">{ins.text}</Text>
              </View>
            </LinearGradient>
          ))}
        </View>

        {/* Chat */}
        <View className="mt-5" style={{ gap: 10 }}>
          {msgs.map((m) =>
            m.from === 'steward' ? (
              <View key={m.id} className="flex-row">
                <View className="mr-2 mt-1 h-7 w-7 items-center justify-center rounded-full bg-gold-soft">
                  <MaterialCommunityIcons name="creation" size={14} color={colors.goldDeep} />
                </View>
                <View className="max-w-[82%] rounded-2xl rounded-tl-md bg-white px-4 py-3" style={shadow.soft}>
                  <Text className="text-[14px] leading-5 text-ink">{m.text}</Text>
                </View>
              </View>
            ) : (
              <View key={m.id} className="flex-row justify-end">
                <View className="max-w-[82%] rounded-2xl rounded-tr-md bg-navy px-4 py-3">
                  <Text className="text-[14px] leading-5 text-white">{m.text}</Text>
                </View>
              </View>
            ),
          )}
        </View>

        {/* Quick asks */}
        <View className="mt-5 flex-row flex-wrap" style={{ gap: 8 }}>
          {CHIPS.map((c) => (
            <Pressable
              key={c}
              onPress={() => send(c)}
              className="rounded-full bg-lav px-4 py-2 active:opacity-80"
            >
              <Text className="text-[12px] font-bold text-muted">{c}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Composer — lifted above the keyboard (edge-to-edge safe) */}
      <View className="px-4 pb-3 pt-1" style={{ marginBottom: kbHeight }}>
        <View
          className="flex-row items-center rounded-full bg-white px-4"
          style={[shadow.card, { minHeight: 52 }]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Steward anything…"
            placeholderTextColor={colors.faded}
            selectionColor={colors.goldDeep}
            cursorColor={colors.goldDeep}
            className="flex-1 py-3 text-[15px]"
            style={{ color: colors.ink, fontWeight: '600' }}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            hitSlop={8}
            className="active:opacity-80"
          >
            <LinearGradient
              colors={gradients.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-up" size={18} color="#3D2F00" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
