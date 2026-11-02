import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont, ptRadius } from '../../theme';
import { useSavings } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtRing } from '../pt/PtRing';
import { PtButton } from '../pt/PtButton';
import { PtChip } from '../pt/PtChip';
import { PtAvatar } from '../pt/PtAvatar';
import { PtSectionTitle } from '../pt/PtList';
import { formatNaira, formatYmd, initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Saver, SavingsDetail, Wallet } from '../../api/types';
import type { RootStackParamList } from '../../navigation/types';

const short = (ymd: string | null | undefined) => (ymd ? formatYmd(ymd.slice(0, 10)).replace(/ \d{4}$/, '') : '');
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short' });

/** "₦40,000 a month · paid this month" / "· due 26 Oct" / "Invited". */
export function saverLine(s: Saver): string {
  if (s.status === 'invited') return 'Invited · not joined yet';
  const a = s.auto_save;
  const each = a && Number(a.amount) > 0 ? `${formatNaira(a.amount)} a ${a.frequency === 'weekly' ? 'week' : a.frequency === 'daily' ? 'day' : 'month'}` : 'Adds money when they like';
  if (Number(s.this_month ?? 0) > 0) return `${each} · paid this month`;
  if (a?.enabled && a.frequency === 'monthly' && a.day_of_month) {
    const now = new Date();
    const due = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > a.day_of_month ? 1 : 0), a.day_of_month);
    return `${each} · due ${a.day_of_month} ${MONTH.format(due)}`;
  }
  return each;
}

/** "On track" / "Behind" / "Reached". */
export function paceChip(s: SavingsDetail | undefined): { label: string; tone: 'success' | 'warning' | 'neutral' } | null {
  if (!s) return null;
  if (s.projection.reached) return { label: 'Reached', tone: 'success' };
  if (s.projection.on_track === true) return { label: 'On track', tone: 'success' };
  if (s.projection.on_track === false) return { label: 'Behind', tone: 'warning' };
  return null;
}

/**
 * GOL-07 Goal detail, for the owner and co-owners: the ring, "of ₦300,000 ·
 * due 18 Dec · On track", milestones ticked off as they're reached (Edit →
 * GOL-09), every contributor with their monthly and what they've put in, and
 * Pay my share (GOL-08). A reached goal opens GOL-10.
 */
export function GoalView({ wallet, canSpend }: { wallet: Wallet; canSpend: boolean }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const me = useAuth((s) => s.user);
  const q = useSavings(wallet.id);
  const s = q.data;
  const balance = Number(wallet.balance);
  const target = Number(wallet.target_amount ?? 0);
  const pct = target ? Math.min(100, (balance * 100) / target) : 0;
  const chip = paceChip(s);
  const locked = Boolean(wallet.goal_locked || wallet.lock?.locked);
  const payout = wallet.goal?.payout;
  const go = (fn: () => void) => () => { selection(); fn(); };

  return (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <PtRing percent={pct} size={150} stroke={14} />
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 36, letterSpacing: -1, color: pt.ink, marginTop: 6 }}>{formatNaira(wallet.balance)}</Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center' }}>
          {[target ? `of ${formatNaira(target)}` : null, wallet.target_date ? `due ${short(wallet.target_date)}` : null].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {chip ? <PtChip label={chip.label} tone={chip.tone} icon={chip.tone === 'warning' ? 'clock' : 'check'} /> : null}
          {locked ? <PtChip label={wallet.lock?.mode === 'date' && wallet.lock.until ? `Locked to ${short(wallet.lock.until)}` : 'Locked until reached'} tone="neutral" icon="lock" /> : null}
        </View>
      </View>

      {s?.projection.reached ? (
        <Pressable onPress={go(() => navigation.navigate('GoalReached', { walletId: wallet.id }))} accessibilityRole="button">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, padding: 16 }}>
            <Feather name="award" size={22} color={pt.emerald300} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: '#FFFFFF' }}>You did it, together</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.onDarkMuted }}>See who put in what, and say thank you</Text>
            </View>
            <Feather name="chevron-right" size={18} color={pt.emerald300} />
          </View>
        </Pressable>
      ) : null}
      {payout?.to ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}>
          <Feather name="send" size={18} color={pt.brand} />
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 14, color: pt.ink }}>
            {payout.paid_at ? `Paid ${payout.to} on ${short(payout.paid_at)}` : `Pays ${payout.to} on ${short(payout.run_on)}`}
          </Text>
        </View>
      ) : null}

      {!s ? (
        <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <PtSectionTitle title="Milestones" action={s.me.can_edit_plan ? 'Edit' : undefined} onAction={() => navigation.navigate('GoalMilestones', { walletId: wallet.id })} />
            {s.milestones.length ? (
              <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
                {s.milestones.map((m, i) => (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === s.milestones.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                    <Feather name={m.reached ? 'check-circle' : 'circle'} size={20} color={m.reached ? pt.brand : pt.lineStrong} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{m.title}</Text>
                      <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: m.overdue ? pt.danger : pt.inkMuted }}>
                        {[m.due_date ? `by ${short(m.due_date)}` : null, m.reached ? 'reached' : m.overdue ? 'behind' : null].filter(Boolean).join(' · ') || 'No date'}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(m.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>
                {s.me.can_edit_plan ? 'Break the goal into steps. Everyone sees each one get ticked off.' : 'No milestones yet.'}
              </Text>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <PtSectionTitle title="Contributors" action={s.me.can_edit_plan ? 'Plan' : undefined} onAction={() => navigation.navigate('SavingsPlan', { walletId: wallet.id })} />
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              {s.savers.map((p, i) => (
                <View key={p.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, borderBottomWidth: i === s.savers.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <PtAvatar initials={initials(p.user.name)} size={40} tone={p.status === 'owner' ? 'brand' : 'mint'} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{p.user.id === me?.id ? 'You' : p.user.name.split(' ')[0]}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>{saverLine(p)}</Text>
                  </View>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(p.total_saved)}</Text>
                </View>
              ))}
            </View>
          </View>

          {!s.projection.reached ? <PtButton title="Pay my share" onPress={() => navigation.navigate('PayShare', { walletId: wallet.id })} /> : null}
          {locked && wallet.lock?.early_break && canSpend ? (
            <PtButton title="Break goal early" variant="ghost" onPress={() => navigation.navigate('BreakEarly', { walletId: wallet.id })} />
          ) : null}
        </>
      )}
    </View>
  );
}
