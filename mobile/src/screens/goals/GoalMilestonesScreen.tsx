import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useSavings, useSavingsActions, useWallet } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtAddRow } from '../../components/pt/PtPeople';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * GOL-09 Edit milestones: "Break the goal into steps. Everyone sees each one
 * get ticked off." Each step, what they add up to against the goal, and Add a
 * milestone.
 */
export function GoalMilestonesScreen({ navigation, route }: RootScreenProps<'GoalMilestones'>) {
  const { walletId } = route.params;
  const goal = useWallet(walletId);
  const q = useSavings(walletId);
  const actions = useSavingsActions(walletId);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const s = q.data;
  const w = goal.data?.wallet;

  if (!s || !w) {
    return (
      <PtPageScreen title="Milestones" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const total = s.milestones.reduce((t, m) => t + Number(m.amount), 0);
  const target = Number(w.target_amount ?? 0);
  const fits = !target || Math.round(total) === Math.round(target);

  const add = () =>
    actions.addMilestone.mutate(
      { title: title.trim(), amount, due_date: due ?? undefined },
      {
        onSuccess: () => {
          setAdding(false);
          setTitle('');
          setAmount('');
          setDue(null);
        },
        onError: (e) => showAlert('Not added', e.message),
      },
    );

  return (
    <PtPageScreen title="Milestones" subtitle={w.name} onBack={() => navigation.goBack()} footer={<PtButton title="Save" onPress={() => navigation.goBack()} />}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>Break the goal into steps. Everyone sees each one get ticked off.</Text>
      {s.milestones.length ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
          {s.milestones.map((m, i) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === s.milestones.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{m.title}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{m.due_date ? `by ${formatYmd(m.due_date).replace(/ \d{4}$/, '')}` : 'No date'}{m.reached ? ' · reached' : ''}</Text>
              </View>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(m.amount)}</Text>
              <Pressable
                onPress={() => { selection(); actions.removeMilestone.mutate(m.id, { onError: (e) => showAlert('Not removed', e.message) }); }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.title}`}
                hitSlop={8}
              >
                <Feather name="x" size={18} color={pt.inkMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <PtAddRow label="Add a milestone" onPress={() => setAdding(true)} />
      {s.milestones.length ? (
        <PtPanel>
          <PtReviewRow
            label="Adds up to"
            value={formatNaira(total)}
            sub={!target ? null : fits ? 'Matches the goal' : total < target ? `${formatNaira(target - total)} less than the goal` : `${formatNaira(total - target)} more than the goal`}
            last
          />
        </PtPanel>
      ) : null}
      {!fits ? <PtNote>Steps don't have to add up to the goal, but it helps everyone see the whole way there.</PtNote> : null}

      <PtSheet
        visible={adding}
        title="Add a milestone"
        onClose={() => setAdding(false)}
        footer={<PtButton title="Add" disabled={!title.trim() || !(Number(amount) > 0)} loading={actions.addMilestone.isPending} onPress={add} />}
      >
        <PtField label="What it's for" value={title} onChangeText={setTitle} placeholder="Transport tickets" maxLength={80} />
        <PtField label="Amount" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
        <PtField label="By (optional)" value={due ? formatYmd(due) : ''} placeholder="Pick a date" onPressBox={() => setDateOpen(true)} />
      </PtSheet>
      <PtDateSheet
        visible={dateOpen}
        title="By"
        value={due ?? w.target_date ?? ymdMonthsFromNow(1)}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 10}
        doneLabel="Done"
        onDone={(ymd) => { setDue(ymd); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
      />
    </PtPageScreen>
  );
}
