import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtDivider, PtNote, PtPanel, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAjo, useAjoActions, type AjoDetail, type AjoMemberRow } from '../../api/ajo';
import { formatNaira } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** "Nov 2026" (monthly) or "8 Nov" (weekly) for turn n, before the order is saved. */
function turnFor(a: AjoDetail, n: number): string {
  const [y, m, d] = a.starts_on.split('-').map(Number);
  const day = a.frequency === 'weekly' ? new Date(y, m - 1, d + 7 * (n - 1)) : new Date(y, m - 1 + (n - 1), d);
  return a.frequency === 'weekly'
    ? day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : day.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * AJO-02 "Payout order": before it starts, the organiser picks a random draw or
 * an agreed order, says whether members may swap, and starts the circle. Once
 * it runs, everyone sees the order and can ask to swap a turn still to come.
 */
export function AjoOrderScreen({ navigation, route }: RootScreenProps<'AjoOrder'>) {
  const { walletId } = route.params;
  const q = useAjo(walletId);
  const actions = useAjoActions(walletId);
  const a = q.data;
  const [mode, setMode] = useState<'random' | 'agreed'>('random');
  const [order, setOrder] = useState<number[]>([]);
  const [swaps, setSwaps] = useState(true);

  useEffect(() => {
    if (!a) return;
    setMode(a.order_mode);
    setSwaps(a.allow_swaps);
    setOrder((o) => (o.length === a.members.length ? o : a.members.map((m) => m.member_id)));
  }, [a]);

  if (!a) {
    return (
      <PtPageScreen title="Payout order" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const byId = new Map(a.members.map((m) => [m.member_id, m]));
  const setting = a.status === 'forming' && a.role === 'organiser';
  const move = (i: number, by: -1 | 1) => {
    selection();
    setOrder((o) => {
      const n = [...o];
      const j = i + by;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };

  const doStart = () =>
    actions.start.mutate(
      { order_mode: mode, order: mode === 'agreed' ? order : undefined, allow_swaps: swaps },
      {
        onSuccess: (res) => {
          notifySuccess();
          const me = res.ajo.me;
          showAlert('The circle has started', me?.turn_label ? `Your turn is ${me.turn_label} (${me.ordinal}). Everyone can see the order.` : 'Everyone can see the order.');
          navigation.replace('Ajo', { walletId });
        },
        onError: (e) => showAlert('Not started', e.message),
      },
    );
  const start = () => {
    if (a.joined < a.size) {
      showAlert(`Start with ${a.joined}?`, `Only ${a.joined} of ${a.size} have joined. Each payout becomes ${formatNaira(parseFloat(a.contribution) * a.joined)}, and the circle runs for ${a.joined} ${a.frequency === 'weekly' ? 'weeks' : 'months'}.`, [
        { text: 'Wait for more', style: 'cancel' },
        { text: `Start with ${a.joined}`, onPress: doStart },
      ]);
      return;
    }
    doStart();
  };

  const askSwap = (m: AjoMemberRow) =>
    showAlert(`Ask ${m.short} to swap?`, `Your ${a.me?.turn_label} for their ${m.turn_label}. It only changes if they agree.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ask to swap',
        onPress: () =>
          actions.swap.mutate(m.member_id, {
            onSuccess: () => { notifySuccess(); showAlert('Asked', `${m.short.split(' ')[0]} will see your request.`); },
            onError: (e) => showAlert('Not asked', e.message),
          }),
      },
    ]);

  const row = (m: AjoMemberRow, pos: number | null, i: number, total: number, label: string | null) => (
    <React.Fragment key={m.member_id}>
      <View
        style={{
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          marginHorizontal: m.you ? -16 : 0,
          paddingHorizontal: m.you ? 16 : 0,
          backgroundColor: m.you ? pt.brandSoft : 'transparent',
        }}
      >
        <Text style={{ width: 22, fontFamily: ptFont.bold, fontSize: 16, color: m.you ? pt.brand : pt.inkMuted }}>{pos ?? '•'}</Text>
        <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 16, color: m.you ? pt.brand : pt.ink }} numberOfLines={1}>
          {m.you ? `${m.short.split(' ')[0]} (you)` : m.short}
        </Text>
        {setting && mode === 'agreed' ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Move ${m.short} up`} style={{ padding: 6, opacity: i === 0 ? 0.3 : 1 }}>
              <Feather name="chevron-up" size={20} color={pt.ink} />
            </Pressable>
            <Pressable onPress={() => move(i, 1)} disabled={i === total - 1} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Move ${m.short} down`} style={{ padding: 6, opacity: i === total - 1 ? 0.3 : 1 }}>
              <Feather name="chevron-down" size={20} color={pt.ink} />
            </Pressable>
          </View>
        ) : null}
        {m.received ? <PtChip label="Paid out" tone="success" icon="check" /> : m.status === 'lost_turn' ? <PtChip label="Lost turn" tone="danger" icon="x" /> : null}
        {m.can_swap && !a.me?.swap_out ? (
          <Pressable onPress={() => askSwap(m)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Ask ${m.short} to swap`}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Swap</Text>
          </Pressable>
        ) : null}
        {label ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{label}</Text> : null}
      </View>
      {i < total - 1 ? <PtDivider /> : null}
    </React.Fragment>
  );

  const list = setting
    ? mode === 'agreed'
      ? order.map((id, i) => byId.get(id)).filter((m): m is AjoMemberRow => Boolean(m)).map((m, i, all) => row(m, i + 1, i, all.length, turnFor(a, i + 1)))
      : a.members.map((m, i) => row(m, null, i, a.members.length, null))
    : [...a.members].sort((x, y) => (x.position ?? 99) - (y.position ?? 99)).map((m, i, all) => row(m, m.position, i, all.length, m.turn_label));

  return (
    <PtPageScreen
      title="Payout order"
      subtitle={a.name}
      onBack={() => navigation.goBack()}
      footer={setting ? <PtButton title="Start the circle" loading={actions.start.isPending} disabled={a.joined < 2} onPress={start} /> : undefined}
    >
      {setting ? (
        <PtSegmented
          options={[
            { value: 'random', label: 'Random draw' },
            { value: 'agreed', label: 'Agreed order' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'random' | 'agreed')}
        />
      ) : null}
      {setting && mode === 'random' ? <PtNote>We draw the order when you start. Everyone sees the result, and nobody can redraw it.</PtNote> : null}
      {a.status === 'forming' && !setting ? <PtNote>{`${a.organiser.first_name ?? 'The organiser'} sets the order when the circle starts.`}</PtNote> : null}

      <PtPanel>{list}</PtPanel>

      {a.me?.swap_out ? <PtNote tone="warning">{`Waiting for ${a.me.swap_out.name} to agree to swap for ${a.me.swap_out.turn_label}.`}</PtNote> : null}
      {a.me?.swaps_in.map((s) => (
        <View key={s.id} style={{ gap: 10 }}>
          <PtNote tone="warning">{`${s.name} asks to swap: their ${s.turn_label} for your ${a.me?.turn_label}.`}</PtNote>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PtButton title="Keep my turn" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => actions.respondSwap.mutate({ swapId: s.id, accept: false }, { onError: (e) => showAlert('Not changed', e.message) })} />
            <PtButton title="Swap" size="sm" style={{ flex: 1 }} onPress={() => actions.respondSwap.mutate({ swapId: s.id, accept: true }, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Not swapped', e.message) })} />
          </View>
        </View>
      ))}

      {setting ? (
        <PtPanel>
          <PtSwitchRow title="Allow members to swap turns" subtitle="Both people must agree" value={swaps} onChange={setSwaps} />
        </PtPanel>
      ) : a.status === 'active' && !a.allow_swaps ? (
        <PtNote>This circle doesn't allow swaps.</PtNote>
      ) : null}
    </PtPageScreen>
  );
}
