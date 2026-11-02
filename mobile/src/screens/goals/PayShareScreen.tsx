import React, { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { keys, useSavings, useSavingsActions, useTransfer, useWallet, useWallets } from '../../api/hooks';
import { ApiError } from '../../api/client';
import { useAuth } from '../../store/auth';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtChoiceCard, PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { ordinal } from '../../lib/goalPlan';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long' });

/**
 * GOL-08 Pay my share: this month's share (or two months, or another amount),
 * from which wallet, where the goal lands after it, and "Pay automatically next
 * time · Every 26th".
 */
export function PayShareScreen({ navigation, route }: RootScreenProps<'PayShare'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const goal = useWallet(walletId);
  const savings = useSavings(walletId);
  const wallets = useWallets();
  const transfer = useTransfer();
  const actions = useSavingsActions(walletId);
  const [choice, setChoice] = useState<'one' | 'two' | 'other'>('one');
  const [other, setOther] = useState('');
  const [fromId, setFromId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [auto, setAuto] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const w = goal.data?.wallet;
  const s = savings.data;

  if (!w || !s) {
    return (
      <PtPageScreen title="Pay my share" onBack={() => navigation.goBack()}>
        <LoadingBlock error={goal.error ? (goal.error as Error).message : savings.error ? (savings.error as Error).message : null} onRetry={() => { void goal.refetch(); void savings.refetch(); }} />
      </PtPageScreen>
    );
  }

  // My share: my own auto-save, else the plan's amount, else what would hit the target on time.
  const share = Number(s.me.auto_save?.amount ?? s.plan?.amount ?? s.projection.suggested_amount ?? 0);
  const mine = (wallets.data ?? []).filter((x) => (x.my_role ?? 'owner') === 'owner' && x.status === 'active' && x.id !== walletId && ['main', 'savings', 'spending'].includes(x.type));
  const from = mine.find((x) => x.id === fromId) ?? mine.find((x) => x.type === 'main') ?? mine[0];
  const amount = choice === 'one' ? share : choice === 'two' ? share * 2 : Number(other || 0);
  const target = Number(w.target_amount ?? 0);
  const after = Number(w.balance) + amount;
  const day = s.plan?.day_of_month ?? 26;
  const month = MONTH.format(new Date());
  const enough = from ? Number(from.available ?? from.balance) >= amount : false;

  const pay = (pin: string) => {
    if (!from) return;
    setPinError(null);
    transfer.mutate(
      { from_wallet_id: from.id, amount: String(amount), pin, description: `My share · ${w.name}`, destination: { kind: 'wallet', wallet_id: walletId } },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          void qc.invalidateQueries({ queryKey: keys.savings(walletId) });
          void qc.invalidateQueries({ queryKey: keys.wallet(walletId) });
          const done = () => {
            showAlert('Paid', `${formatNaira(amount)} is in ${w.name}.${auto ? ` Next time it moves by itself on the ${ordinal(day)}.` : ''}`);
            navigation.goBack();
          };
          if (auto && s.plan && !s.me.auto_save) {
            actions.startAutoSave.mutate(
              {
                amount: String(share),
                frequency: s.plan.frequency,
                ...(s.plan.frequency === 'monthly' ? { day_of_month: day } : s.plan.frequency === 'weekly' ? { day_of_week: s.plan.day_of_week ?? 1 } : {}),
                source_wallet_id: from.id,
              },
              { onSettled: done },
            );
          } else done();
        },
        onError: (e) => {
          const err = e as ApiError;
          if (err.errors?.pin) setPinError(err.errors.pin[0]);
          else {
            setPinOpen(false);
            showAlert('Not paid', err.message);
          }
        },
      },
    );
  };

  return (
    <PtPageScreen
      title="Pay my share"
      subtitle={`${w.name}${me?.first_name ? ` · ${me.first_name}` : ''}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={`Pay ${formatNaira(amount)}`} disabled={!from || amount <= 0 || !enough} onPress={() => setPinOpen(true)} />}
    >
      {share > 0 ? (
        <>
          <PtChoiceCard title={formatNaira(share)} subtitle={`${me?.first_name ?? 'Your'}'s share for ${month}`} selected={choice === 'one'} onPress={() => setChoice('one')} />
          <PtChoiceCard title={`${formatNaira(share * 2)} (2 months)`} subtitle="This month and next" selected={choice === 'two'} onPress={() => setChoice('two')} />
        </>
      ) : null}
      <PtChoiceCard title="Other" subtitle="Any amount" selected={choice === 'other'} onPress={() => setChoice('other')} />
      {choice === 'other' ? <PtField label="Amount" prefix="₦" value={groupAmountInput(other)} onChangeText={(t) => setOther(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" /> : null}

      <PtPanel>
        <PtReviewRow label="From" value={from?.name ?? 'No wallet'} sub={from ? `${formatNaira(from.available ?? from.balance)} available` : null} onEdit={mine.length > 1 ? () => setPicking(true) : undefined} />
        <PtReviewRow
          label="After this"
          value={target ? `${formatNaira(after)} of ${formatNaira(target)} · ${Math.min(100, Math.round((after * 100) / target))}%` : formatNaira(after)}
          last
        />
      </PtPanel>
      {from && !enough && amount > 0 ? <PtNote tone="attention">{`${from.name} has ${formatNaira(from.available ?? from.balance)}. Add money or pick another wallet.`}</PtNote> : null}
      {!s.me.auto_save && s.plan ? (
        <PtPanel>
          <PtSwitchRow title="Pay automatically next time" subtitle={s.plan.frequency === 'monthly' ? `Every ${ordinal(day)}` : s.plan.frequency === 'weekly' ? 'Every week' : 'Every day'} value={auto} onChange={setAuto} />
        </PtPanel>
      ) : s.me.auto_save ? (
        <PtNote>{`Your auto-save is on: ${s.me.auto_save.label}. This is extra.`}</PtNote>
      ) : null}

      <PtOptionSheet
        visible={picking}
        title="Pay from"
        options={mine.map((x) => ({ value: x.id, label: `${x.name} · ${formatNaira(x.available ?? x.balance)}` }))}
        value={from?.id ?? null}
        onPick={(id) => { setFromId(id); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
      <PinSheet visible={pinOpen} title="Pay my share" subtitle={w.name} amount={formatNaira(amount)} loading={transfer.isPending || actions.startAutoSave.isPending} error={pinError} onSubmit={pay} onClose={() => setPinOpen(false)} />
    </PtPageScreen>
  );
}
