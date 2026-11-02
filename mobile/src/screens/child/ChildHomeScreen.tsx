import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtRing } from '../../components/pt/PtRing';
import { LoadError } from '../../components/LoadError';
import { useChildHome } from '../../api/child';
import { useHomeCopy } from '../../lib/homeCopy';
import { formatNaira, initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { RequestChip, matchLine } from './ChildUi';
import type { ChildStackParamList } from '../../navigation/types';

/**
 * CHD-03 Child home: "Hi Tolu", my money and what I can spend today, my goal,
 * Ask for money, tasks to earn, and what's waiting for a parent.
 */
export function ChildHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ChildStackParamList>>();
  const copy = useHomeCopy();
  const q = useChildHome();
  const h = q.data;
  const tap = (fn: () => void) => () => {
    selection();
    fn();
  };

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 28, gap: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={pt.brand} />}
      >
        {q.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />
        ) : !h ? (
          <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: pt.gold500, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.emerald900 }}>{initials(`${h.first_name} ${h.last_name ?? ''}`)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{`Hi ${h.first_name}`}</Text>
                <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, letterSpacing: -0.5, color: pt.ink }} accessibilityRole="header">
                  {copy.greeting(new Date().getHours()).replace(/,$/, '')}
                </Text>
              </View>
              <Pressable onPress={tap(() => navigation.navigate('ChildNotifications'))} accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={8}>
                <Feather name="bell" size={22} color={pt.ink} />
              </Pressable>
            </View>

            <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.lg, padding: 22, overflow: 'hidden', gap: 6 }}>
              <View style={{ position: 'absolute', right: -40, top: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: '#DC9E3B' }} />
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>My money</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 40, letterSpacing: -1, color: '#FFFFFF' }}>{formatNaira(h.wallet.balance)}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: '#FFFFFF' }}>
                {h.wallet.paused ? 'Your wallet is paused by a parent' : `You can spend ${formatNaira(h.spend_today)} today`}
              </Text>
            </View>

            {h.goal ? (
              <Pressable onPress={tap(() => navigation.navigate('ChildTabs', { screen: 'ChildGoal' }))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16 }}>
                <PtRing percent={h.goal.percent} size={64} stroke={7} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{h.goal.name}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
                    {[`${formatNaira(h.goal.to_go)} to go`, matchLine(h.goal, h.parents)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={tap(() => navigation.navigate('ChildTabs', { screen: 'ChildAsk' }))} accessibilityRole="button" style={{ flex: 1, minHeight: 104, backgroundColor: pt.gold100, borderRadius: ptRadius.md, padding: 16, gap: 12, justifyContent: 'space-between' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.gold500, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="message-square" size={18} color={pt.emerald900} />
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>Ask for money</Text>
              </Pressable>
              <Pressable onPress={tap(() => navigation.navigate('ChildTabs', { screen: 'ChildTasks' }))} accessibilityRole="button" style={{ flex: 1, minHeight: 104, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 16, gap: 12, justifyContent: 'space-between' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="star" size={18} color="#FFFFFF" />
                </View>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{h.tasks_open ? `${h.tasks_open} task${h.tasks_open === 1 ? '' : 's'} to earn` : 'Tasks'}</Text>
              </Pressable>
            </View>

            {h.waiting.map((r) => (
              <Pressable key={r.id} onPress={tap(() => navigation.navigate('ChildRequests'))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 14 }}>
                <RequestChip r={r} />
                <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink }} numberOfLines={1}>{`${r.title} · ${formatNaira(r.amount)}`}</Text>
                <Feather name="chevron-right" size={18} color={pt.inkMuted} />
              </Pressable>
            ))}
            {h.waiting.length === 0 ? (
              <Pressable onPress={tap(() => navigation.navigate('ChildRequests'))} accessibilityRole="button" style={{ paddingVertical: 4 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand, textAlign: 'center' }}>My requests</Text>
              </Pressable>
            ) : null}

            {h.notes[0] ? (
              <View style={{ flexDirection: 'row', gap: 10, backgroundColor: pt.infoSoft ?? pt.brandSoft, borderRadius: ptRadius.md, padding: 14 }}>
                <Feather name="mail" size={18} color={pt.brand} />
                <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.ink }}>
                  <Text style={{ fontFamily: ptFont.bold }}>{`${h.notes[0].from}: `}</Text>
                  {h.notes[0].message}
                </Text>
              </View>
            ) : null}

            <Pressable onPress={tap(() => navigation.navigate('ChildTips'))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}>
              <Feather name="zap" size={18} color={pt.brand} />
              <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>Today's money tip</Text>
              <Feather name="chevron-right" size={18} color={pt.inkMuted} />
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
