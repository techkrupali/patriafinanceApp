import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useWalletDrafts, useWallets } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtRing } from '../../components/pt/PtRing';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { DraftWalletCard } from '../../components/DraftWalletCard';
import { formatNaira, formatYmd } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { resumeDraft } from '../../lib/drafts';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const short = (ymd: string) => formatYmd(ymd.slice(0, 10)).replace(/ \d{4}$/, '');
const monthYear = (ymd: string) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(`${ymd.slice(0, 10)}T00:00:00`));

/** "Due 8 Jan", "Locked to Jun 2027", "Kamsi's goal", "Reached". */
function goalLine(w: Wallet, childGoal: string | undefined): string {
  const balance = Number(w.balance);
  const target = Number(w.target_amount ?? 0);
  if (target && balance >= target) return 'Reached';
  if (childGoal) return childGoal;
  if (w.lock?.locked && w.lock.mode === 'date' && w.lock.until) return `Locked to ${monthYear(w.lock.until)}`;
  if (w.target_date) return `Due ${short(w.target_date)}`;
  return 'No date';
}

/**
 * GOL-01 Goals home: "4 goals · ₦1,136,000 saved", each with its ring, how far
 * along and when it's due (or locked to, or a child's goal), "Expecting a
 * baby?" (GOL-12), and New goal.
 */
export function GoalsScreen({ navigation }: RootScreenProps<'Goals'>) {
  const q = useWallets();
  const drafts = useWalletDrafts();
  const all = (q.data ?? []).filter((w) => w.status !== 'closed');
  // A child's own goal: "Kamsi's goal", from "Kamsi's wallet".
  const childGoals = new Map(all.filter((w) => w.child?.goal?.wallet_id).map((w) => [w.child!.goal!.wallet_id, `${w.name.replace(/ wallet$/i, '')} goal`]));
  const childGoalIds = new Set(childGoals.keys());
  // Goal wallets, savings with a target, and the children's own goals.
  const goals = all.filter((w) => w.type === 'goal' || (w.type === 'savings' && Number(w.target_amount ?? 0) > 0) || childGoalIds.has(w.id));
  const saved = goals.reduce((t, w) => t + Number(w.balance), 0);
  const goalDrafts = (drafts.data ?? []).filter((d) => d.type === 'goal');

  return (
    <PtPageScreen
      title="Goals"
      subtitle={goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'} · ${formatNaira(saved)} saved` : 'Save toward something together'}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="New goal" onPress={() => navigation.navigate('GoalWalletSetup')} />}
    >
      {q.isLoading || q.error ? (
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {goals.length ? (
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              {goals.map((w, i) => {
                const target = Number(w.target_amount ?? 0);
                const pct = target ? Math.min(100, Math.round((Number(w.balance) * 100) / target)) : 0;
                return (
                  <Pressable key={w.id} onPress={() => { selection(); navigation.navigate('WalletDetail', { walletId: w.id }); }} accessibilityRole="button" accessibilityLabel={w.name}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, paddingVertical: 12, borderBottomWidth: i === goals.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                      <PtRing percent={pct} size={52} stroke={6} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{w.name}</Text>
                        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{target ? `${formatNaira(w.balance)} of ${formatNaira(target)}` : `${formatNaira(w.balance)} saved`}</Text>
                        <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.inkMuted }}>{goalLine(w, childGoals.get(w.id))}</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={pt.inkSubtle} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>School fees, rent, a car, a wedding: set a target and a date, and everyone who's helping saves toward it.</Text>
          )}

          {goalDrafts.map((d) => (
            <DraftWalletCard key={d.id} draft={d} onResume={() => resumeDraft(navigation, d)} />
          ))}

          {/* GOL-12 */}
          <Pressable onPress={() => { selection(); navigation.navigate('NewbornPlan'); }} accessibilityRole="button" accessibilityLabel="Expecting a baby?">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: pt.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="smile" size={22} color={pt.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>Expecting a baby?</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>A ready-made plan for hospital, baby things and the naming</Text>
              </View>
              <Feather name="chevron-right" size={18} color={pt.inkSubtle} />
            </View>
          </Pressable>
        </>
      )}
    </PtPageScreen>
  );
}
