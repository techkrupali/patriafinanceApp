import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useAjo, useAjoActions, useCreateAjo, type AjoFrequency } from '../../api/ajo';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { pt } from '../../theme';
import type { RootScreenProps } from '../../navigation/types';

/** The 1st of next month: AJO-01 "Starts 1 Nov 2026". */
const firstOfNextMonth = () => {
  const d = new Date();
  return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 1));
};

/** "ends Oct 2027" for a monthly circle, "ends 15 Mar" for a weekly one. */
export function ajoEnds(startYmd: string, size: number, frequency: AjoFrequency): string {
  const [y, m, d] = startYmd.split('-').map(Number);
  const end = frequency === 'weekly' ? new Date(y, m - 1, d + 7 * (size - 1)) : new Date(y, m - 1 + (size - 1), d);
  return frequency === 'weekly'
    ? end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : end.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/**
 * AJO-01 "New ajo circle · Rotating savings": the name, what each person pays,
 * how many people, weekly or monthly, when it starts and the late fee. With a
 * walletId it is "Edit rules": the money and dates only before it starts.
 */
export function AjoSetupScreen({ navigation, route }: RootScreenProps<'AjoSetup'>) {
  const walletId = route.params?.walletId ?? 0;
  const editing = walletId > 0;
  const existing = useAjo(walletId);
  const create = useCreateAjo();
  const actions = useAjoActions(walletId);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [size, setSize] = useState('12');
  const [frequency, setFrequency] = useState<AjoFrequency>('monthly');
  const [starts, setStarts] = useState(firstOfNextMonth());
  const [fee, setFee] = useState('2000');
  const [days, setDays] = useState(3);
  const [swaps, setSwaps] = useState(true);
  const [sheet, setSheet] = useState<null | 'starts' | 'fee'>(null);
  const [error, setError] = useState<string | null>(null);
  const a = existing.data;
  const forming = !editing || a?.status === 'forming';

  useEffect(() => {
    if (!a) return;
    setName(a.name);
    setAmount(String(Math.round(parseFloat(a.contribution))));
    setSize(String(a.size));
    setFrequency(a.frequency);
    setStarts(a.starts_on);
    setFee(String(Math.round(parseFloat(a.late_fee))));
    setDays(a.late_after_days);
    setSwaps(a.allow_swaps);
  }, [a]);

  if (editing && !a) {
    return (
      <PtPageScreen title="Edit rules" onBack={() => navigation.goBack()}>
        <LoadingBlock error={existing.error ? (existing.error as Error).message : null} onRetry={() => void existing.refetch()} />
      </PtPageScreen>
    );
  }

  const n = Math.max(0, parseInt(size, 10) || 0);
  const each = parseFloat(amount) || 0;
  const payout = each * n;
  const feeLabel = (parseFloat(fee) || 0) > 0 ? `${formatNaira(fee)} after ${days} day${days === 1 ? '' : 's'}` : 'No late fee';
  const ready = name.trim().length > 0 && each >= 500 && n >= 2 && n <= 30;

  const save = () => {
    setError(null);
    if (!ready) {
      setError(n < 2 || n > 30 ? 'A circle has 2 to 30 people.' : each < 500 ? 'Each person pays at least ₦500.' : 'Give the circle a name.');
      return;
    }
    if (editing) {
      actions.update.mutate(
        {
          name: name.trim(),
          late_fee: fee || '0',
          late_after_days: days,
          allow_swaps: swaps,
          ...(forming ? { contribution: amount, size: n, frequency, starts_on: starts } : {}),
        },
        { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e) => setError(e.message) },
      );
      return;
    }
    create.mutate(
      { name: name.trim(), contribution: amount, size: n, frequency, starts_on: starts, late_fee: fee || '0', late_after_days: days, allow_swaps: swaps },
      {
        onSuccess: (res) => {
          notifySuccess();
          navigation.replace('AjoInvite', { walletId: res.ajo.wallet_id });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title={editing ? 'Edit rules' : 'New ajo circle'}
      subtitle={editing ? a?.name : 'Rotating savings'}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton title={editing ? 'Save rules' : 'Continue'} loading={create.isPending || actions.update.isPending} disabled={!ready} onPress={save} />
        </>
      }
    >
      <PtField label="Circle name" value={name} onChangeText={setName} placeholder="Unity ladies ajo" maxLength={60} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PtField
            label="Each person pays"
            prefix="₦"
            value={groupAmountInput(amount)}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            placeholder="50,000"
            keyboardType="decimal-pad"
            editable={forming}
          />
        </View>
        <View style={{ width: 110 }}>
          <PtField label="Members" value={size} onChangeText={(t) => setSize(t.replace(/\D/g, '').slice(0, 2))} placeholder="12" keyboardType="number-pad" maxLength={2} editable={forming} />
        </View>
      </View>
      {forming ? (
        <PtSegmented
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
          ]}
          value={frequency}
          onChange={(v) => setFrequency(v as AjoFrequency)}
        />
      ) : null}
      <PtPanel>
        <PtReviewRow label="Each payout" value={formatNaira(payout)} sub={`${n} × ${formatNaira(each)}, once a ${frequency === 'weekly' ? 'week' : 'month'}`} />
        <PtReviewRow
          label="Starts"
          value={n >= 2 ? `${formatYmd(starts)}, ends ${ajoEnds(starts, n, frequency)}` : formatYmd(starts)}
          onEdit={forming ? () => setSheet('starts') : undefined}
        />
        <PtReviewRow label="Late fee" value={feeLabel} onEdit={() => setSheet('fee')} last={!editing} />
        {editing ? <PtSwitchRow title="Allow members to swap turns" subtitle="Both people must agree" value={swaps} onChange={setSwaps} /> : null}
      </PtPanel>
      {editing && !forming ? <PtNote>The amount, people and dates are set once the circle starts.</PtNote> : null}
      <PtNote icon="lock">Patriai holds the pot and pays out on the day. Everyone must be verified to join.</PtNote>

      <PtDateSheet
        visible={sheet === 'starts'}
        title="Starts"
        value={starts}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 1}
        doneLabel="Done"
        onDone={(v) => {
          if (v < toYmd(new Date())) {
            setError('Pick today or a day after.');
          } else {
            setStarts(v);
            setError(null);
          }
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <PtSheet visible={sheet === 'fee'} title="Late fee" subtitle="It goes into that round's pot" onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
        <PtField label="Fee" prefix="₦" value={groupAmountInput(fee)} onChangeText={(t) => setFee(sanitizeAmountInput(t))} placeholder="2,000" keyboardType="decimal-pad" />
        <PtGroupLabel>Added after</PtGroupLabel>
        <PtPills options={[1, 2, 3].map((d) => ({ value: d, label: `${d} day${d === 1 ? '' : 's'}` }))} value={days} onChange={setDays} />
      </PtSheet>
    </PtPageScreen>
  );
}
