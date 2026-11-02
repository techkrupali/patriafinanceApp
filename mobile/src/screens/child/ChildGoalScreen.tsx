import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtRing } from '../../components/pt/PtRing';
import { PtNote } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { PinSheet } from '../../components/PinSheet';
import { LoadError } from '../../components/LoadError';
import { useAddToGoal, useChildHome } from '../../api/child';
import { formatMoney, formatNaira, groupAmountInput, parseYmd, sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import { matchLine } from './ChildUi';

function Line({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{label}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 18, color: pt.ink }}>{value}</Text>
    </View>
  );
}

/** CHD-06 My goal: how far, what I saved and what was added, when I'll get there, and Add to my goal. */
export function ChildGoalScreen() {
  const q = useChildHome();
  const add = useAddToGoal();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState(false);
  const h = q.data;
  const g = h?.goal;
  const reach = parseYmd(g?.reach_on);
  const n = parseFloat(amount) || 0;

  return (
    <PtTabScreen title="My goal" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !h ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : !g ? (
        <PtNote tone="info">{`There's no goal yet. Ask ${h.parents[0] ?? 'a parent'} to set one with you.`}</PtNote>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
            <PtRing percent={g.percent} size={170} stroke={16} caption="saved" />
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, color: pt.ink, marginTop: 6 }}>{g.name}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{`${formatNaira(g.saved)} of ${formatNaira(g.target)}`}</Text>
          </View>
          <Line label="You saved" value={formatNaira(g.you_saved)} sub={g.save_percent ? `${formatNaira(g.per_allowance)} from each allowance` : null} />
          <Line label={h.parents.length ? `${h.parents.join(' and ')} and family added` : 'Family added'} value={formatNaira(g.others_added)} sub={matchLine(g, h.parents)?.replace(/^\S+ adds/, 'They add') ?? null} />
          {reach ? <Line label="At this pace" value={`${g.name.split(' ').slice(-1)[0]} by ${reach.getDate()} ${reach.toLocaleDateString('en-GB', { month: 'short' })}`} /> : null}
          <PtButton title="Add to my goal" onPress={() => setOpen(true)} />
        </>
      )}

      <PtSheet visible={open} title="Add to my goal" subtitle={h ? `You have ${formatNaira(h.wallet.balance)}` : undefined} onClose={() => setOpen(false)} footer={<PtButton title={n ? `Add ${formatNaira(n)}` : 'Add'} disabled={!n || n > parseFloat(h?.wallet.balance ?? '0')} onPress={() => setPin(true)} />}>
        <PtField label="How much?" prefix="₦" value={groupAmountInput(amount)} onChangeText={(t) => setAmount(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
      </PtSheet>
      <PinSheet
        visible={pin}
        title="Enter your PIN"
        subtitle={g ? `Save ${formatNaira(n)} for ${g.name}` : undefined}
        amount={formatMoney(String(n))}
        loading={add.isPending}
        error={null}
        onSubmit={(p) =>
          add.mutate(
            { amount: String(n), pin: p },
            {
              onSuccess: () => {
                notifySuccess();
                setPin(false);
                setOpen(false);
                setAmount('');
                showAlert('Saved!', `${formatNaira(n)} is in your goal.`);
              },
              onError: (e) => {
                setPin(false);
                showAlert('Not saved', e.message);
              },
            },
          )
        }
        onClose={() => setPin(false)}
      />
    </PtTabScreen>
  );
}
