import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useGoalThanks, useSavings, useWallet } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { PtRing } from '../../components/pt/PtRing';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, initials } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const short = (ymd: string) => formatYmd(ymd.slice(0, 10)).replace(/ \d{4}$/, '');

/**
 * GOL-10 Goal reached: "You did it, together · School fees 2027 hit ₦850,000,
 * 12 days early. Greenfield School gets paid on 6 Jan, as planned." — what
 * each person put in, and Send a thank-you to everyone.
 */
export function GoalReachedScreen({ navigation, route }: RootScreenProps<'GoalReached'>) {
  const { walletId } = route.params;
  const insets = useSafeAreaInsets();
  const me = useAuth((s) => s.user);
  const goal = useWallet(walletId);
  const q = useSavings(walletId);
  const thanks = useGoalThanks(walletId);
  const [sent, setSent] = useState(false);
  const w = goal.data?.wallet;
  const s = q.data;

  const target = Number(w?.target_amount ?? 0);
  const reachedAt = w?.goal?.reached_at ?? null;
  const early = reachedAt && w?.target_date ? Math.round((new Date(`${w.target_date}T00:00:00`).getTime() - new Date(reachedAt.slice(0, 10) + 'T00:00:00').getTime()) / 86_400_000) : 0;
  const payout = w?.goal?.payout;
  const savers = [...(s?.savers ?? [])].filter((x) => x.status !== 'invited' && Number(x.total_saved) > 0).sort((a, b) => Number(b.total_saved) - Number(a.total_saved));

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 32, paddingHorizontal: 20, paddingBottom: 24, gap: 18 }}>
        {!w || !s ? (
          <LoadingBlock error={goal.error ? (goal.error as Error).message : null} onRetry={() => { void goal.refetch(); void q.refetch(); }} />
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <PtRing percent={100} size={130} stroke={12} />
              <PtText variant="headline" style={{ textAlign: 'center' }}>You did it, together</PtText>
              <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
                {`${w.name} hit ${formatNaira(target || w.balance)}${early > 0 ? `, ${early} day${early === 1 ? '' : 's'} early` : ''}.`}
                {payout?.to ? (payout.paid_at ? ` ${payout.to} was paid on ${short(payout.paid_at)}.` : ` ${payout.to} gets paid on ${short(payout.run_on)}, as planned.`) : ''}
              </PtText>
            </View>
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              {savers.map((p, i) => (
                <View key={p.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === savers.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <PtAvatar initials={initials(p.user.name)} size={40} tone={p.status === 'owner' ? 'brand' : 'mint'} />
                  <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{p.user.id === me?.id ? 'You' : p.user.name.split(' ')[0]}</Text>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(p.total_saved)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 18, gap: 12 }}>
        <PtButton
          title={sent ? 'Thank-you sent' : 'Send a thank-you to everyone'}
          disabled={sent || savers.length < 2}
          loading={thanks.isPending}
          onPress={() =>
            thanks.mutate(undefined, {
              onSuccess: (r) => {
                notifySuccess();
                setSent(true);
                showAlert('Sent', `${r.sent} ${r.sent === 1 ? 'person' : 'people'} got your thank-you.`);
              },
              onError: (e) => {
                if (/already/.test(e.message)) setSent(true);
                showAlert('Not sent', e.message);
              },
            })
          }
        />
        <PtButton title="Back to goals" variant="ghost" onPress={() => navigation.navigate('Goals')} />
      </View>
    </View>
  );
}
